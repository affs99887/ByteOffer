// lib/server/services/questionService.ts
// Question application service — one of the ONLY layers that touches Prisma (architecture §1).
// Reads/writes go through the mirror columns for filtering; the authoritative record lives in
// payload. List projections EXCLUDE payload/media base64 for perf (§10). Admin CRUD routes
// every record through the SAME validateEnvelope single-record path that import uses, so the
// two validators can never drift (§5.4 "关闭缺口").

import { validateEnvelope } from "@/lib/qbank/validate";
import { FORMAT_ID, SCHEMA_VERSION } from "@/lib/qbank/types";
import type { QuestionRecord } from "@/lib/qbank/types";
import { prisma } from "@/lib/server/db";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import { questionRowFromRecord, recordFromRow, stripAnswerKey } from "@/lib/server/qbank/mapping";
import type { PublicQuestion } from "@/lib/server/qbank/mapping";
import { syncTags } from "@/lib/server/qbank/tags";
import type {
  Difficulty,
  Prisma,
  Question,
  QuestionStatus,
  QuestionType,
} from "@prisma/client";

/** List projection: the filter/search face only — NO payload / media base64 (§10). */
export interface QuestionCard {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  stemText: string;
  tagsFlat: string[];
  status: QuestionStatus;
}

const CARD_SELECT = {
  id: true,
  type: true,
  difficulty: true,
  stemText: true,
  tagsFlat: true,
  status: true,
} satisfies Prisma.QuestionSelect;

export interface ListParams {
  bankId?: string;
  types?: QuestionType[];
  difficulty?: Difficulty;
  tags?: string[];
  status?: QuestionStatus;
  cursor?: string;
  take?: number;
  /** Admin callers may pass true to see all statuses; otherwise defaults to published-only. */
  includeAllStatuses?: boolean;
}

export interface ListResult {
  items: QuestionCard[];
  nextCursor: string | null;
}

const DEFAULT_TAKE = 20;
const MAX_TAKE = 100;

/**
 * list — cursor-paginated Question query via mirror columns. Non-admin callers get
 * published-only (default). Returns list projections without payload/media.
 */
export async function list(params: ListParams): Promise<ListResult> {
  const take = Math.min(Math.max(params.take ?? DEFAULT_TAKE, 1), MAX_TAKE);

  const where: Prisma.QuestionWhereInput = {};
  if (params.bankId) where.bankId = params.bankId;
  if (params.types && params.types.length > 0) where.type = { in: params.types };
  if (params.difficulty) where.difficulty = params.difficulty;
  if (params.tags && params.tags.length > 0) where.tagsFlat = { hasSome: params.tags };

  // Status: explicit filter wins; else admin sees all, non-admin is forced to published.
  if (params.status) {
    where.status = params.status;
  } else if (!params.includeAllStatuses) {
    where.status = "published";
  }

  const rows = await prisma.question.findMany({
    where,
    select: CARD_SELECT,
    orderBy: { id: "asc" },
    take: take + 1, // fetch one extra to compute nextCursor
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { items, nextCursor };
}

export interface ListPublicResult {
  items: PublicQuestion[];
  nextCursor: string | null;
}

/**
 * listPublicForPractice — the SECURE practice bank source (§5.4). Same query as `list`
 * (published-only, same filters, same cursor pagination), but returns FULL records run through
 * recordFromRow → stripAnswerKey, i.e. client-safe PublicQuestion[] with the answer key AND
 * explanation removed at every level (incl. scenario parts). Quarantined (bad-payload) rows are
 * dropped. Unlike `list` (bare cards for filtering), this carries stem+options+items+blank shells
 * so the client can RENDER the prompt — minus the keys. Grading/reveal for these questions comes
 * from the server submit response, NEVER from a local grade() on this stripped record.
 */
export async function listPublicForPractice(params: ListParams): Promise<ListPublicResult> {
  const take = Math.min(Math.max(params.take ?? DEFAULT_TAKE, 1), MAX_TAKE);

  // Reuse the exact filter logic from `list` (mirror columns). Published-only for non-admin.
  const where: Prisma.QuestionWhereInput = {};
  if (params.bankId) where.bankId = params.bankId;
  if (params.types && params.types.length > 0) where.type = { in: params.types };
  if (params.difficulty) where.difficulty = params.difficulty;
  if (params.tags && params.tags.length > 0) where.tagsFlat = { hasSome: params.tags };
  if (params.status) {
    where.status = params.status;
  } else if (!params.includeAllStatuses) {
    where.status = "published";
  }

  // Full rows (incl. payload) — we need the record to render + strip. Over-fetch one to compute
  // nextCursor. Quarantined rows are dropped without shifting the cursor window semantics (the
  // cursor is the last SURVIVING row's id, matching `list`'s id-ordered pagination).
  const rows = await prisma.question.findMany({
    where,
    orderBy: { id: "asc" },
    take: take + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  const items: PublicQuestion[] = [];
  for (const row of page) {
    const rec = recordFromRow(row);
    if (rec) items.push(stripAnswerKey(rec));
  }

  const nextCursor = hasMore ? page[page.length - 1].id : null;
  return { items, nextCursor };
}

/**
 * countPublished — the real number of PUBLISHED questions: the authoritative bank total for the
 * home/qbank KPIs (replacing the hardcoded 8642 / state.bank.length). Non-admin visibility rule:
 * published-only. A throw here means no DB; the RSC caller wraps this in try/catch and degrades to 0.
 */
export async function countPublished(): Promise<number> {
  return prisma.question.count({ where: { status: "published" } });
}

/** One category row: the first-tag label (tagsFlat[0] taxonomy) + its published-question count. */
export interface CategoryCount {
  name: string;
  count: number;
}

/**
 * categoryOverview — published-question counts grouped by CATEGORY = the FIRST tag of each question
 * (tagsFlat[0] convention, the SAME taxonomy statsService.categoryMastery keys on). Postgres arrays
 * are 1-indexed, so tagsFlat[1] is the first element; rows with an empty tagsFlat are skipped.
 * Ordered by count desc (ties by name), capped to 12. Empty array when the bank is empty. Raw SQL
 * over "Question" (the mirror table) — the array subscript + group has no Prisma groupBy equivalent.
 * COUNT is cast ::int so it crosses the RSC/action boundary as a plain number (a bigint would not
 * serialize).
 */
export async function categoryOverview(): Promise<CategoryCount[]> {
  return prisma.$queryRaw<CategoryCount[]>`
    SELECT "tagsFlat"[1] AS name, COUNT(*)::int AS count
    FROM "Question"
    WHERE status = 'published' AND array_length("tagsFlat", 1) >= 1
    GROUP BY "tagsFlat"[1]
    ORDER BY count DESC, name ASC
    LIMIT 12
  `;
}

/** One section bucket of the browse tree: the section label + its published-question count. */
export interface BrowseSection {
  section: string;
  count: number;
}
/** One chapter bucket: the chapter label, its rolled-up count, and its sections (count desc). */
export interface BrowseChapter {
  chapter: string;
  count: number;
  sections: BrowseSection[];
}
/** The full data-driven browse tree (chapters → sections) + the published grand total. */
export interface BrowseStructure {
  chapters: BrowseChapter[];
  total: number;
}

/**
 * browseStructure — the DATA-DRIVEN 章节→小节 tree for the merged 题库/模拟面试 hub (V2). Groups every
 * PUBLISHED question by its mirror columns (chapter, then section); the tree is derived entirely from
 * what the imported questions declare — chapter names/counts are NEVER hardcoded. Null chapter buckets
 * as "未分类", null section as "综合" (COALESCE, so every published row lands in exactly one leaf → the
 * summed leaf counts equal the published total). COUNT is cast ::int so it crosses the RSC/action
 * boundary as a plain number (a bigint would not serialize). Raw SQL over "Question" (default Prisma
 * identifiers) — the two-level COALESCE group has no clean Prisma groupBy equivalent.
 *
 * Ordering is deterministic: the SQL streams rows chapter-alphabetical (so the Map's first-seen order,
 * and thus tie-breaks, are stable), then JS stable-sorts chapters by rolled-up count desc and each
 * chapter's sections by count desc. Empty bank → { chapters: [], total: 0 }. A throw here means no DB;
 * the RSC caller wraps this in try/catch and degrades to an empty tree.
 */
export async function browseStructure(): Promise<BrowseStructure> {
  const rows = await prisma.$queryRaw<{ chapter: string; section: string; count: number }[]>`
    SELECT
      COALESCE("chapter", '未分类') AS chapter,
      COALESCE("section", '综合')   AS section,
      COUNT(*)::int                 AS count
    FROM "Question"
    WHERE status = 'published'
    GROUP BY COALESCE("chapter", '未分类'), COALESCE("section", '综合')
    ORDER BY chapter ASC, count DESC, section ASC
  `;

  // Fold the flat (chapter, section, count) rows into the nested tree. Map insertion order follows
  // the SQL stream (chapter-alphabetical), giving stable tie-breaks under the count-desc sorts below.
  const byChapter = new Map<string, BrowseChapter>();
  let total = 0;
  for (const r of rows) {
    total += r.count;
    let ch = byChapter.get(r.chapter);
    if (!ch) {
      ch = { chapter: r.chapter, count: 0, sections: [] };
      byChapter.set(r.chapter, ch);
    }
    ch.count += r.count;
    ch.sections.push({ section: r.section, count: r.count });
  }

  const chapters = [...byChapter.values()];
  for (const ch of chapters) ch.sections.sort((a, b) => b.count - a.count);
  chapters.sort((a, b) => b.count - a.count);

  return { chapters, total };
}

/** getPublishedRow — full row incl payload. Throws NotFoundError if not published (§5.5). */
export async function getPublishedRow(id: string): Promise<Question> {
  const row = await prisma.question.findFirst({ where: { id, status: "published" } });
  if (!row) throw new NotFoundError();
  return row;
}

/** getRowForAdmin — full row incl payload, any status. Throws NotFoundError if missing. */
export async function getRowForAdmin(id: string): Promise<Question> {
  const row = await prisma.question.findUnique({ where: { id } });
  if (!row) throw new NotFoundError();
  return row;
}

/**
 * listRowsForBankExport — all full rows (incl payload) for a bank, for admin export/round-trip.
 * Ordered by id for a deterministic envelope. Admin-only (called from the export route handler).
 */
export async function listRowsForBankExport(bankId: string): Promise<Question[]> {
  return prisma.question.findMany({ where: { bankId }, orderBy: { id: "asc" } });
}

/**
 * validateSingleRecord — the SHARED deep validator for admin CRUD (§5.4). Wraps the record in a
 * minimal envelope and runs validateEnvelope (the same authority import uses). Returns the
 * normalized/accepted record; throws ValidationError with per-issue fields on any error.
 */
export function validateSingleRecord(record: unknown): QuestionRecord {
  const envelope = {
    format: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    questions: [record],
  };
  const report = validateEnvelope(envelope);

  if (!report.fileOk || report.accepted.length !== 1) {
    const fields: Record<string, string> = {};
    for (const e of report.envelopeIssues) {
      if (e.level === "error") fields[e.path] = e.msg;
    }
    for (const r of report.records) {
      for (const iss of r.issues) {
        if (iss.level === "error") fields[iss.path] = iss.msg;
      }
    }
    throw new ValidationError("题目校验未通过", Object.keys(fields).length ? fields : undefined);
  }

  return report.accepted[0];
}

/**
 * create — validate (shared path) → row + write → syncTags, in one transaction.
 * New admin-authored questions land in `draft` (publish workflow, §5.5).
 */
export async function create(
  record: unknown,
  bankId: string,
  authorId: string,
): Promise<{ id: string }> {
  const rec = validateSingleRecord(record);
  const row = questionRowFromRecord(rec, bankId, { status: "draft", authorId });

  await prisma.$transaction(async (tx) => {
    await tx.question.create({ data: row });
    await syncTags(tx, rec.id, rec.tags);
  });

  return { id: rec.id };
}

/**
 * update — validate (shared path) → row + write (last-wins) → syncTags. The record's id must
 * match the target id (mass-assignment guard); bank is preserved from the existing row.
 */
export async function update(id: string, record: unknown): Promise<{ ok: true }> {
  const rec = validateSingleRecord(record);
  if (rec.id !== id) {
    throw new ValidationError("记录 id 与目标 id 不一致", { id: "id 不匹配" });
  }

  const existing = await prisma.question.findUnique({ where: { id }, select: { bankId: true } });
  if (!existing) throw new NotFoundError();

  const row = questionRowFromRecord(rec, existing.bankId);

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id },
      data: {
        type: row.type,
        difficulty: row.difficulty,
        gradingClass: row.gradingClass,
        stemText: row.stemText,
        tagsFlat: row.tagsFlat,
        chapter: row.chapter,
        section: row.section,
        payload: row.payload,
        schemaVersion: row.schemaVersion,
      },
    });
    await syncTags(tx, id, rec.tags);
  });

  return { ok: true };
}

/** remove — hard delete a question (attempts/progress/etc. cascade per schema). */
export async function remove(id: string): Promise<{ ok: true }> {
  await prisma.question.delete({ where: { id } });
  return { ok: true };
}

/**
 * setStatus — publish-workflow transition (§5.5). Sets publishedAt when moving to published.
 */
export async function setStatus(id: string, status: QuestionStatus): Promise<{ ok: true }> {
  await prisma.question.update({
    where: { id },
    data: {
      status,
      ...(status === "published" ? { publishedAt: new Date() } : {}),
    },
  });
  return { ok: true };
}

/**
 * bulkPublish — approve a set of ids: status → published + publishedAt (§5.5). Returns the
 * number of rows actually transitioned (updateMany count).
 */
export async function bulkPublish(ids: string[]): Promise<{ published: number }> {
  const res = await prisma.question.updateMany({
    where: { id: { in: ids } },
    data: { status: "published", publishedAt: new Date() },
  });
  return { published: res.count };
}

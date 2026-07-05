// lib/server/services/libraryService.ts
// Wrongbook / favorites / recent library reads + mutations (architecture §4.2, §7.4). One of the
// ONLY layers touching Prisma. EVERY query is ownership-scoped with where:{ userId } (IDOR kill,
// §3.2 layer 3). Rows are projected to the EXISTING ListItem shape via toListItem(), bridging
// ASCII enums → Chinese labels (TYPE_LABEL/DIFF_LABEL, §6.3) and formatting dates.

import { DIFF_LABEL, TYPE_LABEL } from "@/lib/qbank/enums";
import { fmtDate } from "@/lib/qbank/format";
import { prisma } from "@/lib/server/db";
import { NotFoundError } from "@/lib/server/errors";
import { emitAnalytics } from "@/lib/server/services/attemptService";
import type { ListItem } from "@/lib/data";
import type { Difficulty, Prisma, QuestionType } from "@prisma/client";

const DEFAULT_TAKE = 20;

export interface ListItemsResult {
  items: ListItem[];
  nextCursor: string | null;
}

/** The Question fields needed to project a ListItem (no payload / media base64, §10). */
interface QuestionProjection {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  stemText: string;
  tagsFlat: string[];
}

/** Progress-ish fields used by ListItem (wrongCount + a last-activity date). */
interface ProgressLike {
  wrongCount?: number;
  lastAt?: Date | null;
}

/**
 * toListItem — project a Question (+ optional progress) to the existing ListItem shape (§7.4).
 * Maps ASCII enums to Chinese via TYPE_LABEL/DIFF_LABEL and formats the last-activity date.
 */
export function toListItem(q: QuestionProjection, p?: ProgressLike): ListItem {
  return {
    id: q.id,
    type: TYPE_LABEL[q.type],
    diff: DIFF_LABEL[q.difficulty],
    q: q.stemText,
    tags: q.tagsFlat,
    wrong: p?.wrongCount ?? 0,
    last: p?.lastAt ? fmtDate(p.lastAt.getTime()) : "",
  };
}

const QUESTION_SELECT = {
  id: true,
  type: true,
  difficulty: true,
  stemText: true,
  tagsFlat: true,
} as const;

/**
 * listWrongbook — the user's wrongbook entries (ownership-scoped), newest-wrong first, cursor
 * -paginated. Optional `mastered` filter. Joins the Question projection for the ListItem.
 */
export async function listWrongbook(params: {
  userId: string;
  cursor?: string;
  mastered?: boolean;
}): Promise<ListItemsResult> {
  const { userId, cursor, mastered } = params;
  const take = DEFAULT_TAKE;

  const where: Prisma.WrongbookEntryWhereInput = { userId };
  if (mastered !== undefined) where.mastered = mastered;

  const rows = await prisma.wrongbookEntry.findMany({
    where,
    include: { question: { select: QUESTION_SELECT } },
    orderBy: [{ lastWrongAt: "desc" }, { questionId: "asc" }],
    take: take + 1,
    ...(cursor ? { cursor: { userId_questionId: { userId, questionId: cursor } }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const items = page.map((r) =>
    toListItem(r.question, { wrongCount: r.wrongCount, lastAt: r.lastWrongAt }),
  );
  const nextCursor = hasMore ? page[page.length - 1].questionId : null;

  return { items, nextCursor };
}

/**
 * masterWrong — mark a wrongbook entry mastered (ownership-scoped update). Uses updateMany with
 * where:{ userId, questionId } so a mismatched userId simply affects 0 rows (no IDOR). Throws
 * NotFound when the entry does not exist for this user.
 */
export async function masterWrong(params: {
  userId: string;
  questionId: string;
}): Promise<{ ok: true }> {
  const { userId, questionId } = params;
  const res = await prisma.wrongbookEntry.updateMany({
    where: { userId, questionId },
    data: { mastered: true },
  });
  if (res.count === 0) throw new NotFoundError();

  await prisma.analyticsEvent
    .create({ data: { userId, name: "wrongbook.mastered", props: { questionId } } })
    .catch(() => undefined);

  return { ok: true };
}

/**
 * toggleFavorite — add/remove a favorite (ownership-scoped). Returns the resulting state.
 * Delete-if-present else create, in a transaction so the toggle is atomic.
 */
export async function toggleFavorite(params: {
  userId: string;
  questionId: string;
}): Promise<{ fav: boolean }> {
  const { userId, questionId } = params;

  const fav = await prisma.$transaction(async (tx) => {
    const existing = await tx.favorite.findUnique({
      where: { userId_questionId: { userId, questionId } },
      select: { userId: true },
    });
    if (existing) {
      await tx.favorite.delete({ where: { userId_questionId: { userId, questionId } } });
      return false;
    }
    // Guard: the question must exist (FK). A missing question surfaces as NotFound.
    const q = await tx.question.findUnique({ where: { id: questionId }, select: { id: true } });
    if (!q) throw new NotFoundError();
    await tx.favorite.create({ data: { userId, questionId } });
    await emitAnalytics(tx, userId, "favorite.added", { questionId });
    return true;
  });

  return { fav };
}

/**
 * listFavorites — the user's favorites (ownership-scoped), newest-first, cursor-paginated. Joins
 * the Question projection + Progress (for the wrong/last columns) into a ListItem.
 */
export async function listFavorites(params: {
  userId: string;
  cursor?: string;
}): Promise<ListItemsResult> {
  const { userId, cursor } = params;
  const take = DEFAULT_TAKE;

  const rows = await prisma.favorite.findMany({
    where: { userId },
    include: { question: { select: QUESTION_SELECT } },
    orderBy: [{ createdAt: "desc" }, { questionId: "asc" }],
    take: take + 1,
    ...(cursor ? { cursor: { userId_questionId: { userId, questionId: cursor } }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  // Pull progress for the wrong/last columns in one query.
  const qids = page.map((r) => r.questionId);
  const progress = await prisma.progress.findMany({
    where: { userId, questionId: { in: qids } },
    select: { questionId: true, wrongCount: true, lastAt: true },
  });
  const pByQ = new Map(progress.map((p) => [p.questionId, p]));

  const items = page.map((r) =>
    toListItem(r.question, {
      wrongCount: pByQ.get(r.questionId)?.wrongCount ?? 0,
      lastAt: pByQ.get(r.questionId)?.lastAt ?? null,
    }),
  );
  const nextCursor = hasMore ? page[page.length - 1].questionId : null;

  return { items, nextCursor };
}

/**
 * listRecent — recently-practiced questions (ownership-scoped), by Progress.lastAt desc,
 * cursor-paginated (cursor is the questionId of the last item; the composite key orders it).
 * The `last` column shows a formatted last-activity date.
 */
export async function listRecent(params: {
  userId: string;
  cursor?: string;
}): Promise<ListItemsResult> {
  const { userId, cursor } = params;
  const take = DEFAULT_TAKE;

  const rows = await prisma.progress.findMany({
    where: { userId, lastAt: { not: null } },
    include: { question: { select: QUESTION_SELECT } },
    orderBy: [{ lastAt: "desc" }, { questionId: "asc" }],
    take: take + 1,
    ...(cursor ? { cursor: { userId_questionId: { userId, questionId: cursor } }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const items = page.map((r) =>
    toListItem(r.question, { wrongCount: r.wrongCount, lastAt: r.lastAt }),
  );
  const nextCursor = hasMore ? page[page.length - 1].questionId : null;

  return { items, nextCursor };
}

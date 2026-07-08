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
import { chapterFilterValue } from "@/lib/server/services/questionService";
import type { ListItem } from "@/lib/data";
import type { Difficulty, Prisma, QuestionType } from "@prisma/client";

const DEFAULT_TAKE = 20;

/**
 * A library list row: the existing ListItem PLUS this user's favorite state for the question, so
 * the wrongbook/recent/favorites screens can render an accurate star without a second round-trip
 * (§7.4). fav is joined from the Favorite table for the page's ids (one batched query, no N+1).
 */
export interface LibraryListItem extends ListItem {
  fav: boolean;
  /**
   * Chapter/section of the underlying question (the data-driven browse tree, V2) — selected from the
   * joined question's mirror columns so the wrongbook/favorites/recent screens can render the tree
   * label and filter/launch review sessions by chapter. Null when the imported question left the
   * column unset (browseStructure buckets those as 未分类/综合). OPTIONAL so the existing
   * ListItem-shaped callers keep compiling; every row this service returns sets both.
   */
  chapter?: string | null;
  section?: string | null;
}

export interface ListItemsResult {
  items: LibraryListItem[];
  nextCursor: string | null;
}

/**
 * favoritedSet — the subset of `questionIds` this user has favorited, as a Set for O(1) lookup.
 * One batched query for the whole page (no N+1). Empty in → empty out (no query).
 */
async function favoritedSet(userId: string, questionIds: string[]): Promise<Set<string>> {
  if (questionIds.length === 0) return new Set();
  const favs = await prisma.favorite.findMany({
    where: { userId, questionId: { in: questionIds } },
    select: { questionId: true },
  });
  return new Set(favs.map((f) => f.questionId));
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
  // V2 browse-tree mirror columns — carried onto every list row (no N+1: part of the same join).
  chapter: true,
  section: true,
} as const;

/**
 * listWrongbook — the user's wrongbook entries (ownership-scoped), newest-wrong first, cursor
 * -paginated. Honors the optional `mastered` filter (true → only mastered, false → only unmastered,
 * omitted → all). Joins the Question projection for the ListItem and the Favorite table (batched)
 * so each row carries an accurate `fav`.
 */
export async function listWrongbook(params: {
  userId: string;
  cursor?: string;
  mastered?: boolean;
  chapter?: string;
}): Promise<ListItemsResult> {
  const { userId, cursor, mastered, chapter } = params;
  const take = DEFAULT_TAKE;

  const where: Prisma.WrongbookEntryWhereInput = { userId };
  if (mastered !== undefined) where.mastered = mastered;
  // Optional V2 browse filter: restrict to one chapter via the joined question's mirror column. It
  // is a relation filter on the SAME findMany (no extra round-trip / no N+1).
  // 未分类 sentinel → IS NULL, so a null-chapter bucket the browse tree shows is actually filterable.
  if (chapter) where.question = { chapter: chapterFilterValue(chapter) };

  const rows = await prisma.wrongbookEntry.findMany({
    where,
    include: { question: { select: QUESTION_SELECT } },
    orderBy: [{ lastWrongAt: "desc" }, { questionId: "asc" }],
    take: take + 1,
    ...(cursor ? { cursor: { userId_questionId: { userId, questionId: cursor } }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const favSet = await favoritedSet(userId, page.map((r) => r.questionId));
  const items: LibraryListItem[] = page.map((r) => ({
    ...toListItem(r.question, { wrongCount: r.wrongCount, lastAt: r.lastWrongAt }),
    fav: favSet.has(r.questionId),
    chapter: r.question.chapter ?? null,
    section: r.question.section ?? null,
  }));
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
 * the Question projection + Progress (for the wrong/last columns) into a ListItem. Every row is a
 * favorite here, so `fav` is true by definition (no extra Favorite query needed).
 */
export async function listFavorites(params: {
  userId: string;
  cursor?: string;
  chapter?: string;
}): Promise<ListItemsResult> {
  const { userId, cursor, chapter } = params;
  const take = DEFAULT_TAKE;

  const where: Prisma.FavoriteWhereInput = { userId };
  // Optional V2 browse filter: same-join relation filter on the favorited question's chapter.
  // 未分类 sentinel → IS NULL, so a null-chapter bucket the browse tree shows is actually filterable.
  if (chapter) where.question = { chapter: chapterFilterValue(chapter) };

  const rows = await prisma.favorite.findMany({
    where,
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

  const items: LibraryListItem[] = page.map((r) => ({
    ...toListItem(r.question, {
      wrongCount: pByQ.get(r.questionId)?.wrongCount ?? 0,
      lastAt: pByQ.get(r.questionId)?.lastAt ?? null,
    }),
    fav: true,
    chapter: r.question.chapter ?? null,
    section: r.question.section ?? null,
  }));
  const nextCursor = hasMore ? page[page.length - 1].questionId : null;

  return { items, nextCursor };
}

/**
 * listRecent — recently-practiced questions (ownership-scoped), by Progress.lastAt desc,
 * cursor-paginated (cursor is the questionId of the last item; the composite key orders it).
 * The `last` column shows a formatted last-activity date. Joins the Favorite table (batched) so
 * each row carries an accurate `fav`.
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
  const favSet = await favoritedSet(userId, page.map((r) => r.questionId));
  const items: LibraryListItem[] = page.map((r) => ({
    ...toListItem(r.question, { wrongCount: r.wrongCount, lastAt: r.lastAt }),
    fav: favSet.has(r.questionId),
    chapter: r.question.chapter ?? null,
    section: r.question.section ?? null,
  }));
  const nextCursor = hasMore ? page[page.length - 1].questionId : null;

  return { items, nextCursor };
}

// ============================================================
//  Scope gatherers (V2) — the session engine consumes these to seed a SHUFFLED, type-clustered,
//  frozen review session from the user's library. They define MEMBERSHIP only (bare id[]); the
//  engine does the Fisher-Yates shuffle + type clustering + freeze. Both are ownership-scoped
//  (where:{ userId } — IDOR kill §3.2) and PUBLISHED-only (a since-unpublished question must not
//  enter a new session), with an optional chapter narrow matching the browse tree. No cursor: a
//  session gather reads the whole scope in one query.
// ============================================================

/**
 * wrongQuestionIds — published question ids in the user's UNMASTERED wrongbook, optionally restricted
 * to one chapter. Ordered newest-wrong first for a deterministic base order (the engine reshuffles).
 */
export async function wrongQuestionIds(params: {
  userId: string;
  chapter?: string;
}): Promise<string[]> {
  const { userId, chapter } = params;
  const rows = await prisma.wrongbookEntry.findMany({
    where: {
      userId,
      mastered: false,
      question: { status: "published", ...(chapter ? { chapter: chapterFilterValue(chapter) } : {}) },
    },
    select: { questionId: true },
    orderBy: [{ lastWrongAt: "desc" }, { questionId: "asc" }],
  });
  return rows.map((r) => r.questionId);
}

/**
 * favoriteQuestionIds — published question ids this user has favorited, optionally restricted to one
 * chapter. Ordered newest-favorite first for a deterministic base order (the engine reshuffles).
 */
export async function favoriteQuestionIds(params: {
  userId: string;
  chapter?: string;
}): Promise<string[]> {
  const { userId, chapter } = params;
  const rows = await prisma.favorite.findMany({
    where: {
      userId,
      question: { status: "published", ...(chapter ? { chapter: chapterFilterValue(chapter) } : {}) },
    },
    select: { questionId: true },
    orderBy: [{ createdAt: "desc" }, { questionId: "asc" }],
  });
  return rows.map((r) => r.questionId);
}

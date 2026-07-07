// lib/server/services/sessionService.ts
// Practice + exam session orchestration (architecture §4.2 Sessions rows, §5.4, §8.3). One of
// the ONLY layers touching Prisma. Every question the client receives is run through
// stripAnswerKey (answer key + explanation removed, incl. scenario parts) — the load-bearing
// abuse-surface control (§5.4). Exam grading is server-authoritative and DEFERRED to submitExam;
// saveExamAnswer never reveals grading and keeps remainingSec monotonically decreasing.
//
// EXAM ANSWER PERSISTENCE (must survive refresh, must NOT reveal grading):
//   Saved answers are stored as ungraded Attempt rows (status:"ungraded", score:null) scoped to
//   (sessionId, questionId). There is no DB unique on (session,question), so save = find-then
//   -update-or-create the single ungraded row for that pair. On submitExam these ungraded rows
//   are replaced/promoted to graded results in one transaction. No score leaks before submit.
//
// remainingSec MONOTONICITY:
//   On every save we set StudySession.remainingSec = min(existing ?? incoming, incoming) — the
//   clock can only ever go DOWN (§8.3 anti-cheat). The client interval is UX-only; the server
//   value is authoritative for the deadline check in submitExam.

import { grade } from "@/lib/qbank/grade";
import type { GradeResult, QuestionRecord } from "@/lib/qbank/types";
import { prisma } from "@/lib/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/server/errors";
import { recordFromRow, revealKey, stripAnswerKey } from "@/lib/server/qbank/mapping";
import type { AnswerReveal, PublicQuestion } from "@/lib/server/qbank/mapping";
import {
  upsertDailyStat,
  upsertProgress,
  upsertWrongbook,
  emitAnalytics,
} from "@/lib/server/services/attemptService";
import type { PracticeFilters } from "@/lib/validation/exam";
import type { AttemptStatus, GradingClass, Prisma, QuestionType } from "@prisma/client";
import type { UserAnswer } from "@/lib/qbank/types";

// Default exam duration: 60 minutes. (Server deadline basis; the client mirror is UX-only.)
const DEFAULT_EXAM_DURATION_SEC = 60 * 60;

/** Compact metadata about a question (safe to send — no key). */
export interface QuestionMeta {
  id: string;
  type: QuestionType;
  difficulty: string;
  tags: string[];
}

function metaFromRecord(rec: QuestionRecord): QuestionMeta {
  return { id: rec.id, type: rec.type as QuestionType, difficulty: rec.difficulty, tags: rec.tags };
}

/** Build a Prisma where for published questions matching the practice filters (mirror columns). */
function publishedWhere(filters?: PracticeFilters): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = { status: "published" };
  if (filters?.bankId) where.bankId = filters.bankId;
  if (filters?.types && filters.types.length > 0) where.type = { in: filters.types };
  if (filters?.difficulty) where.difficulty = filters.difficulty;
  if (filters?.tags && filters.tags.length > 0) where.tagsFlat = { hasSome: filters.tags };
  return where;
}

/**
 * pickPublishedRecord — the first published record matching `where`, after an optional `cursor`
 * (id to advance past). Skips quarantined (bad-payload) rows by advancing until a record
 * migrates cleanly. Returns null when the filter set is exhausted.
 */
async function pickPublishedRecord(
  where: Prisma.QuestionWhereInput,
  cursor?: string,
): Promise<QuestionRecord | null> {
  // Fetch a small page after the cursor; loop past any quarantined rows.
  const rows = await prisma.question.findMany({
    where,
    orderBy: { id: "asc" },
    take: 25,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  for (const row of rows) {
    const rec = recordFromRow(row);
    if (rec) return rec;
  }
  return null;
}

// ============================================================
//  Practice
// ============================================================

export interface StartPracticeResult {
  sessionId: string;
  firstQuestion: PublicQuestion | null;
  questionMeta: QuestionMeta | null;
}

/**
 * startPractice — create a practice StudySession with the frozen filter snapshot, then return the
 * first matching published question (key-stripped) + its meta. firstQuestion is null when no
 * question matches the filters (the session is still created so the client has an id).
 */
export async function startPractice(params: {
  userId: string;
  filters?: PracticeFilters;
}): Promise<StartPracticeResult> {
  const { userId, filters } = params;

  const session = await prisma.studySession.create({
    data: {
      userId,
      mode: "practice",
      status: "active",
      bankId: filters?.bankId ?? null,
      filters: (filters ?? {}) as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  const rec = await pickPublishedRecord(publishedWhere(filters));

  return {
    sessionId: session.id,
    firstQuestion: rec ? stripAnswerKey(rec) : null,
    questionMeta: rec ? metaFromRecord(rec) : null,
  };
}

export interface PracticeBatchResult {
  questions: PublicQuestion[];
  nextCursor: string | null;
}

/**
 * getPracticeQuestions — a BATCH of the next published questions for a practice flow (backs
 * getQuestionForPracticeAction, replacing the old single-question shape). If a sessionId is given
 * (and owned by the user) its FROZEN filter snapshot is reused; otherwise ad-hoc `filters` apply.
 * `cursor` is the last question id to advance past; `take` bounds the page (clamped 1..50). Returns
 * up to `take` key-STRIPPED questions in id order + a nextCursor.
 *
 * Cursor semantics mirror questionService.listPublicForPractice: over-fetch one row past `take`,
 * drop quarantined (bad-payload) rows from the page, but base nextCursor on the raw page window —
 * so the cursor always advances past any quarantined rows and paging can never loop.
 */
export async function getPracticeQuestions(params: {
  userId: string;
  sessionId?: string;
  filters?: PracticeFilters;
  cursor?: string;
  take: number;
}): Promise<PracticeBatchResult> {
  const { userId, sessionId, cursor } = params;
  const take = Math.min(Math.max(params.take, 1), 50);
  let filters = params.filters;

  if (sessionId) {
    const session = await prisma.studySession.findFirst({
      where: { id: sessionId, userId },
      select: { filters: true },
    });
    if (!session) throw new NotFoundError();
    if (session.filters && typeof session.filters === "object") {
      filters = session.filters as unknown as PracticeFilters;
    }
  }

  const rows = await prisma.question.findMany({
    where: publishedWhere(filters),
    orderBy: { id: "asc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  const questions: PublicQuestion[] = [];
  for (const row of page) {
    const rec = recordFromRow(row);
    if (rec) questions.push(stripAnswerKey(rec));
  }

  const nextCursor = hasMore ? page[page.length - 1].id : null;
  return { questions, nextCursor };
}

// ============================================================
//  Exam
// ============================================================

export interface StartExamResult {
  sessionId: string;
  questionIds: string[];
  questions: PublicQuestion[];
  durationSec: number;
  remainingSec: number;
}

/**
 * startExam — freeze an ordered set of published question ids into an exam StudySession and
 * return the key-STRIPPED questions (§5.4: exam keys/explanations are withheld until submitExam).
 * `count` bounds the set; fewer are returned if the pool is smaller.
 */
export async function startExam(params: {
  userId: string;
  bankId?: string;
  count: number;
}): Promise<StartExamResult> {
  const { userId, bankId, count } = params;

  const where: Prisma.QuestionWhereInput = { status: "published" };
  if (bankId) where.bankId = bankId;

  // Pull candidate rows (ordered by id for determinism), migrate, drop quarantined, take `count`.
  const rows = await prisma.question.findMany({
    where,
    orderBy: { id: "asc" },
    take: Math.max(count * 2, count), // over-fetch a little to absorb quarantined rows
  });

  const records: QuestionRecord[] = [];
  for (const row of rows) {
    const rec = recordFromRow(row);
    if (rec) records.push(rec);
    if (records.length >= count) break;
  }

  if (records.length === 0) {
    throw new ValidationError("没有可用于考试的已发布题目", { bankId: "题库为空" });
  }

  const questionIds = records.map((r) => r.id);
  const durationSec = DEFAULT_EXAM_DURATION_SEC;

  const session = await prisma.studySession.create({
    data: {
      userId,
      mode: "exam",
      status: "active",
      bankId: bankId ?? null,
      questionIds,
      remainingSec: durationSec,
      durationSec,
    },
    select: { id: true },
  });

  await prisma.analyticsEvent
    .create({ data: { userId, name: "exam.started", props: { sessionId: session.id, count: questionIds.length } } })
    .catch(() => undefined);

  return {
    sessionId: session.id,
    questionIds,
    questions: records.map(stripAnswerKey),
    durationSec,
    remainingSec: durationSec,
  };
}

/**
 * saveExamAnswer — persist one exam answer server-side (survives refresh) WITHOUT revealing any
 * grading (§5.4). Stored as the single ungraded Attempt row for (sessionId, questionId).
 * remainingSec is clamped monotonically: min(existing ?? incoming, incoming) — never increases.
 */
export async function saveExamAnswer(params: {
  userId: string;
  sessionId: string;
  questionId: string;
  userAnswer: UserAnswer;
  remainingSec: number;
}): Promise<{ ok: true }> {
  const { userId, sessionId, questionId, userAnswer, remainingSec } = params;

  const session = await prisma.studySession.findFirst({
    where: { id: sessionId, userId, mode: "exam" },
    select: {
      id: true,
      status: true,
      questionIds: true,
      remainingSec: true,
      startedAt: true,
      durationSec: true,
    },
  });
  if (!session) throw new NotFoundError();
  if (session.status !== "active") {
    throw new ValidationError("考试已结束，无法保存答案", { sessionId: "会话不是 active 状态" });
  }
  if (!session.questionIds.includes(questionId)) {
    throw new ValidationError("该题不属于本次考试", { questionId: "题目不在考试题集中" });
  }

  // Server-authoritative deadline enforcement (blocker #3): the client clock is UX-only and the
  // monotonic remainingSec clamp never REJECTS a save, so an unlimited-time exploit was possible
  // (look up every answer at leisure, save all-correct, then submit). Here we compare the real
  // elapsed wall-clock against the frozen durationSec; a save past the deadline transitions the
  // session to `expired` and is REJECTED. submitExam still lets an expired session be submitted,
  // but grades nothing saved past the deadline (see below).
  const elapsedSec = (Date.now() - session.startedAt.getTime()) / 1000;
  if (session.durationSec !== null && elapsedSec > session.durationSec) {
    await prisma.studySession
      .update({ where: { id: sessionId }, data: { status: "expired" } })
      .catch(() => undefined);
    throw new ValidationError("EXAM_EXPIRED", { sessionId: "考试时间已到，答案未保存" });
  }

  const answerJson = userAnswer as unknown as Prisma.InputJsonValue;

  await prisma.$transaction(async (tx) => {
    // Upsert-by-pair: there is no DB unique on (session,question), so find the existing ungraded
    // row and update it; otherwise create one. status stays "ungraded", score null → no leak.
    const existing = await tx.attempt.findFirst({
      where: { sessionId, questionId, userId },
      select: { id: true },
    });
    if (existing) {
      await tx.attempt.update({
        where: { id: existing.id },
        data: { userAnswer: answerJson, status: "ungraded", score: null },
      });
    } else {
      await tx.attempt.create({
        data: {
          userId,
          questionId,
          sessionId,
          userAnswer: answerJson,
          status: "ungraded",
          score: null,
          maxScore: 1,
          gradingClass: "composite", // placeholder; the authoritative class is set at submit time
        },
      });
    }

    // Monotonic clamp: remainingSec can only decrease.
    const next = session.remainingSec === null ? remainingSec : Math.min(session.remainingSec, remainingSec);
    if (next !== session.remainingSec) {
      await tx.studySession.update({ where: { id: sessionId }, data: { remainingSec: next } });
    }
  });

  return { ok: true };
}

export interface ExamStateResult {
  sessionId: string;
  status: string;
  /** The frozen exam questions in their locked order, key-STRIPPED (no key/explanation pre-submit). */
  questions: PublicQuestion[];
  /** Server-authoritative seconds left = min(stored remainingSec, durationSec − elapsed), clamped ≥ 0. */
  remainingSec: number;
  durationSec: number;
  /** Saved answers keyed by questionId (latest save per question), to rehydrate the answer sheet. */
  answers: Record<string, UserAnswer>;
}

/**
 * getExamState — RESUMABLE exam state so a refresh mid-exam restores the SAME session instead of
 * starting a fresh one (§8.3). Ownership-scoped. With `sessionId`, that specific owned exam session
 * is loaded (throws NotFound if it isn't the user's); with NO sessionId, the user's LATEST ACTIVE
 * exam session is found (returns null when there is none to resume). Returns the frozen questions
 * (key-STRIPPED, in the locked order), the saved answers (from the ungraded Attempt rows, keyed by
 * questionId), and the server-authoritative remainingSec. No grading is revealed for an active exam.
 *
 * remainingSec is recomputed server-side and kept MONOTONIC: the true deadline is startedAt +
 * durationSec, so wall-clock remaining = durationSec − elapsed; we return min(stored, wallRemaining)
 * clamped to ≥ 0 — never more time than the deadline allows, and never above the last stored value.
 */
export async function getExamState(params: {
  userId: string;
  sessionId?: string;
}): Promise<ExamStateResult | null> {
  const { userId, sessionId } = params;

  // With an explicit sessionId, load THAT owned exam session; otherwise resume the user's latest
  // ACTIVE exam session. orderBy is harmless (single row) in the sessionId case.
  const where: Prisma.StudySessionWhereInput = sessionId
    ? { id: sessionId, userId, mode: "exam" }
    : { userId, mode: "exam", status: "active" };

  const session = await prisma.studySession.findFirst({
    where,
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      questionIds: true,
      remainingSec: true,
      durationSec: true,
      startedAt: true,
    },
  });

  if (!session) {
    if (sessionId) throw new NotFoundError();
    return null; // no active exam to resume
  }

  // Rehydrate the frozen questions in their locked order, key-STRIPPED. Missing/quarantined rows are
  // dropped (a bad payload never crashes resume); the answer sheet keys off questionId regardless.
  const rows = await prisma.question.findMany({
    where: { id: { in: session.questionIds }, status: "published" },
  });
  const strippedById = new Map<string, PublicQuestion>();
  for (const row of rows) {
    const rec = recordFromRow(row);
    if (rec) strippedById.set(row.id, stripAnswerKey(rec));
  }
  const questions: PublicQuestion[] = [];
  for (const qid of session.questionIds) {
    const q = strippedById.get(qid);
    if (q) questions.push(q);
  }

  // Saved answers (latest per question — asc order means later rows overwrite earlier ones).
  const attempts = await prisma.attempt.findMany({
    where: { sessionId: session.id, userId },
    select: { questionId: true, userAnswer: true },
    orderBy: { createdAt: "asc" },
  });
  const answers: Record<string, UserAnswer> = {};
  for (const a of attempts) {
    answers[a.questionId] = a.userAnswer as unknown as UserAnswer;
  }

  // Server-authoritative remaining time: monotonic min of the stored value and wall-clock remaining.
  const durationSec = session.durationSec ?? DEFAULT_EXAM_DURATION_SEC;
  const elapsedSec = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
  const wallRemaining = Math.max(0, durationSec - elapsedSec);
  const remainingSec =
    session.remainingSec === null
      ? wallRemaining
      : Math.max(0, Math.min(session.remainingSec, wallRemaining));

  return {
    sessionId: session.id,
    status: session.status,
    questions,
    remainingSec,
    durationSec,
    answers,
  };
}

export interface ExamPerQuestion {
  questionId: string;
  result: GradeResult;
  revealed: AnswerReveal;
}

export interface SubmitExamResult {
  totalScore: number;
  maxScore: number;
  perQuestion: ExamPerQuestion[];
}

/**
 * submitExam — server-authoritative whole-exam grading (§5.4). Ownership-scoped. Performs the
 * server-side deadline check (elapsed vs durationSec; a blown deadline still grades what was
 * saved — the client cannot extend time). Grades EVERY frozen question with grade() using the
 * saved ungraded answer (or undefined → not answered), then in ONE transaction promotes the
 * ungraded Attempt rows to graded, upserts Progress/Wrongbook/DailyStat, and marks the session
 * submitted with totalScore/maxScore. Returns per-question results + revealed keys.
 */
export async function submitExam(params: {
  userId: string;
  sessionId: string;
}): Promise<SubmitExamResult> {
  const { userId, sessionId } = params;

  const session = await prisma.studySession.findFirst({
    where: { id: sessionId, userId, mode: "exam" },
    select: {
      id: true,
      status: true,
      questionIds: true,
      startedAt: true,
      durationSec: true,
      totalScore: true,
      maxScore: true,
    },
  });
  if (!session) throw new NotFoundError();
  if (session.status === "submitted") {
    // IDEMPOTENT re-submit: the grading tx may have committed while the HTTP response was lost
    // (or an auto-submit raced a manual one). Throwing here would strand the client on a永久
    // "评分失败/重试" dead-end even though the grade is already durable — instead rebuild the same
    // SubmitExamResult from the stored session totals + graded Attempt rows and return it.
    return rebuildSubmittedExam(userId, sessionId, session.questionIds, {
      totalScore: session.totalScore ?? 0,
      maxScore: session.maxScore ?? 0,
    });
  }
  if (session.status !== "active" && session.status !== "expired") {
    throw new ForbiddenError("会话状态不允许交卷");
  }

  // Server-side deadline check (blocker #3). saveExamAnswer now REJECTS post-deadline saves, so a
  // legitimate flow never persists an answer past the deadline. But we still defend here: any
  // answer whose row was written after the deadline (e.g. an already-`expired` session, or a race)
  // is graded as UNANSWERED (score 0) — the client cannot buy time by submitting late. The
  // deadline instant is startedAt + durationSec.
  const elapsedSec = (Date.now() - session.startedAt.getTime()) / 1000;
  const deadlineBlown = session.durationSec !== null && elapsedSec > session.durationSec;
  const deadlineAt =
    session.durationSec !== null
      ? new Date(session.startedAt.getTime() + session.durationSec * 1000)
      : null;

  // Load the saved answers (latest per question).
  const savedAttempts = await prisma.attempt.findMany({
    where: { sessionId, userId },
    select: { id: true, questionId: true, userAnswer: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const answerByQuestion = new Map<string, UserAnswer>();
  const attemptIdByQuestion = new Map<string, string>();
  for (const a of savedAttempts) {
    attemptIdByQuestion.set(a.questionId, a.id); // latest row id per question (asc → last wins)
    // Post-deadline answers earn no credit: drop them from the graded set so grade() sees them as
    // not-answered. The ungraded Attempt row is still promoted below (to a 0 score), keeping the
    // audit trail intact while withholding the credit.
    if (deadlineAt !== null && a.createdAt.getTime() > deadlineAt.getTime()) continue;
    answerByQuestion.set(a.questionId, a.userAnswer as unknown as UserAnswer);
  }

  // Load + migrate every frozen question (published rows only; quarantined rows are skipped and
  // count as ungraded/absent so a bad payload cannot crash the whole submit).
  const rows = await prisma.question.findMany({
    where: { id: { in: session.questionIds }, status: "published" },
  });
  const recById = new Map<string, QuestionRecord>();
  for (const row of rows) {
    const rec = recordFromRow(row);
    if (rec) recById.set(row.id, rec);
  }

  // Grade every question (in the frozen order).
  const perQuestion: ExamPerQuestion[] = [];
  let totalScore = 0;
  let maxScore = 0;

  await prisma.$transaction(async (tx) => {
    for (const qid of session.questionIds) {
      const rec = recById.get(qid);
      if (!rec) continue; // quarantined / unpublished → skip (absent from the graded set)

      const userAnswer = answerByQuestion.get(qid);
      const res = grade(rec, userAnswer);

      // Objective scores contribute to the exam total/max; subjective (null) parts add nothing.
      if (res.score !== null) {
        totalScore += res.score;
        maxScore += res.max;
      }

      // Promote / write the graded Attempt. If an ungraded row exists for the pair, update it;
      // otherwise create one (question was never saved during the exam → graded as not-answered).
      const existingId = attemptIdByQuestion.get(qid);
      const attemptData = {
        status: res.status as AttemptStatus,
        score: res.score,
        maxScore: res.max,
        gradingClass: res.gradingClass as GradingClass,
      };
      if (existingId) {
        await tx.attempt.update({ where: { id: existingId }, data: attemptData });
      } else {
        await tx.attempt.create({
          data: {
            userId,
            questionId: qid,
            sessionId,
            userAnswer: (userAnswer ?? { kind: "text", value: "" }) as unknown as Prisma.InputJsonValue,
            ...attemptData,
          },
        });
      }

      await upsertProgress(tx, userId, qid, res, userAnswer ?? { kind: "text", value: "" });
      if (res.status === "incorrect") await upsertWrongbook(tx, userId, qid);
      // countAttempt: exam grading bypasses the practice quota gate (the sole other writer of
      // DailyUserStat.attempts), so each graded exam question books its attempt here — keeping
      // 刷题量/今日完成 truthful and matching the nightly reconcile's per-Attempt-row count.
      await upsertDailyStat(tx, userId, res, undefined, true);

      perQuestion.push({ questionId: qid, result: res, revealed: revealKey(rec) });
    }

    await tx.studySession.update({
      where: { id: sessionId },
      data: {
        status: "submitted",
        submittedAt: new Date(),
        totalScore,
        maxScore,
      },
    });

    await emitAnalytics(tx, userId, "exam.submitted", {
      sessionId,
      totalScore,
      maxScore,
      count: perQuestion.length,
      deadlineBlown,
    });
  });

  return { totalScore, maxScore, perQuestion };
}

/**
 * rebuildSubmittedExam — reassemble the SubmitExamResult of an ALREADY-submitted session from the
 * durable rows (session totals + the graded Attempt per question + revealKey on the frozen
 * questions). Powers idempotent submitExam retries: the client's "重试评分" after a lost response
 * gets the real grade instead of a dead-end error. Read-only.
 */
async function rebuildSubmittedExam(
  userId: string,
  sessionId: string,
  questionIds: string[],
  totals: { totalScore: number; maxScore: number },
): Promise<SubmitExamResult> {
  const attempts = await prisma.attempt.findMany({
    where: { sessionId, userId },
    select: {
      questionId: true,
      status: true,
      score: true,
      maxScore: true,
      gradingClass: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" }, // last row per question wins (mirrors the grading pass)
  });
  const byQuestion = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) byQuestion.set(a.questionId, a);

  const rows = await prisma.question.findMany({
    where: { id: { in: questionIds }, status: "published" },
  });
  const recById = new Map<string, QuestionRecord>();
  for (const row of rows) {
    const rec = recordFromRow(row);
    if (rec) recById.set(row.id, rec);
  }

  const perQuestion: ExamPerQuestion[] = [];
  for (const qid of questionIds) {
    const a = byQuestion.get(qid);
    const rec = recById.get(qid);
    if (!a || !rec) continue; // mirrors the grading pass: quarantined/absent rows are skipped
    perQuestion.push({
      questionId: qid,
      result: {
        gradingClass: a.gradingClass as GradeResult["gradingClass"],
        status: a.status as GradeResult["status"],
        score: a.score,
        max: a.maxScore,
        answered: a.status !== "ungraded" || a.score !== null,
      },
      revealed: revealKey(rec),
    });
  }
  return { totalScore: totals.totalScore, maxScore: totals.maxScore, perQuestion };
}

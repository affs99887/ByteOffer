// lib/server/services/attemptService.ts
// The server-authoritative attempt pipeline (architecture §1.2 / §5.4) — the load-bearing
// security element of the whole app. One of the ONLY layers touching Prisma.
//
// submit() flow (exactly §1.2):
//   questionService.getPublishedRow → recordFromRow (null→NotFound) →
//   entitlementService.assertCanAttempt (atomic quota gate, inside the tx) →
//   grade(rec, userAnswer) (authoritative, the SAME pure function the client uses) →
//   $transaction { create Attempt; upsertProgress; if incorrect upsertWrongbook;
//                  upsertDailyStat; emit AnalyticsEvent("attempt.graded") } →
//   return { result: GradeResult, revealed: revealKey(rec) }
//
// The client submits only a UserAnswer; score/status/selfScore are NEVER read from input
// (invariant §2.2). The objective denominator (objectiveAttempts) is bumped ONLY for objective
// classes with a non-null score. selfScore never touches objectiveAttempts (invariant §4).

import { grade } from "@/lib/qbank/grade";
import type { GradeResult, QuestionRecord, UserAnswer } from "@/lib/qbank/types";
import { prisma } from "@/lib/server/db";
import { NotFoundError } from "@/lib/server/errors";
import { recordFromRow, revealKey } from "@/lib/server/qbank/mapping";
import type { AnswerReveal } from "@/lib/server/qbank/mapping";
import * as entitlementService from "@/lib/server/services/entitlementService";
import * as questionService from "@/lib/server/services/questionService";
import type { AttemptStatus, GradingClass, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// ============================================================
//  Shared helpers (also used by exam submit in sessionService)
// ============================================================

const OBJECTIVE_CLASSES: ReadonlySet<GradingClass> = new Set<GradingClass>([
  "auto_exact",
  "auto_set",
  "auto_normalized",
  "auto_partial",
]);

/** True when a grade result contributes to the objective accuracy denominator (§7.2 铁律). */
export function isObjectiveScored(res: GradeResult): boolean {
  return res.score !== null && OBJECTIVE_CLASSES.has(res.gradingClass as GradingClass);
}

/** UTC midnight for "today" (matches the @db.Date column). */
function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * upsertProgress — roll the (user, question) summary forward inside the attempt tx.
 * attempts++, correctCount/wrongCount by status, and last{Score,Status,Answer,At}.
 * `lastScore` prefers the objective score; for subjective self-grades pass res.score (may be the
 * selfScore-derived value) — callers set it appropriately.
 */
export async function upsertProgress(
  tx: Tx,
  userId: string,
  questionId: string,
  res: GradeResult,
  userAnswer: UserAnswer,
): Promise<void> {
  const status = res.status as AttemptStatus;
  const isCorrect = res.status === "correct";
  const isWrong = res.status === "incorrect";
  const answerJson = userAnswer as unknown as Prisma.InputJsonValue;

  await tx.progress.upsert({
    where: { userId_questionId: { userId, questionId } },
    create: {
      userId,
      questionId,
      attempts: 1,
      correctCount: isCorrect ? 1 : 0,
      wrongCount: isWrong ? 1 : 0,
      lastScore: res.score,
      lastStatus: status,
      lastAnswer: answerJson,
      lastAt: new Date(),
    },
    update: {
      attempts: { increment: 1 },
      ...(isCorrect ? { correctCount: { increment: 1 } } : {}),
      ...(isWrong ? { wrongCount: { increment: 1 } } : {}),
      lastScore: res.score,
      lastStatus: status,
      lastAnswer: answerJson,
      lastAt: new Date(),
    },
  });
}

/**
 * upsertWrongbook — materialize / bump a WrongbookEntry when an attempt is incorrect (§5.4).
 * wrongCount++ and lastWrongAt refresh; `mastered` is left untouched (a re-miss does not reset a
 * user's manual mastered flag — masterWrong owns that).
 */
export async function upsertWrongbook(tx: Tx, userId: string, questionId: string): Promise<void> {
  await tx.wrongbookEntry.upsert({
    where: { userId_questionId: { userId, questionId } },
    create: { userId, questionId, wrongCount: 1, lastWrongAt: new Date() },
    update: { wrongCount: { increment: 1 }, lastWrongAt: new Date() },
  });
}

/**
 * upsertDailyStat — incremental daily materialization (§7.2). Bumps `correct`,
 * `objectiveAttempts`, and `studyMs` on today's row. IMPORTANT: it does NOT touch `attempts` —
 * that counter is owned solely by entitlementService.assertCanAttempt (the quota gate), so the
 * two never double-count (see entitlementService header). The row is guaranteed to already exist
 * because the quota gate upserts it first; the create branch here is a safe fallback for the
 * unlimited (Plus) path where the gate returns early without creating a row.
 */
export async function upsertDailyStat(
  tx: Tx,
  userId: string,
  res: GradeResult,
  durationMs?: number,
  countAttempt = false,
): Promise<void> {
  const day = today();
  // §7.2 铁律: `correct` shares the objective gate with `objectiveAttempts` (never selfScore).
  // A crafted direct submit of {kind:"self"} could otherwise land status="correct"/score=null and
  // pollute the objective numerator — mirror the reconcile pass's gating exactly.
  const correctInc = res.status === "correct" && isObjectiveScored(res) ? 1 : 0;
  const objectiveInc = isObjectiveScored(res) ? 1 : 0;
  const studyInc = durationMs && durationMs > 0 ? Math.min(durationMs, 24 * 3600 * 1000) : 0;

  await tx.dailyUserStat.upsert({
    where: { userId_day: { userId, day } },
    // Fallback create (Plus path): the gate did not run, so attempts is set to reflect this one
    // accepted attempt. On the gated (free) path this branch never fires — the row already exists.
    create: {
      userId,
      day,
      attempts: 1,
      correct: correctInc,
      objectiveAttempts: objectiveInc,
      studyMs: studyInc,
    },
    // attempts is owned by the quota gate on the PRACTICE path (countAttempt=false). The EXAM
    // grading path bypasses the gate entirely, so submitExam passes countAttempt=true and this
    // becomes the counter's writer for those rows — keeping the live totals consistent with the
    // nightly reconcile, which counts every Attempt row (practice and exam alike).
    update: {
      ...(countAttempt ? { attempts: { increment: 1 } } : {}),
      ...(correctInc ? { correct: { increment: correctInc } } : {}),
      ...(objectiveInc ? { objectiveAttempts: { increment: objectiveInc } } : {}),
      ...(studyInc ? { studyMs: { increment: studyInc } } : {}),
    },
  });
}

/** emitAnalytics — fire-and-forget AnalyticsEvent inside the tx (never throws to the caller). */
export async function emitAnalytics(
  tx: Tx,
  userId: string | null,
  name: string,
  props: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await tx.analyticsEvent.create({ data: { userId, name, props } });
  } catch {
    // Analytics is best-effort; never break the attempt tx on a telemetry failure.
  }
}

// ============================================================
//  submit — the §1.2 / §5.4 pipeline
// ============================================================

export interface SubmitParams {
  userId: string;
  questionId: string;
  sessionId?: string;
  userAnswer: UserAnswer;
  durationMs?: number;
}

export interface SubmitResult {
  result: GradeResult;
  revealed: AnswerReveal;
  /** The created Attempt's id — required so the client can call selfGradeAttempt for subjective types. */
  attemptId: string;
}

/**
 * submit — grade one submitted answer, server-authoritatively, and persist the derived result.
 * Reads the published row (incl. JSONB payload), migrates it to a record (null → NotFound),
 * gates on the atomic daily quota, grades with the SAME pure grade() the client uses, then in a
 * single $transaction writes the Attempt + Progress + (Wrongbook if incorrect) + DailyStat and
 * emits the analytics event. Returns the grade result plus the revealed key/explanation.
 */
export async function submit(params: SubmitParams): Promise<SubmitResult> {
  const { userId, questionId, sessionId, userAnswer, durationMs } = params;

  const row = await questionService.getPublishedRow(questionId);
  const rec: QuestionRecord | null = recordFromRow(row);
  if (!rec) throw new NotFoundError();

  const res = grade(rec, userAnswer);

  const attemptId = await prisma.$transaction(async (tx) => {
    // Atomic quota gate FIRST inside the tx — a throw here rolls back the whole tx (§6.4).
    await entitlementService.assertCanAttempt(userId, tx);

    const attempt = await tx.attempt.create({
      data: {
        userId,
        questionId,
        sessionId: sessionId ?? null,
        userAnswer: userAnswer as unknown as Prisma.InputJsonValue,
        status: res.status as AttemptStatus,
        score: res.score,
        selfScore: null,
        maxScore: res.max,
        gradingClass: res.gradingClass as GradingClass,
        durationMs: durationMs ?? null,
      },
      select: { id: true },
    });

    await upsertProgress(tx, userId, questionId, res, userAnswer);
    if (res.status === "incorrect") await upsertWrongbook(tx, userId, questionId);
    await upsertDailyStat(tx, userId, res, durationMs);

    await emitAnalytics(tx, userId, "attempt.graded", {
      questionId,
      type: rec.type,
      difficulty: rec.difficulty,
      status: res.status,
      score: res.score,
      durationMs: durationMs ?? null,
    });

    return attempt.id;
  });

  return { result: res, revealed: revealKey(rec), attemptId };
}

// ============================================================
//  selfGrade — subjective self-assessment (writes selfScore only)
// ============================================================

export interface SelfGradeParams {
  userId: string;
  attemptId: string;
  selfScore: 0 | 0.5 | 1;
  rubricTicks?: number[];
}

export interface SelfGradeResult {
  result: GradeResult;
}

/** Derive an AttemptStatus from a self score (subjective; excluded from objective stats). */
function statusFromSelfScore(selfScore: number): AttemptStatus {
  if (selfScore >= 1) return "correct";
  if (selfScore <= 0) return "incorrect";
  return "partial";
}

/**
 * selfGrade — record a subjective self-assessment on an existing attempt. Ownership-scoped
 * (where:{ id, userId } — IDOR kill, §3.2). Writes the independent `selfScore` column and
 * recomputes `status`, then updates Progress.lastScore to reflect the self score. Does NOT touch
 * objectiveAttempts (invariant §4 — self scores never enter the objective denominator).
 */
export async function selfGrade(params: SelfGradeParams): Promise<SelfGradeResult> {
  const { userId, attemptId, selfScore, rubricTicks } = params;

  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, userId },
    select: { id: true, questionId: true, gradingClass: true, maxScore: true },
  });
  if (!attempt) throw new NotFoundError();

  const status = statusFromSelfScore(selfScore);

  const result: GradeResult = {
    gradingClass: attempt.gradingClass as GradeResult["gradingClass"],
    status,
    score: selfScore,
    max: attempt.maxScore,
    answered: true,
    needsSelfGrade: false,
  };

  await prisma.$transaction(async (tx) => {
    await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        selfScore,
        status,
        // Persist which rubric items were ticked (advisory; stored under userAnswer is not correct
        // here since userAnswer is the original text — we keep rubricTicks out of the objective
        // path and only reflect the derived status/selfScore).
      },
    });

    // Update the rolling summary's last* to reflect the self score. We do not touch attempts /
    // correctCount / wrongCount here (those were set when the attempt was first submitted); we
    // only move lastScore/lastStatus to the self-graded value so the UI shows the graded state.
    // upsert (not update) so a self-grade never hard-crashes if the Progress row is somehow absent.
    await tx.progress.upsert({
      where: { userId_questionId: { userId, questionId: attempt.questionId } },
      create: {
        userId,
        questionId: attempt.questionId,
        attempts: 1,
        lastScore: selfScore,
        lastStatus: status,
        lastAt: new Date(),
      },
      update: { lastScore: selfScore, lastStatus: status },
    });
  });

  // rubricTicks is accepted + validated but is advisory for the client's rubric UI; it is not
  // part of the objective stats. It is intentionally not persisted separately in Phase 3.
  void rubricTicks;

  return { result };
}

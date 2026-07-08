// lib/validation/exam.ts
// Zod schemas for practice/exam session Server Actions (architecture §4.2, Sessions rows).
// The client never submits scores; exam grading is server-authoritative and deferred until
// submitExam (§5.4). remainingSec is a client-reported countdown clamped monotonically
// server-side (never allowed to increase, §8.3 anti-cheat). All schemas whitelist fields.

import { z } from "zod";
import { userAnswerSchema, questionTypeEnum, difficultyEnum } from "@/lib/validation/qbank";

/**
 * practiceFiltersSchema — the frozen filter snapshot for a practice session (ASCII keys, §7.3).
 * Everything optional so an empty filter means "any published question".
 */
export const practiceFiltersSchema = z.object({
  bankId: z.string().min(1).optional(),
  types: z.array(questionTypeEnum).optional(),
  difficulty: difficultyEnum.optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
});
export type PracticeFilters = z.infer<typeof practiceFiltersSchema>;

export const startPracticeSchema = z.object({
  filters: practiceFiltersSchema.optional(),
});
export type StartPracticeInput = z.infer<typeof startPracticeSchema>;

/**
 * getQuestionForPracticeAction input — a BATCH read (§5.4). Either an explicit `sessionId` (whose
 * frozen filters are reused, ownership-scoped) or ad-hoc `filters`, plus a `cursor` (the last
 * question id to advance past) and `take` (page size, 1..50, default 10). The action returns up to
 * `take` key-STRIPPED questions + a nextCursor; the client appends the page and pages forward by
 * cursor. Clean break from the old single-question shape (no back-compat) — the only consumer is
 * app/app/page.tsx + the app-context rewrite.
 */
export const getPracticeQuestionSchema = z.object({
  sessionId: z.string().min(1).optional(),
  filters: practiceFiltersSchema.optional(),
  cursor: z.string().min(1).optional(),
  take: z.number().int().min(1).max(50).default(10),
});
export type GetPracticeQuestionInput = z.infer<typeof getPracticeQuestionSchema>;

export const startExamSchema = z.object({
  bankId: z.string().min(1).optional(),
  count: z.number().int().positive().max(200).default(30),
});
export type StartExamInput = z.infer<typeof startExamSchema>;

/** saveExamAnswerAction input. remainingSec is clamped monotonically server-side. */
export const saveExamAnswerSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  userAnswer: userAnswerSchema,
  remainingSec: z.number().int().nonnegative().max(24 * 3600),
});
export type SaveExamAnswerInput = z.infer<typeof saveExamAnswerSchema>;

export const examSessionSchema = z.object({
  sessionId: z.string().min(1),
});
export type ExamSessionInput = z.infer<typeof examSessionSchema>;

/**
 * getExamStateAction input — RESUME the user's exam (§8.3). With `sessionId`, that specific owned
 * exam session is rehydrated; with NO sessionId (the whole-object `.default({})`), the service finds
 * the user's LATEST ACTIVE exam session (returns null when there is none). The default lets a bare
 * getExamState() call parse to `{}` while `getExamState({ sessionId })` keeps working for a client
 * that persisted the id across a refresh.
 */
export const examStateSchema = z
  .object({ sessionId: z.string().min(1).optional() })
  .default({});
export type ExamStateInput = z.infer<typeof examStateSchema>;

// ============================================================
//  Unified SCOPE-based session (V2 — practice/exam merge)
// ============================================================

/**
 * SessionScope — the data-driven target a unified session runs over (V2 hub). The chapter/section
 * hub, wrongbook, and favorites all launch a session by declaring one of these; the service derives
 * the published question pool from it (never a hardcoded chapter list). chapter/section are the
 * DATA-DRIVEN mirror-column values a question declares — plain content strings (Chinese or ASCII),
 * not enums. `wrong`/`favorites` optionally narrow to a single chapter.
 */
export type SessionScope =
  | { kind: "all" }
  | { kind: "chapter"; chapter: string }
  | { kind: "section"; chapter: string; section: string }
  | { kind: "wrong"; chapter?: string }
  | { kind: "favorites"; chapter?: string };

// chapter/section are free-form content (data-driven), bounded 1..80 to keep the where clause and
// the rebuilt scopeLabel sane. Non-empty so an empty string can never widen a scope to "all".
const scopeChapter = z.string().min(1).max(80);
const scopeSection = z.string().min(1).max(80);

/**
 * sessionScopeSchema — discriminated union on `kind`, 1:1 with SessionScope. Whitelists exactly the
 * fields each kind needs (an "all" scope carries nothing; a stray chapter on it is rejected), so the
 * frozen scope stored in StudySession.filters is always a clean, reconstructable shape.
 */
export const sessionScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("chapter"), chapter: scopeChapter }),
  z.object({ kind: z.literal("section"), chapter: scopeChapter, section: scopeSection }),
  z.object({ kind: z.literal("wrong"), chapter: scopeChapter.optional() }),
  z.object({ kind: z.literal("favorites"), chapter: scopeChapter.optional() }),
]);

/**
 * startSessionSchema — launch a unified session. `mode` picks practice (no timer, per-question
 * feedback) vs exam (countdown, submit-all-at-end); `scope` is the target pool; `count` bounds the
 * frozen set (exam defaults to 30 server-side, practice defaults to the whole scope, both hard-capped
 * at 100 in the service). The service SHUFFLES + TYPE-CLUSTERS + FREEZES the set.
 */
export const startSessionSchema = z.object({
  mode: z.enum(["practice", "exam"]),
  scope: sessionScopeSchema,
  count: z.number().int().min(1).max(100).optional(),
});
export type StartSessionInput = z.infer<typeof startSessionSchema>;

/** sessionStateSchema — rehydrate a frozen session by id (ownership-scoped in the service). */
export const sessionStateSchema = z.object({ sessionId: z.string().min(1) });
export type SessionStateInput = z.infer<typeof sessionStateSchema>;

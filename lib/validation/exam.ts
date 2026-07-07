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

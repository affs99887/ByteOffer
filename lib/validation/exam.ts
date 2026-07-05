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
  tags: z.array(z.string()).optional(),
});
export type PracticeFilters = z.infer<typeof practiceFiltersSchema>;

export const startPracticeSchema = z.object({
  filters: practiceFiltersSchema.optional(),
});
export type StartPracticeInput = z.infer<typeof startPracticeSchema>;

/**
 * getQuestionForPracticeAction input. Either an explicit `sessionId` (whose frozen filters are
 * reused) or ad-hoc `filters`, plus a `cursor` (last question id) to advance past. `index` is an
 * optional ordinal hint for deterministic paging on the client.
 */
export const getPracticeQuestionSchema = z.object({
  sessionId: z.string().min(1).optional(),
  filters: practiceFiltersSchema.optional(),
  cursor: z.string().min(1).optional(),
  index: z.number().int().nonnegative().optional(),
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

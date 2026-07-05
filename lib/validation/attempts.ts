// lib/validation/attempts.ts
// Zod schemas for attempt Server Actions (architecture §4.2, submit-attempt row). The client
// submits only a UserAnswer (never a score/status/selfScore — invariant §2.2); scores are
// derived server-side from the DB payload. All schemas whitelist fields (mass-assignment guard).

import { z } from "zod";
import { userAnswerSchema } from "@/lib/validation/qbank";

/** submitAttemptAction input. `durationMs` is a client hint only (advisory, never trusted for grade). */
export const submitAttemptSchema = z.object({
  questionId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  userAnswer: userAnswerSchema,
  durationMs: z.number().int().nonnegative().max(24 * 3600 * 1000).optional(),
});
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;

/**
 * selfGradeAttemptAction input. selfScore is the only subjective score the client may send, and
 * it lands in the independent selfScore column (never the objective denominator, §2.2 / invariant 4).
 * rubricTicks is the set of ticked rubric indices (essay checklist).
 */
export const selfGradeAttemptSchema = z.object({
  attemptId: z.string().min(1),
  selfScore: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
  rubricTicks: z.array(z.number().int().nonnegative()).optional(),
});
export type SelfGradeAttemptInput = z.infer<typeof selfGradeAttemptSchema>;

"use server";

// lib/actions/attempts.ts
// Thin attempt Server Actions (architecture §4.2). Each is defineAction(schema, requireUser,
// handler): requireUser is the authoritative security boundary, the schema whitelists input
// (never a score/status/selfScore — invariant §2.2), and the handler delegates to attemptService
// (actions never import prisma directly). The atomic quota gate + server-authoritative grade live
// in the service (§5.4 / §6.4).

import { defineAction } from "@/lib/server/action";
import { requireUser } from "@/lib/server/guards";
import { assertRateLimit } from "@/lib/server/ratelimit";
import * as attemptService from "@/lib/server/services/attemptService";
import type { SubmitResult, SelfGradeResult } from "@/lib/server/services/attemptService";
import { selfGradeAttemptSchema, submitAttemptSchema } from "@/lib/validation/attempts";

export const submitAttemptAction = defineAction(
  submitAttemptSchema,
  requireUser,
  async (input, user): Promise<SubmitResult> => {
    // Anti-scripting throttle (§10): 60 submissions / min per user. This is on top of the atomic
    // daily quota gate inside the service (they defend different things).
    await assertRateLimit("attempt:submit", user.id, { limit: 60, windowSec: 60 });
    return attemptService.submit({
      userId: user.id,
      questionId: input.questionId,
      sessionId: input.sessionId,
      userAnswer: input.userAnswer,
      durationMs: input.durationMs,
    });
  },
);

export const selfGradeAttemptAction = defineAction(
  selfGradeAttemptSchema,
  requireUser,
  async (input, user): Promise<SelfGradeResult> =>
    attemptService.selfGrade({
      userId: user.id,
      attemptId: input.attemptId,
      selfScore: input.selfScore,
      rubricTicks: input.rubricTicks,
    }),
);

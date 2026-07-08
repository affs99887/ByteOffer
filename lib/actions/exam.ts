"use server";

// lib/actions/exam.ts
// Thin exam Server Actions (architecture §4.2). requireUser is the security boundary; ownership
// is enforced INSIDE sessionService via where:{ id, userId } on every query (IDOR kill, §3.2).
// startExam is additionally gated on entitlement.examMode. Exam grading is server-authoritative
// and deferred to submitExam; saveExamAnswer never reveals grading and clamps remainingSec
// monotonically (§5.4 / §8.3).

import { defineAction } from "@/lib/server/action";
import { requireUser } from "@/lib/server/guards";
import * as entitlementService from "@/lib/server/services/entitlementService";
import * as sessionService from "@/lib/server/services/sessionService";
import type {
  ExamStateResult,
  SessionStateResult,
  StartExamResult,
  SubmitExamResult,
} from "@/lib/server/services/sessionService";
import {
  examSessionSchema,
  examStateSchema,
  saveExamAnswerSchema,
  sessionStateSchema,
  startExamSchema,
} from "@/lib/validation/exam";

export const startExamSessionAction = defineAction(
  startExamSchema,
  requireUser,
  async (input, user): Promise<StartExamResult> => {
    await entitlementService.assertExamMode(user.id);
    if (input.bankId) await entitlementService.assertBankAccess(user.id, input.bankId);
    return sessionService.startExam({ userId: user.id, bankId: input.bankId, count: input.count });
  },
);

export const saveExamAnswerAction = defineAction(
  saveExamAnswerSchema,
  requireUser,
  async (input, user): Promise<{ ok: true }> =>
    sessionService.saveExamAnswer({
      userId: user.id,
      sessionId: input.sessionId,
      questionId: input.questionId,
      userAnswer: input.userAnswer,
      remainingSec: input.remainingSec,
    }),
);

export const submitExamAction = defineAction(
  examSessionSchema,
  requireUser,
  async (input, user): Promise<SubmitExamResult> =>
    sessionService.submitExam({ userId: user.id, sessionId: input.sessionId }),
);

export const getExamStateAction = defineAction(
  examStateSchema,
  requireUser,
  async (input, user): Promise<ExamStateResult | null> =>
    sessionService.getExamState({ userId: user.id, sessionId: input.sessionId }),
);

/**
 * getSessionStateAction — REHYDRATE a UNIFIED session (V2 hub) by id for refresh-resume. Lives here
 * (exam.ts) per the kernel plan; drives sessionService.getSessionState, which is ownership-scoped
 * (where:{ id, userId } — IDOR kill) and returns null when the id isn't the caller's. Serves the
 * frozen key-STRIPPED questions + saved answers (exam) + monotonic countdown (exam) / null (practice).
 */
export const getSessionStateAction = defineAction(
  sessionStateSchema,
  requireUser,
  async (input, user): Promise<SessionStateResult | null> =>
    sessionService.getSessionState({ userId: user.id, sessionId: input.sessionId }),
);

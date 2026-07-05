"use server";

// lib/actions/practice.ts
// Thin practice-session Server Actions (architecture §4.2). requireUser is the security boundary;
// ownership of any referenced session is enforced inside sessionService (where:{ id, userId }).
// The returned question is always key-STRIPPED (§5.4) — an un-answered client never sees the key.

import { defineAction } from "@/lib/server/action";
import { requireUser } from "@/lib/server/guards";
import { assertRateLimit } from "@/lib/server/ratelimit";
import * as entitlementService from "@/lib/server/services/entitlementService";
import * as sessionService from "@/lib/server/services/sessionService";
import type {
  PracticeQuestionResult,
  StartPracticeResult,
} from "@/lib/server/services/sessionService";
import { getPracticeQuestionSchema, startPracticeSchema } from "@/lib/validation/exam";

// Anti-scrape read cap (§10): the practice read path serves rendered (key-stripped) questions, so a
// script could enumerate the bank through it. 120 reads / min per user is generous for a human but
// throttles automated harvesting. Combined with cuid ids + published-only + cursor paging.
const READ_LIMIT = { limit: 120, windowSec: 60 };

export const startPracticeSessionAction = defineAction(
  startPracticeSchema,
  requireUser,
  async (input, user): Promise<StartPracticeResult> => {
    await assertRateLimit("question:read", user.id, READ_LIMIT);
    if (input.filters?.bankId) await entitlementService.assertBankAccess(user.id, input.filters.bankId);
    return sessionService.startPractice({ userId: user.id, filters: input.filters });
  },
);

export const getQuestionForPracticeAction = defineAction(
  getPracticeQuestionSchema,
  requireUser,
  async (input, user): Promise<PracticeQuestionResult> => {
    await assertRateLimit("question:read", user.id, READ_LIMIT);
    return sessionService.getPracticeQuestion({
      userId: user.id,
      sessionId: input.sessionId,
      filters: input.filters,
      cursor: input.cursor,
    });
  },
);

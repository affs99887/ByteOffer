// lib/server/services/analyticsService.ts
// Fire-and-forget event tracking (architecture §7.1 event model). One of the ONLY layers touching
// Prisma. Every emit is wrapped in try/catch and NEVER throws to the caller: telemetry must not be
// able to break a request. Two entry points:
//   - track(name, props?, userId?)  — a standalone emit (its own INSERT).
//   - trackTx(tx, name, props?, userId?) — an emit inside an existing transaction (so the event is
//     recorded atomically with a domain change, e.g. attempt.graded — see attemptService).
//
// Event names are the §7.1 catalog: auth.registered, auth.login, attempt.graded, exam.started,
// exam.submitted, favorite.added, wrongbook.mastered, import.applied, checkout.started,
// subscription.activated, subscription.canceled, quota.blocked, premium.upsell_viewed.

import { prisma } from "@/lib/server/db";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Coerce a loose props bag to Prisma's JSON input. `undefined` → no props column. We never throw
 * on a non-serializable value here; the create is best-effort and swallowed by the callers below.
 */
function toJson(props?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  if (props === undefined) return undefined;
  return props as Prisma.InputJsonValue;
}

/**
 * track — record one AnalyticsEvent (§7.1). Fire-and-forget: any failure (cold DB, telemetry
 * outage, serialization) is caught and dropped so the calling request is never affected. Returns a
 * resolved promise regardless; callers may `void` it or `await` it harmlessly.
 */
export async function track(
  name: string,
  props?: Record<string, unknown>,
  userId?: string | null,
): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: { name, userId: userId ?? null, props: toJson(props) },
    });
  } catch {
    // Best-effort telemetry — never surface an error to the caller.
  }
}

/**
 * trackTx — the in-transaction variant of track(). Records the event on the SAME transaction client
 * as a domain write, so the event lands atomically with (and is rolled back alongside) that write.
 * Still swallows its own errors so a telemetry failure cannot abort the enclosing transaction —
 * mirrors attemptService.emitAnalytics (kept there to avoid a cross-service import cycle in the hot
 * attempt path; this is the general-purpose equivalent for other services).
 */
export async function trackTx(
  tx: Tx,
  name: string,
  props?: Record<string, unknown>,
  userId?: string | null,
): Promise<void> {
  try {
    await tx.analyticsEvent.create({
      data: { name, userId: userId ?? null, props: toJson(props) },
    });
  } catch {
    // Best-effort telemetry — never break the enclosing transaction on an event failure.
  }
}

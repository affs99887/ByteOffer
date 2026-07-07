// lib/server/services/entitlementService.ts
// Entitlement reads + server-side gating (architecture §6.4) + the entitlement WRITE side (§6.3).
// One of the ONLY layers that touches Prisma. Gating reads the denormalized Entitlement snapshot
// (O(1) index read). The daily-quota gate is an ATOMIC conditional increment that kills the TOCTOU
// window (§6.4).
//
// WRITE SIDE (added in Phase 5, §6.3–6.4):
//   rebuildEntitlement(userId, tx?) is the SINGLE place the Entitlement snapshot is (re)derived —
//   from the LOCAL Subscription + matching Plan rows, never from Stripe directly. It is called only
//   from the webhook path (billingService.handleWebhookEvent), so entitlement can change ONLY as a
//   consequence of a verified Stripe event. ensureStripeCustomer(userId) creates/persists the
//   Stripe customer id (the one place that talks to Stripe from this file).
//
// QUOTA / STATS COORDINATION (the one subtle correctness point):
//   The single `DailyUserStat.attempts` counter is bumped in exactly ONE place — the quota gate
//   (assertCanAttempt). The stats materialization in attemptService (upsertDailyStat) bumps only
//   `correct` / `objectiveAttempts` / `studyMs` and NEVER touches `attempts`. So `attempts` is
//   incremented once per accepted submission (by the gate), the objective denominator is a
//   separate counter, and the two can never double-count. Both run inside the same attempt
//   $transaction, so a rejected quota check (throw) rolls back nothing it started and an accepted
//   one is atomic with the grade write.

import { prisma } from "@/lib/server/db";
import { PaymentRequiredError } from "@/lib/server/errors";
import { getStripe } from "@/lib/server/stripe";
import { logger } from "@/lib/server/logger";
import type { Entitlement, PlanTier, Prisma } from "@prisma/client";

/** A Prisma client or an interactive-transaction client — both expose the model + $executeRaw. */
type Db = typeof prisma | Prisma.TransactionClient;

/**
 * The default free entitlement when a user has no Entitlement row yet (§6.1 free plan).
 *
 * FREE-FOR-ALL RELEASE (product decision): every feature is free for registered users this release —
 * no paywall, no quota. So the free default grants everything a paid tier would: `dailyQuota: null`
 * (unlimited — the atomic quota gate short-circuits on null, see assertCanAttempt), `premiumBanks:
 * true`, `examMode: true`. `aiExplain` is false because there is NO AI feature this release. The
 * seeded free/plus Plan rows mirror these exact values, so get() and a webhook rebuild resolve to the
 * same grants whether or not an Entitlement row exists. The gate functions below are retained intact
 * (cheap future-proofing; other files call them) but with `dailyQuota: null` the quota paywall is
 * physically unreachable.
 */
export const DEFAULT_FREE_ENTITLEMENT: Entitlement = {
  userId: "",
  tier: "free" as PlanTier,
  dailyQuota: null,
  premiumBanks: true,
  examMode: true,
  aiExplain: false,
  validUntil: null,
  updatedAt: new Date(0),
};

/** UTC midnight for "today" — matches the @db.Date column (date-only, no time component). */
function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * isExpired — a denormalized entitlement snapshot whose paid window has already elapsed. The
 * snapshot is only re-derived from a webhook (rebuildEntitlement); if a webhook is dropped or a sub
 * lingers in past_due, the row can point at a past `validUntil` yet still read as Plus. Callers
 * treat an expired snapshot as free at READ time (should-fix #4), closing that revenue leak without
 * waiting for a reconcile sweep.
 */
function isExpired(row: Pick<Entitlement, "validUntil">, now: Date = new Date()): boolean {
  return row.validUntil !== null && now >= row.validUntil;
}

/**
 * get — the user's Entitlement row, or a default free entitlement (userId filled in) when none
 * exists. Never throws for a missing row (a brand-new user is free by construction). If the stored
 * snapshot has EXPIRED (validUntil in the past, #4) it is treated as the free default at read time,
 * so every gate that funnels through get() (bank/exam access below) respects expiry immediately.
 */
export async function get(userId: string): Promise<Entitlement> {
  const row = await prisma.entitlement.findUnique({ where: { userId } });
  if (row && !isExpired(row)) return row;
  return { ...DEFAULT_FREE_ENTITLEMENT, userId };
}

/**
 * assertCanAttempt — the ATOMIC daily-quota gate (§6.4). Kills the TOCTOU window that a
 * count-then-insert check would open under concurrent submissions.
 *
 * Algorithm:
 *   1. Read the entitlement quota. `dailyQuota == null` → Plus (unlimited) → return immediately.
 *   2. Ensure today's DailyUserStat row exists (upsert with attempts starting at 0; the CREATE
 *      path sets attempts:0 and the conditional UPDATE below does the actual +1, so the first
 *      attempt of the day is counted exactly once).
 *   3. Do a conditional atomic increment:
 *        UPDATE "DailyUserStat" SET attempts = attempts + 1
 *        WHERE "userId" = $1 AND day = $2 AND attempts < $quota
 *      If 0 rows are affected the quota is already spent → throw PaymentRequiredError.
 *
 * Pass the same `tx` used by the attempt write so the increment is atomic with the grade.
 * This is the ONLY writer of `DailyUserStat.attempts`.
 */
export async function assertCanAttempt(userId: string, tx?: Db): Promise<void> {
  const db: Db = tx ?? prisma;

  const ent = await db.entitlement.findUnique({
    where: { userId },
    select: { dailyQuota: true, validUntil: true },
  });
  // No row → free plan default quota; null quota → unlimited (Plus). BUT an EXPIRED snapshot (#4)
  // must NOT take the unlimited early-return — it falls back to the free daily quota so the atomic
  // gate below still counts it, even if the stored quota is null (stale Plus). Mirrors get().
  const quota =
    ent && !isExpired(ent) ? ent.dailyQuota : DEFAULT_FREE_ENTITLEMENT.dailyQuota;
  if (quota === null || quota === undefined) return; // Plus / unlimited → no gate.

  const day = today();

  // Ensure the row exists with attempts:0 (create path). We do NOT increment here — the
  // conditional UPDATE below owns the +1 so it is counted exactly once and stays gated.
  await db.dailyUserStat.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, attempts: 0, correct: 0, objectiveAttempts: 0, studyMs: 0 },
    update: {},
  });

  // Atomic conditional increment: only succeeds while attempts < quota.
  const affected = await db.$executeRaw`
    UPDATE "DailyUserStat"
       SET "attempts" = "attempts" + 1
     WHERE "userId" = ${userId}
       AND "day" = ${day}
       AND "attempts" < ${quota}
  `;

  if (affected === 0) {
    throw new PaymentRequiredError("QUOTA_EXCEEDED");
  }
}

/**
 * assertBankAccess — premium-bank gate (§6.4). If the bank is premium and the user lacks
 * premiumBanks entitlement, throw. A non-premium bank is always accessible.
 */
export async function assertBankAccess(userId: string, bankId: string): Promise<void> {
  const bank = await prisma.questionBank.findUnique({
    where: { id: bankId },
    select: { isPremium: true },
  });
  // Unknown bank → let downstream NotFound handle it; only gate when known-premium.
  if (!bank || !bank.isPremium) return;

  const ent = await get(userId);
  if (!ent.premiumBanks) {
    throw new PaymentRequiredError("PREMIUM_BANK_REQUIRED");
  }
}

/** assertExamMode — exam-mode gate (§6.4). Throws when the entitlement disables exam mode. */
export async function assertExamMode(userId: string): Promise<void> {
  const ent = await get(userId);
  if (!ent.examMode) {
    throw new PaymentRequiredError("EXAM_MODE_REQUIRED");
  }
}

// ============================================================
//  WRITE SIDE (§6.3–6.4) — webhook-driven entitlement derivation + Stripe customer bootstrap.
// ============================================================

/** Effective-tier statuses: an active-ish subscription grants its tier; past_due grants until the
 *  period end (grace window, §6.3). Anything else → free. */
function isEffectivelyEntitled(
  status: string,
  currentPeriodEnd: Date | null,
  now: Date,
): boolean {
  if (status === "active" || status === "trialing") return true;
  // Grace: keep access while a past_due sub is still inside its paid period.
  if (status === "past_due") return currentPeriodEnd !== null && now < currentPeriodEnd;
  return false;
}

/**
 * rebuildEntitlement — the SINGLE place the denormalized Entitlement snapshot is (re)derived
 * (§6.3–6.4). Pure of Stripe: it reads the user's LOCAL Subscription + the matching Plan row and
 * upserts the Entitlement to mirror the resolved tier's Plan config. Driven entirely by local
 * Subscription+Plan state, so it is deterministic and replayable.
 *
 * Resolution:
 *   1. Read Subscription. No sub → free.
 *   2. If the sub's status is effectively entitled (active/trialing, or past_due within period),
 *      the effective tier is the sub's tier (plus); otherwise free.
 *   3. Load the Plan row for the effective tier (fallback to the sub's tier's Plan, then a static
 *      free default) and upsert Entitlement{tier, dailyQuota, premiumBanks, examMode, aiExplain,
 *      validUntil = currentPeriodEnd}.
 *
 * Pass the same `tx` as the webhook's $transaction so the entitlement change is atomic with the
 * ProcessedStripeEvent insert and the Subscription upsert.
 */
export async function rebuildEntitlement(userId: string, tx?: Db): Promise<void> {
  const db: Db = tx ?? prisma;
  const now = new Date();

  const sub = await db.subscription.findUnique({ where: { userId } });

  const entitled =
    sub !== null && isEffectivelyEntitled(sub.status, sub.currentPeriodEnd, now);
  const effectiveTier: PlanTier = entitled ? sub!.tier : "free";

  // Plan config for the effective tier is the source of the quota/flags. FREE-FOR-ALL RELEASE: both
  // tiers grant everything this release (mirrors DEFAULT_FREE_ENTITLEMENT and the seeded Plan rows),
  // so the fallback used when the Plan row is missing (unseeded env) also grants everything — the
  // paywall stays physically unreachable even with an empty Plan table. `aiExplain` is false (no AI
  // feature this release). The tier label itself is still `effectiveTier`, so a webhook downgrade to
  // free is recorded faithfully; it just no longer strips any capability.
  const plan = await db.plan.findUnique({ where: { tier: effectiveTier } });

  const config =
    plan ?? {
      dailyQuota: null, // null = unlimited → the atomic quota gate short-circuits, no daily cap.
      premiumBanks: true,
      examMode: true,
      aiExplain: false,
    };

  // validUntil mirrors the subscription period end only while entitled (free → no expiry).
  const validUntil = entitled ? (sub!.currentPeriodEnd ?? null) : null;

  const data = {
    tier: effectiveTier,
    dailyQuota: config.dailyQuota,
    premiumBanks: config.premiumBanks,
    examMode: config.examMode,
    aiExplain: config.aiExplain,
    validUntil,
  };

  await db.entitlement.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/**
 * ensureStripeCustomer — return the user's existing stripeCustomerId, or create a Stripe customer
 * (via getStripe) and persist it (§6.2). Not part of the entitlement grant path — it only provisions
 * the customer used by checkout/portal. getStripe() throws PaymentRequiredError when billing is
 * unconfigured, which the action boundary maps to a friendly error.
 */
export async function ensureStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true, email: true, name: true },
  });
  if (!user) throw new PaymentRequiredError("用户不存在");
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name ?? undefined,
    // Reverse pointer so a customer found in the Stripe dashboard maps back to our user.
    metadata: { userId },
  });

  // Persist so we never create a duplicate customer for the same user.
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });
  logger.info("stripe_customer_created", { userId, customerId: customer.id });
  return customer.id;
}

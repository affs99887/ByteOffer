// lib/server/services/billingService.ts
// Stripe billing service (architecture.md §6.2–6.3, §10). One of the ONLY layers touching Prisma.
// Three responsibilities:
//   1. createCheckoutSession — start a subscription Checkout for a validated price.
//   2. createBillingPortal    — a self-service Billing Portal session (cancel/change card).
//   3. handleWebhookEvent     — the ONLY entitlement-change source. Verifies the signature, then in
//      ONE transaction inserts ProcessedStripeEvent FIRST (idempotency ledger), syncs the local
//      Subscription, and rebuilds the Entitlement snapshot. A replayed event.id short-circuits.
//
// SECURITY INVARIANTS:
//   - priceId is validated against the configured STRIPE_PRICE_PLUS_MONTHLY/YEARLY (mass-assignment
//     guard §6.2) — arbitrary prices are rejected. A checkout NEVER grants entitlement; only the
//     webhook does, and only after signature verification (§6.3, §10).
//   - Idempotency is PERSISTENT: ProcessedStripeEvent.id (= Stripe event.id) is inserted in the same
//     tx as the entitlement change; a unique-constraint conflict means "already processed" → no-op.
//     This defeats Stripe retries and concurrent redelivery double-grants (§6.3, §10).

import Stripe from "stripe";
import { prisma } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { ValidationError } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import { getStripe, getWebhookSecret } from "@/lib/server/stripe";
import * as analyticsService from "@/lib/server/services/analyticsService";
import * as entitlementService from "@/lib/server/services/entitlementService";
import type { Prisma, SubStatus } from "@prisma/client";

/** The absolute origin for success/cancel redirect URLs (AUTH_URL doubles as the app base URL). */
function appBaseUrl(): string {
  // AUTH_URL is a required, validated env var (lib/server/env.ts). Strip a trailing slash so we can
  // append paths cleanly.
  return env.AUTH_URL.replace(/\/+$/, "");
}

/** The set of Stripe price ids we allow at checkout — exactly the two configured Plus prices. */
function configuredPriceIds(): string[] {
  return [env.STRIPE_PRICE_PLUS_MONTHLY, env.STRIPE_PRICE_PLUS_YEARLY].filter(
    (p): p is string => p !== "",
  );
}

/** Narrow a Stripe subscription status string to our SubStatus enum (they share the same values). */
function toSubStatus(status: string): SubStatus {
  const allowed: SubStatus[] = [
    "active",
    "trialing",
    "past_due",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
  ];
  return (allowed as string[]).includes(status) ? (status as SubStatus) : "incomplete";
}

/**
 * periodEndOf — read the current period end from a Stripe Subscription. In the stripe@22 API
 * (2026-06-24.dahlia) `current_period_end` lives on each SubscriptionItem, not the top-level
 * Subscription, so we take the earliest item's period end (the subscription's effective renewal).
 * Returns null when unavailable (guards against shape drift). Values are UNIX seconds → Date.
 */
function periodEndOf(sub: Stripe.Subscription): Date | null {
  const ends: number[] = [];
  for (const item of sub.items?.data ?? []) {
    const end = (item as { current_period_end?: number }).current_period_end;
    if (typeof end === "number") ends.push(end);
  }
  if (ends.length === 0) return null;
  return new Date(Math.min(...ends) * 1000);
}

/** The Plus price id currently on a subscription (first item's price), or null. */
function priceIdOf(sub: Stripe.Subscription): string | null {
  const price = sub.items?.data?.[0]?.price;
  return price?.id ?? null;
}

/**
 * tierForSubscription — the tier a subscription grants, VALIDATED against the configured Plus
 * prices (should-fix #5). The webhook grant path previously hardcoded tier:"plus" on status alone;
 * a sub on a legacy/dashboard/removed price would still grant full Plus. Here we grant "plus" only
 * when the sub's actual price is one we configure, else "free" — mirroring createCheckoutSession's
 * up-front price validation. Applied to every grant branch consistently.
 */
function tierForSubscription(sub: Stripe.Subscription): "free" | "plus" {
  return configuredPriceIds().includes(priceIdOf(sub) ?? "") ? "plus" : "free";
}

// ============================================================
//  Checkout / Portal (§6.2)
// ============================================================

/**
 * createCheckoutSession — start a subscription Checkout for `priceId` (§6.2). requireUser runs
 * upstream (in the action). Validates priceId against the configured prices (mass-assignment guard),
 * ensures a Stripe customer, and creates the session with client_reference_id=userId so the webhook
 * can resolve the user. Returns { url } for a client-side redirect. Never grants entitlement.
 */
export async function createCheckoutSession(
  userId: string,
  priceId: string,
): Promise<{ url: string }> {
  const allowed = configuredPriceIds();
  if (!allowed.includes(priceId)) {
    // Reject arbitrary prices — only the configured Plus month/year prices are purchasable.
    throw new ValidationError("无效的套餐", { priceId: "不支持的价格" });
  }

  const stripe = getStripe();
  const customer = await entitlementService.ensureStripeCustomer(userId);
  const base = appBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    // Persist the userId on the subscription too, as a belt-and-suspenders resolver for webhook
    // events whose client_reference_id is not present (subscription.* events).
    subscription_data: { metadata: { userId } },
    success_url: `${base}/billing?checkout=success`,
    cancel_url: `${base}/pricing?checkout=cancel`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new ValidationError("无法创建结账会话");
  }
  logger.info("checkout_session_created", { userId, priceId, sessionId: session.id });
  // Funnel event (§7.1): checkout started. Fire-and-forget — never blocks the redirect.
  void analyticsService.track("checkout.started", { priceId, sessionId: session.id }, userId);
  return { url: session.url };
}

/**
 * createBillingPortal — a Billing Portal session for the user's Stripe customer (§6.2) so they can
 * self-serve cancel / change card / view invoices. Returns { url }.
 */
export async function createBillingPortal(userId: string): Promise<{ url: string }> {
  const stripe = getStripe();
  const customer = await entitlementService.ensureStripeCustomer(userId);
  const base = appBaseUrl();

  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: `${base}/billing`,
  });
  return { url: session.url };
}

// ============================================================
//  Webhook — the ONLY entitlement-change source (§6.3)
// ============================================================

export interface WebhookResult {
  /** true when the event.id was already processed (idempotent no-op). */
  duplicate: boolean;
  /** true when the event type was handled (a Subscription sync ran). false for ignored types. */
  handled: boolean;
  type: string;
}

/**
 * handleWebhookEvent — verify + process a Stripe webhook (§6.3, §10).
 *
 * Flow:
 *   1. constructEvent(rawBody, signature, webhookSecret) — throws on a forged/invalid signature
 *      (the route handler maps that to a 400). This is the trust boundary.
 *   2. In ONE prisma.$transaction:
 *        a. INSERT ProcessedStripeEvent{id:event.id, type} FIRST. On a unique-constraint conflict
 *           (P2002) the event was already processed → return {duplicate:true} and do nothing else.
 *           This is the idempotency guarantee — it defeats Stripe retries and concurrent redelivery.
 *        b. Apply the type-specific Subscription upsert.
 *        c. rebuildEntitlement(userId, tx) — derive the Entitlement snapshot from the freshly-synced
 *           local Subscription + Plan, atomically with (a) and (b).
 *
 * Entitlement is granted/revoked ONLY here.
 */
export async function handleWebhookEvent(
  rawBody: string,
  signature: string | null,
): Promise<WebhookResult> {
  if (!signature) {
    // No signature header → cannot verify → treat as a signature failure (route → 400).
    throw new SignatureVerificationError("missing stripe-signature header");
  }

  const stripe = getStripe();
  const secret = getWebhookSecret();

  // constructEvent throws Stripe.errors.StripeSignatureVerificationError on a bad signature.
  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

  return prisma.$transaction(async (tx) => {
    // (a) Idempotency ledger FIRST. If this throws P2002, the event is a duplicate.
    try {
      await tx.processedStripeEvent.create({
        data: { id: event.id, type: event.type },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        logger.info("stripe_webhook_duplicate", { id: event.id, type: event.type });
        return { duplicate: true, handled: false, type: event.type };
      }
      throw err;
    }

    // (b)+(c) Type-specific handling. Any userId we resolve gets its entitlement rebuilt.
    const handled = await applyEvent(tx, stripe, event);
    return { duplicate: false, handled, type: event.type };
  });
}

/**
 * applyEvent — the per-type Subscription sync + entitlement rebuild, inside the webhook tx.
 * Returns true when the event was one we act on. Unknown/ignored types are a no-op (still recorded
 * in the ledger so they are not reprocessed).
 */
async function applyEvent(
  tx: Prisma.TransactionClient,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      if (!userId) {
        logger.warn("checkout_completed_no_user", { sessionId: session.id });
        return false;
      }
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null);
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : (session.customer?.id ?? null);

      // Fetch the authoritative subscription to read status/period/price (the session carries only
      // the id). This is a read, not a grant — the grant is the local upsert + rebuild below.
      let periodEnd: Date | null = null;
      let status: SubStatus = "active";
      let priceId: string | null = null;
      let cancelAtPeriodEnd = false;
      // #5: grant tier is derived from the sub's validated price, not hardcoded. Default free until
      // we confirm the price (a checkout with no subscription id cannot be a Plus grant).
      let tier: "free" | "plus" = "free";
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        periodEnd = periodEndOf(sub);
        status = toSubStatus(sub.status);
        priceId = priceIdOf(sub);
        cancelAtPeriodEnd = sub.cancel_at_period_end;
        tier = tierForSubscription(sub);
      }

      await upsertSubscription(tx, userId, {
        tier,
        status,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd,
      });
      // Persist the customer id if the user did not have one yet (idempotent).
      if (customerId) await ensureUserCustomer(tx, userId, customerId);

      await entitlementService.rebuildEntitlement(userId, tx);
      logger.info("subscription_activated", { userId, subscriptionId });
      // Funnel event (§7.1): subscription activated. In-tx emit — atomic with the entitlement grant.
      await analyticsService.trackTx(tx, "subscription.activated", { subscriptionId, priceId }, userId);
      return true;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdFromSubscription(tx, stripe, sub);
      if (!userId) return false;

      await upsertSubscription(tx, userId, {
        tier: tierForSubscription(sub), // #5: validate the price, don't hardcode plus
        status: toSubStatus(sub.status),
        stripeSubscriptionId: sub.id,
        stripePriceId: priceIdOf(sub),
        currentPeriodEnd: periodEndOf(sub),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });
      await entitlementService.rebuildEntitlement(userId, tx);
      return true;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdFromSubscription(tx, stripe, sub);
      if (!userId) return false;

      await upsertSubscription(tx, userId, {
        tier: "free",
        status: "canceled",
        stripeSubscriptionId: sub.id,
        stripePriceId: priceIdOf(sub),
        currentPeriodEnd: periodEndOf(sub),
        cancelAtPeriodEnd: false,
      });
      await entitlementService.rebuildEntitlement(userId, tx);
      logger.info("subscription_canceled", { userId, subscriptionId: sub.id });
      // Funnel event (§7.1): subscription canceled. In-tx emit — atomic with the revoke.
      await analyticsService.trackTx(tx, "subscription.canceled", { subscriptionId: sub.id }, userId);
      return true;
    }

    case "invoice.payment_failed": {
      const sub = await subscriptionFromInvoice(stripe, event.data.object as Stripe.Invoice);
      if (!sub) return false;
      const userId = await resolveUserIdFromSubscription(tx, stripe, sub);
      if (!userId) return false;

      // past_due keeps access until currentPeriodEnd (grace window, §6.3). rebuildEntitlement
      // applies the grace by checking now < currentPeriodEnd.
      await upsertSubscription(tx, userId, {
        tier: tierForSubscription(sub), // #5: validate the price (grace only for a configured Plus)
        status: "past_due",
        stripeSubscriptionId: sub.id,
        stripePriceId: priceIdOf(sub),
        currentPeriodEnd: periodEndOf(sub),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });
      await entitlementService.rebuildEntitlement(userId, tx);
      return true;
    }

    case "invoice.paid": {
      const sub = await subscriptionFromInvoice(stripe, event.data.object as Stripe.Invoice);
      if (!sub) return false;
      const userId = await resolveUserIdFromSubscription(tx, stripe, sub);
      if (!userId) return false;

      // Payment succeeded → confirm active and extend the period.
      await upsertSubscription(tx, userId, {
        tier: tierForSubscription(sub), // #5: validate the price, don't hardcode plus
        status: toSubStatus(sub.status),
        stripeSubscriptionId: sub.id,
        stripePriceId: priceIdOf(sub),
        currentPeriodEnd: periodEndOf(sub),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });
      await entitlementService.rebuildEntitlement(userId, tx);
      return true;
    }

    default:
      // Unhandled event type — recorded in the ledger, no state change.
      return false;
  }
}

// ---- Subscription upsert + user/customer resolution helpers ----

interface SubscriptionSync {
  tier: "free" | "plus";
  status: SubStatus;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Upsert the local Subscription row for a user (keyed by the unique userId). */
async function upsertSubscription(
  tx: Prisma.TransactionClient,
  userId: string,
  data: SubscriptionSync,
): Promise<void> {
  await tx.subscription.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/** Persist a Stripe customer id on the user if not already set (idempotent, inside the tx). */
async function ensureUserCustomer(
  tx: Prisma.TransactionClient,
  userId: string,
  customerId: string,
): Promise<void> {
  await tx.user.updateMany({
    where: { id: userId, stripeCustomerId: null },
    data: { stripeCustomerId: customerId },
  });
}

/**
 * resolveUserIdFromSubscription — map a Stripe subscription back to our userId. Order of resolution:
 *   1. subscription.metadata.userId (set at checkout via subscription_data.metadata).
 *   2. A local Subscription row already linked by stripeSubscriptionId.
 *   3. The User carrying this subscription's customer id (stripeCustomerId).
 * Returns null when the subscription cannot be attributed (logged; the event is still recorded).
 */
async function resolveUserIdFromSubscription(
  tx: Prisma.TransactionClient,
  _stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const metaUser = sub.metadata?.userId;
  if (metaUser) return metaUser;

  const existing = await tx.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
    select: { userId: true },
  });
  if (existing) return existing.userId;

  const customerId =
    typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null);
  if (customerId) {
    const user = await tx.user.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    if (user) return user.id;
  }

  logger.warn("subscription_unresolved_user", { subscriptionId: sub.id });
  return null;
}

/**
 * subscriptionFromInvoice — resolve the Subscription behind an invoice, then re-fetch it for the
 * authoritative status/period. In stripe@22 the subscription reference lives on
 * invoice.parent.subscription_details.subscription (the top-level invoice.subscription was removed).
 * Returns null when the invoice is not subscription-related.
 */
async function subscriptionFromInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<Stripe.Subscription | null> {
  const parent = (invoice as { parent?: { subscription_details?: { subscription?: unknown } } })
    .parent;
  const ref = parent?.subscription_details?.subscription;
  const subId =
    typeof ref === "string"
      ? ref
      : ref && typeof ref === "object" && "id" in ref
        ? String((ref as { id: unknown }).id)
        : null;
  if (!subId) return null;
  return stripe.subscriptions.retrieve(subId);
}

// ---- Error helpers ----

/** A Prisma unique-constraint violation (used to detect the duplicate-event race on the ledger). */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/**
 * SignatureVerificationError — thrown for a missing/invalid webhook signature so the route handler
 * can distinguish "reject with 400" from an internal error (which it acks with 200 to avoid retry
 * storms, §10). Re-uses Stripe's own error class name via a subclass check in the route.
 */
export class SignatureVerificationError extends Error {
  constructor(message = "webhook signature verification failed") {
    super(message);
    this.name = "SignatureVerificationError";
  }
}

/** True when an error is a Stripe (or our) signature-verification failure. */
export function isSignatureError(err: unknown): boolean {
  return (
    err instanceof SignatureVerificationError ||
    err instanceof Stripe.errors.StripeSignatureVerificationError
  );
}

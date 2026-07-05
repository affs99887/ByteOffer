"use server";

// lib/actions/billing.ts
// Thin billing Server Actions (architecture §4.2, §6.2, §6.5). Each is defineAction(schema, guard,
// handler): requireUser is the authoritative security boundary and the handler delegates to
// billingService / entitlementService (actions never import prisma directly). Checkout/portal return
// a friendly error when billing is not configured (!hasStripe) instead of surfacing a raw failure.
//
// Entitlement is NEVER granted here — createCheckoutSession only starts a Checkout; the actual grant
// happens exclusively in the verified webhook path (billingService.handleWebhookEvent, §6.3).

import { defineAction } from "@/lib/server/action";
import type { ActionResult } from "@/lib/server/action";
import { requireUser } from "@/lib/server/guards";
import { assertRateLimit } from "@/lib/server/ratelimit";
import { hasStripe } from "@/lib/server/env";
import { prisma } from "@/lib/server/db";
import { getStripe } from "@/lib/server/stripe";
import { logger } from "@/lib/server/logger";
import * as billingService from "@/lib/server/services/billingService";
import { createCheckoutSchema, emptySchema } from "@/lib/validation/billing";

/** A friendly, stable "billing disabled" result the client can render as a banner. */
function billingDisabled<T>(): ActionResult<T> {
  return {
    ok: false,
    error: { code: "PAYMENT_REQUIRED", message: "支付功能暂未开启，请稍后再试" },
  };
}

/**
 * createCheckoutSessionAction — start a subscription Checkout for {priceId} (§6.2). requireUser is
 * the boundary; the service validates priceId against the configured prices (mass-assignment guard).
 * Returns {url} for a client-side redirect. Friendly error when Stripe is not configured.
 */
export async function createCheckoutSessionAction(
  input: unknown,
): Promise<ActionResult<{ url: string }>> {
  if (!hasStripe()) return billingDisabled();
  return defineAction(createCheckoutSchema, requireUser, async (parsed, user) => {
    // Low cap (§10): each call hits the Stripe API + may create a customer; throttle abuse.
    await assertRateLimit("billing:checkout", user.id, { limit: 10, windowSec: 60 });
    return billingService.createCheckoutSession(user.id, parsed.priceId);
  })(input);
}

/**
 * createBillingPortalAction — a Billing Portal session for self-serve manage/cancel (§6.2). Friendly
 * error when Stripe is not configured.
 */
export async function createBillingPortalAction(): Promise<ActionResult<{ url: string }>> {
  if (!hasStripe()) return billingDisabled();
  return defineAction(emptySchema, requireUser, async (_parsed, user) =>
    billingService.createBillingPortal(user.id),
  )({});
}

/**
 * deleteAccountAction — hard-delete the session user (§6.5). If the user has a live Stripe
 * subscription, cancel it FIRST (so they are not billed after deletion), then delete the local User;
 * the schema's onDelete: Cascade removes all owned rows (subscription/entitlement/attempts/…). The
 * cancel is best-effort: a Stripe failure is logged but does not block the local deletion (the
 * account must still be removable). Returns {ok}.
 */
export const deleteAccountAction = defineAction(
  emptySchema,
  requireUser,
  async (_parsed, user): Promise<{ ok: true }> => {
    // Cancel a live subscription first (only when billing is configured and one exists).
    if (hasStripe()) {
      const sub = await prisma.subscription.findUnique({
        where: { userId: user.id },
        select: { stripeSubscriptionId: true, status: true },
      });
      const liveStatuses = ["active", "trialing", "past_due", "unpaid", "incomplete"];
      if (sub?.stripeSubscriptionId && liveStatuses.includes(sub.status)) {
        try {
          await getStripe().subscriptions.cancel(sub.stripeSubscriptionId);
          logger.info("subscription_canceled_on_delete", {
            userId: user.id,
            subscriptionId: sub.stripeSubscriptionId,
          });
        } catch (err) {
          // Do not block account deletion on a Stripe error; record it for follow-up.
          logger.error("subscription_cancel_on_delete_failed", {
            userId: user.id,
            subscriptionId: sub.stripeSubscriptionId,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Local cascade delete (schema onDelete: Cascade handles owned rows).
    await prisma.user.delete({ where: { id: user.id } });
    logger.info("account_deleted", { userId: user.id });
    return { ok: true };
  },
);

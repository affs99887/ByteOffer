// app/api/stripe/webhook/route.ts
// Stripe webhook Route Handler (architecture §4.2, §6.3, §10). This is the ONLY entitlement-change
// source. It needs the RAW request body for signature verification, so it is a Route Handler (not a
// Server Action) and reads req.text() before any parsing.
//
// BILLING-DORMANT RELEASE: no plans are on sale this release, so a running deploy usually has NO
// Stripe env at all. The endpoint stays wired for LEGACY subscribers whose subscriptions Stripe still
// emits events for (§6.3).
//
// Response policy (§10):
//   - Stripe ENABLED (STRIPE_SECRET_KEY set) but STRIPE_WEBHOOK_SECRET MISSING → 500. We cannot verify
//     the signature, so the event must NOT be dropped silently: a 500 makes Stripe RETRY, and once the
//     operator adds the secret the retried event processes. (Previously this fell through to the
//     internal-error branch and acked 200 — a silent drop that never granted the paid entitlement.)
//   - Signature verification failure (forged / missing signature) → 400. Stripe will not retry a 400,
//     and a request we cannot verify must be rejected, never processed.
//   - Handled OR duplicate (idempotent no-op) → 200.
//   - Internal error AFTER a valid signature → log + 200. Acking avoids Stripe retry storms; the event
//     stays unrecorded so a manual replay can reprocess it (dead-letter posture). We DO NOT 500 there,
//     because a transient DB blip would otherwise trigger aggressive Stripe retries.
//   - Stripe FULLY unconfigured (no secret key — billing dormant) → the downstream getStripe() throws
//     a non-signature error and we ack 200: there is nothing to verify or act on, so retries would be
//     pointless against a billing-off deploy.

import { handleWebhookEvent, isSignatureError } from "@/lib/server/services/billingService";
import { env, hasStripe } from "@/lib/server/env";
import { logger } from "@/lib/server/logger";

// Node runtime: the Stripe SDK + crypto signature verification are not Edge-compatible.
export const runtime = "nodejs";
// Never cache/prerender a webhook endpoint.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  // Config gate BEFORE reading the body: if Stripe is enabled but the webhook secret is missing we
  // cannot verify signatures. Respond 500 so Stripe RETRIES rather than us silently dropping a real
  // event with a 200. (When Stripe is fully unconfigured — no secret key — we let the request flow
  // through; getStripe() then throws and we ack 200 below, since billing is dormant and nothing can
  // be processed anyway.)
  if (hasStripe() && env.STRIPE_WEBHOOK_SECRET === "") {
    logger.error("stripe_webhook_secret_missing", {
      message:
        "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing; cannot verify webhook signature",
    });
    return new Response("webhook secret not configured", { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  try {
    const result = await handleWebhookEvent(body, sig);
    // 200 for both handled and duplicate (idempotent) events.
    logger.info("stripe_webhook_ok", {
      type: result.type,
      duplicate: result.duplicate,
      handled: result.handled,
    });
    return new Response(null, { status: 200 });
  } catch (err) {
    if (isSignatureError(err)) {
      // Forged/missing signature — reject so it is not processed. Stripe does not retry a 400.
      logger.warn("stripe_webhook_bad_signature", {
        message: err instanceof Error ? err.message : String(err),
      });
      return new Response("invalid signature", { status: 400 });
    }
    // Internal error after a verified signature: ack 200 to avoid retry storms; log for replay.
    logger.error("stripe_webhook_internal_error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return new Response(null, { status: 200 });
  }
}

// app/api/stripe/webhook/route.ts
// Stripe webhook Route Handler (architecture §4.2, §6.3, §10). This is the ONLY entitlement-change
// source. It needs the RAW request body for signature verification, so it is a Route Handler (not a
// Server Action) and reads req.text() before any parsing.
//
// Response policy (§10):
//   - Signature verification failure (forged / missing signature) → 400. Stripe will not retry a 400,
//     and a request we cannot verify must be rejected, never processed.
//   - Handled OR duplicate (idempotent no-op) → 200.
//   - Internal error AFTER a valid signature → log + 200. Acking avoids Stripe retry storms; the
//     event stays unrecorded so a manual replay can reprocess it (dead-letter posture). We DO NOT
//     500 here, because a transient DB blip would otherwise trigger aggressive Stripe retries.

import { handleWebhookEvent, isSignatureError } from "@/lib/server/services/billingService";
import { logger } from "@/lib/server/logger";

// Node runtime: the Stripe SDK + crypto signature verification are not Edge-compatible.
export const runtime = "nodejs";
// Never cache/prerender a webhook endpoint.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
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

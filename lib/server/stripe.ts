// lib/server/stripe.ts
// Lazy Stripe client (architecture.md §6, §10). The SDK must NEVER be constructed at module load,
// because `next build` runs with the placeholder `.env` (empty STRIPE_SECRET_KEY) and instantiating
// `new Stripe("")` — or worse, importing this from a page that gets prerendered — must not crash the
// build. So we construct on first use, only when hasStripe() is true, and cache the instance.
//
// getStripe() throws a typed PaymentRequiredError when billing is not configured, so every caller
// (billingService, deleteAccountAction) fails gracefully with a friendly {ok:false} instead of a
// raw TypeError. The webhook-secret accessor is here too so the route handler never reads env
// directly.

import Stripe from "stripe";
import { env, hasStripe } from "@/lib/server/env";
import { PaymentRequiredError } from "@/lib/server/errors";

// Pin the API version that ships with stripe@22 (2026-06-24.dahlia). Pinning (rather than relying on
// the account default) keeps request/response shapes stable across dashboard upgrades — the SDK's
// TypeScript types are generated for exactly this version. If this SDK is bumped, update the pin.
const API_VERSION = "2026-06-24.dahlia" as const;

let client: Stripe | null = null;

/**
 * getStripe — the lazily-constructed, cached Stripe client. Throws PaymentRequiredError when the
 * secret key is not configured (build/dev with the placeholder env) so callers degrade gracefully
 * instead of crashing. NEVER call this at module top-level — only inside request handlers.
 */
export function getStripe(): Stripe {
  if (!hasStripe()) {
    throw new PaymentRequiredError("支付功能暂未开启");
  }
  if (client) return client;
  client = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: API_VERSION });
  return client;
}

/**
 * getWebhookSecret — the Stripe webhook signing secret (whsec_…). Throws when unset so the route
 * handler can respond 400 (a webhook with no configured secret cannot be verified and must be
 * rejected — never processed unverified).
 */
export function getWebhookSecret(): string {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new PaymentRequiredError("Webhook 未配置");
  }
  return secret;
}

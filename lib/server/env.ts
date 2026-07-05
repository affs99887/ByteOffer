// lib/server/env.ts
// Validated, typed environment (architecture.md §10, §11). Parsed at module load.
//
// BUILD-SAFE contract: `next build` runs with the placeholder `.env`, so constraints are
// intentionally loose (no `sk_`/`whsec_` prefix checks, no URL-shape enforcement beyond a
// minimal string). If parsing fails in production we throw (fail-fast per §10); otherwise
// (dev / build / test) we fall back to the raw values so tooling never hard-crashes.

import { z } from "zod";

// Non-empty required strings. AUTH_SECRET keeps its ≥16 floor (the placeholder secret is
// >16 chars, so the placeholder .env still passes).
const requiredStr = z.string().min(1);

const envSchema = z.object({
  // ---- Database ----
  DATABASE_URL: requiredStr,
  DIRECT_URL: requiredStr,

  // ---- Auth.js ----
  AUTH_SECRET: z.string().min(16),
  AUTH_URL: requiredStr,

  // ---- OAuth (optional) ----
  AUTH_GITHUB_ID: z.string().default(""),
  AUTH_GITHUB_SECRET: z.string().default(""),
  AUTH_GOOGLE_ID: z.string().default(""),
  AUTH_GOOGLE_SECRET: z.string().default(""),

  // ---- Stripe (optional) ----
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  NEXT_PUBLIC_STRIPE_PK: z.string().default(""),
  STRIPE_PRICE_PLUS_MONTHLY: z.string().default(""),
  STRIPE_PRICE_PLUS_YEARLY: z.string().default(""),

  // ---- Email (optional) ----
  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default(""),

  // ---- Bootstrap admin (optional; used by prisma/seed.ts) ----
  ADMIN_EMAIL: z.string().default(""),
  ADMIN_PASSWORD: z.string().default(""),

  // ---- Optional ops ----
  SENTRY_DSN: z.string().default(""),
  UPSTASH_REDIS_REST_URL: z.string().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().default(""),
  // Shared secret guarding the nightly reconciliation cron route (§7.2 / §11). Optional: when unset,
  // the route is disabled (returns 404) so a misconfigured deploy can't run it unauthenticated.
  CRON_SECRET: z.string().default(""),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  // `next build` runs with NODE_ENV=production but collects page data by IMPORTING route modules —
  // runtime secrets (DATABASE_URL/AUTH_SECRET/…) are legitimately absent then and must NOT crash the
  // build. Next sets NEXT_PHASE=phase-production-build during the build; Vercel builds have no .env.
  // So we fail-fast ONLY at real runtime (a running production server), never during the build phase.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const isProd = process.env.NODE_ENV === "production";
  const flat = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");

  if (isProd && !isBuildPhase) {
    // Fail-fast at production RUNTIME (§10): a live deployment must have valid secrets.
    throw new Error(`Invalid environment variables:\n${flat}`);
  }

  // Fail-soft during dev / build / test: warn once and continue with a best-effort object
  // so `next build` and local tooling never hard-crash on placeholder values.
  // eslint-disable-next-line no-console
  console.warn(`[env] Non-fatal environment validation issues (dev/build):\n${flat}`);
  return {
    ...(process.env as unknown as Env),
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID ?? "",
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET ?? "",
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ?? "",
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET ?? "",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    NEXT_PUBLIC_STRIPE_PK: process.env.NEXT_PUBLIC_STRIPE_PK ?? "",
    STRIPE_PRICE_PLUS_MONTHLY: process.env.STRIPE_PRICE_PLUS_MONTHLY ?? "",
    STRIPE_PRICE_PLUS_YEARLY: process.env.STRIPE_PRICE_PLUS_YEARLY ?? "",
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
    EMAIL_FROM: process.env.EMAIL_FROM ?? "",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "",
    SENTRY_DSN: process.env.SENTRY_DSN ?? "",
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ?? "",
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
    CRON_SECRET: process.env.CRON_SECRET ?? "",
    NODE_ENV: (process.env.NODE_ENV as Env["NODE_ENV"]) ?? "development",
  };
}

export const env: Env = loadEnv();

/** True when both id+secret for the given OAuth provider are configured (non-empty). */
export function hasOAuth(provider: "github" | "google"): boolean {
  if (provider === "github") return env.AUTH_GITHUB_ID !== "" && env.AUTH_GITHUB_SECRET !== "";
  return env.AUTH_GOOGLE_ID !== "" && env.AUTH_GOOGLE_SECRET !== "";
}

/** True when the minimal Stripe secret is configured (billing enabled). */
export function hasStripe(): boolean {
  return env.STRIPE_SECRET_KEY !== "";
}

# ByteOffer — Deployment & Ops Runbook

Concise operational guide for shipping ByteOffer. See
[`docs/design/architecture.md`](design/architecture.md) §10 (security & hardening) and §11 (deploy)
for the authoritative rationale.

Two supported targets:

- **Vercel + Neon Postgres** (recommended) — native App Router / Server Actions, Neon's pooled +
  direct URLs, branchable DBs for CI.
- **Docker** (self-host) — the multi-stage [`Dockerfile`](../Dockerfile) builds the Next standalone
  output and runs `node server.js` against any managed Postgres.

The rate limiter defaults to a **Postgres** fixed-window token bucket, so no external Redis is
required for v1 (an Upstash path is optional).

---

## 1. Environment variables

All env is validated at startup by `lib/server/env.ts` (zod). In **production** (`NODE_ENV=production`)
a missing/invalid required var **fails fast**; in dev/build it fails soft so tooling never crashes.
Never prefix a secret with `NEXT_PUBLIC_` — only `NEXT_PUBLIC_STRIPE_PK` is intentionally public.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Pooled (PgBouncer) connection used by the app at runtime. |
| `DIRECT_URL` | ✅ | Non-pooled connection used by `prisma migrate` only. |
| `AUTH_SECRET` | ✅ | Auth.js JWT/signing secret (≥16 chars). `openssl rand -base64 33`. |
| `AUTH_URL` | ✅ | Canonical app URL (e.g. `https://byteoffer.example.com`). |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | optional | GitHub OAuth (both set → provider enabled). |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | optional | Google OAuth (both set → provider enabled). |
| `STRIPE_SECRET_KEY` | optional (dormant)* | Stripe API key. **Billing is dormant this release — nothing is on sale.** Leave unset for a normal deploy; the app runs fully and no billing/checkout UI is shown. |
| `STRIPE_WEBHOOK_SECRET` | optional (dormant)* | Verifies `/api/stripe/webhook` signatures. Only needed to keep processing webhooks for **legacy subscribers**. ⚠ If `STRIPE_SECRET_KEY` **is** set this **must** be set too — otherwise the webhook returns **500** (so Stripe retries) rather than silently dropping the event. |
| `NEXT_PUBLIC_STRIPE_PK` | optional (dormant)* | Stripe publishable key (client). Public by design. |
| `STRIPE_PRICE_PLUS_MONTHLY` / `STRIPE_PRICE_PLUS_YEARLY` | optional (dormant)* | Legacy Plus price ids (checkout allowlist). Unused while billing is dormant. |
| `RESEND_API_KEY` / `EMAIL_FROM` | required for email | Transactional email (verification / password reset). **Both must be set for real email to send.** Unset → the app degrades gracefully into a **no-email mode** (it does not crash), so email-dependent flows are limited. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | recommended | Bootstrap admin created by `prisma db seed`. |
| `SENTRY_DSN` | optional | Error monitoring. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | optional | Switches the rate limiter to Redis (v2). |
| `CRON_SECRET` | **required on Vercel** | Guards `/api/cron/reconcile`. **Unset → the cron route is disabled (404)**, so the nightly reconcile declared in `vercel.json` silently no-ops. Set it on Vercel (self-host: set it if you schedule the reconcile). |

\* Stripe vars are only relevant if you re-enable billing for legacy subscribers; without them the app
runs fully and all billing UI is simply absent (this release ships with billing dormant — every
feature is free).

Copy [`.env.example`](../.env.example) → `.env` and fill real values.

---

## 2. Database: migrate & seed

Migrations live in `prisma/migrations/`. The initial migration appends raw SQL (a `CHECK
(payload->>'type' = type::text)` constraint + GIN indexes); a later `*_ratelimit` migration adds the
`RateLimit` table.

```bash
# Apply all migrations (uses DIRECT_URL). Run as a release step on every deploy.
npx prisma migrate deploy

# Seed Plans (free/plus) + the bootstrap admin + a sample published bank. Idempotent (upserts) —
# safe to run once per environment.
npx prisma db seed
```

On **Vercel**, add `prisma generate && prisma migrate deploy` to the build/release step, and run
`prisma db seed` once against the target Neon branch (e.g. from a local shell pointed at the prod
`DIRECT_URL`, or a one-off job).

For **Docker**, run `prisma migrate deploy` from within the image (the schema + migrations are copied
in) before starting the container:

```bash
docker build -t byteoffer .
docker run --rm --env-file .env byteoffer npx prisma migrate deploy   # release step
docker run -p 3000:3000 --env-file .env byteoffer                     # start
```

---

## 3. Admin bootstrap

The **first** admin is created exclusively by `prisma db seed` from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
— never through any client path. After seeding, sign in with those credentials to reach `/admin`.

Promote/demote further admins from **/admin/users** (`setUserRoleAction`). A guard forbids demoting
the **last** admin. Because sessions are JWT, a role change takes effect on the next token refresh —
force a re-login after promoting an admin.

---

## 4. Stripe — production webhook

> **This release ships with billing dormant** — every feature is free and nothing is on sale, so a
> normal deploy needs **no** Stripe env at all and can skip this section. Configure Stripe **only** to
> keep servicing **legacy subscribers** (the server billing infra — webhook / portal / billingService
> — stays intact for them).

Entitlement changes happen **only** in the verified webhook path; the client success redirect never
grants access.

1. In the Stripe Dashboard (live mode), add a webhook endpoint:
   `https://<your-domain>/api/stripe/webhook`.
2. Subscribe to: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`.
3. Copy the endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET`.
4. Create one "ByteOffer Plus" product with monthly + yearly recurring prices; put their ids in
   `STRIPE_PRICE_PLUS_MONTHLY` / `STRIPE_PRICE_PLUS_YEARLY`, and mirror them into the `Plan` rows (the
   local `Plan` table is the gating source of truth).

The endpoint is idempotent (a `ProcessedStripeEvent` ledger row is inserted in the same transaction),
returns 400 on a bad signature (no retry), and acks 200 + logs on an internal error after a valid
signature (dead-letter posture, avoids Stripe retry storms). If `STRIPE_SECRET_KEY` is set but
`STRIPE_WEBHOOK_SECRET` is **missing**, the route returns **500** (not 200) so Stripe **retries** —
add the secret and the retried event processes, rather than the event being silently dropped.

**Local testing**: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (test mode).

---

## 5. Cron — nightly reconciliation

`GET/POST /api/cron/reconcile` recomputes recent `DailyUserStat` rows from the authoritative
`Attempt` table (idempotent self-heal; correctness does **not** depend on it — the attempt tx already
materializes counters).

- **Vercel**: [`vercel.json`](../vercel.json) declares the schedule `0 3 * * *` (03:00 UTC daily).
  Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`, so `CRON_SECRET` is
  **required** in the project env. `vercel.json` declares the schedule unconditionally, so if the
  secret is missing the nightly job hits a **404 and silently no-ops** (no alert) — set it.
- **Self-host**: hit the route from any scheduler with either header:
  `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`.
- If `CRON_SECRET` is unset the route is **disabled (404)** so a misconfigured deploy can't run it
  unauthenticated.

---

## 6. Health & observability

- **Liveness/readiness**: `GET /api/health` → `{ ok, db }` (`db: "up" | "down"` via `SELECT 1`).
  Returns **200** when the DB is reachable, **503** when it is not. Point your uptime monitor / load
  balancer here. The response never leaks the underlying error.
- **Logs**: one structured JSON line per event (`lib/server/logger.ts`) — parseable by any
  aggregator. Wire `SENTRY_DSN` for error monitoring if desired.

---

## 7. Security posture (deploy-time checklist)

- CSP + HSTS + `X-Frame-Options` / `X-Content-Type-Options` / `Referrer-Policy` /
  `Permissions-Policy` are set in `proxy.ts` for every response. HSTS is emitted only in production.
- Rate limits are applied at: auth (5 / 15 min per IP+email), attempt submit (60 / min per user), the
  question read path (120 / min per user, anti-scrape), import-confirm and checkout (low caps). The
  limiter **fails open** if its own Postgres store errors (logged) — a limiter outage must not block
  legitimate users.
- Serve over HTTPS only (Vercel does this automatically; behind your own proxy, terminate TLS and set
  `AUTH_URL` to the https origin so cookies are `Secure`).

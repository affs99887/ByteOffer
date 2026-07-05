# ByteOffer · 前端面试刷题系统

ByteOffer is a full-stack, commercial-grade **frontend-interview practice SaaS**. Learners register,
work through a bank of 13 question types (with server-authoritative grading), track wrong answers and
favorites, sit timed mock exams, and see real study analytics. Admins author and import questions;
Plus subscribers unlock premium banks and exam mode via Stripe.

Built with **Next.js 16 (App Router) · React 19 · TypeScript (strict) · Prisma · PostgreSQL ·
Auth.js v5 · Stripe**. The visual layer is a pixel-faithful implementation of the original design,
kept intact while the data source moved from hardcoded arrays to a real backend.

The two authoritative design documents live under [`docs/design/`](docs/design/):

- [`architecture.md`](docs/design/architecture.md) — production architecture (data model, auth/RBAC,
  API surface, grading, Stripe, analytics, security & hardening, deployment).
- [`qbank-data-model.md`](docs/design/qbank-data-model.md) — the question-bank domain: the 13 types,
  grading rules, the import/export interchange format, and round-trip invariants.

---

## Features

### Accounts & auth
- Email/password (argon2id) registration with email verification, plus GitHub/Google OAuth (Auth.js
  v5, JWT sessions). Enumeration-safe register/reset (identical response whether or not the account
  exists). Password reset flow.
- RBAC with three layers of defense: an edge gate (`proxy.ts`), authoritative `requireUser()` /
  `requireAdmin()` guards at every service entry, and ownership-scoped queries (`where:{ userId }`)
  to close IDOR. Admin surfaces return **404** (not 403) to non-admins.

### Question bank — 13 types
| Type | 中文 | Grading | Auto-graded? |
| --- | --- | --- | --- |
| `single_choice` | 单选题 | `auto_exact` | ✅ |
| `true_false` | 判断题 | `auto_exact` | ✅ |
| `multiple_choice` | 多选题 | `auto_set` → `auto_partial` (if `grading.partial`) | ✅ |
| `fill_blank` | 填空题 | `auto_normalized` → `auto_partial` (multi-blank) | ✅ |
| `numeric` | 数值题 | `auto_normalized` (tolerance) | ✅ |
| `code_output` | 输出预测题 | `auto_normalized` | ✅ |
| `ordering` | 排序题 | `auto_set` → `auto_partial` | ✅ |
| `matching` | 匹配题 | `auto_set` → `auto_partial` | ✅ |
| `short_answer` | 简答题 | `self_assess` | 🟡 self-graded |
| `essay` | 问答题 | `self_assess` / `manual_reference` | 🟡 self-graded |
| `code_writing` | 编程题 | `self_assess` / `manual_reference` | 🟡 self-graded |
| `scenario` | 情景多问题 | `composite` (per-part: objective parts auto, subjective parts self) | ⚙️ mixed |
| `cloze` | 完形填空 | `manual_reference` | ⛔ v1 reserved (no grader) |

**Grading is server-authoritative.** Clients submit only a `UserAnswer`, never a score; the server
recomputes the score from the stored `payload` with the same pure `grade()` kernel used on the
client for post-submit reveal. Self-graded (`selfScore ∈ {0, 0.5, 1}`) answers land in a separate
column and are **excluded from the objective accuracy denominator**. Un-answered questions never
receive the answer key **or** the explanation — those are stripped recursively (incl. scenario
parts) and returned only in the submit response; exam keys are withheld until submission.

### Import / export
- Author question files as JSON against [`public/qbank.schema.json`](public/qbank.schema.json) (the
  `byteoffer.qbank` envelope: `{ format, schemaVersion, questions[] }`).
- Two-phase import via **/admin/import**: validate → persistent review batch (`✅ N ⚠️ K ❌ M` per-row
  report, no writes) → admin confirms → transactional upsert into `in_review`, then publish.
- Export a bank as an envelope via the admin export route; `normalize(export(import(f))) === f`
  round-trips losslessly (the `payload` JSONB *is* the record, so extension bags survive).

### Practice / exam
- **Practice**: filter by type/difficulty/tags, answer with per-type controls, get instant grading +
  explanation (考点 / 易错点 / 关联知识 / AI 点评) after submit.
- **Exam (mock interview)**: a frozen, ordered question set with a server-authoritative countdown
  (`remainingSec`, decrement-only), an answer card, marking, and whole-paper scoring on submit
  (server deadline enforced — the client timer is UX only).

### Wrongbook / favorites / recent
- Materialized wrongbook (with note/mastered), favorites toggle, and recent-practice list, all
  ownership-scoped and paginated.

### Admin
- Question CRUD (through the same `validateEnvelope` path import uses — the two validators cannot
  drift), the import wizard, the review/publish queue, and user management (with a last-admin
  demotion guard).

### Billing (Stripe)
- One "ByteOffer Plus" product, monthly/yearly prices. Checkout + Billing Portal. **Entitlement is
  granted ONLY by the verified webhook** (`/api/stripe/webhook`), idempotent via a
  `ProcessedStripeEvent` ledger. Daily quota is enforced with an atomic conditional increment (no
  TOCTOU). Free = 30/day; Plus = unlimited + premium banks + exam mode + AI explain.

### Analytics
- Fire-and-forget event tracking (`AnalyticsEvent`), incremental `DailyUserStat` materialization
  inside the attempt transaction, and derived stats (accuracy trend, category mastery, streak, study
  report). A nightly cron reconciles any drift.

### Production hardening (Phase 7)
- **Rate limiting** (`lib/server/ratelimit.ts`): a durable Postgres fixed-window token bucket (no
  external Redis required; optional Upstash path). Applied to auth, attempt submission, the question
  read path (anti-scrape), import-confirm, and checkout. **Fails open** if its own store errors.
- **Content-Security-Policy + security headers** (`proxy.ts`): an enforcing CSP plus HSTS (prod),
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Health probe** (`/api/health` → `{ ok, db }`), structured logging, typed errors that never leak
  Prisma/SQL/stack traces.

---

## Local setup

**Prerequisites**: Node 22+, npm, and a PostgreSQL database. The fastest managed option is a free
[Neon](https://neon.tech) project — create one, then copy its **pooled** connection string into
`DATABASE_URL` and its **direct** (non-pooled) string into `DIRECT_URL`.

```bash
# 1. Install dependencies
npm install

# 2. Configure env — copy the template and fill in real values (see the table in docs/DEPLOYMENT.md)
cp .env.example .env
#    At minimum set DATABASE_URL, DIRECT_URL, AUTH_SECRET (openssl rand -base64 33), AUTH_URL.

# 3. Apply migrations (needs a reachable Postgres via DIRECT_URL)
npm run db:migrate       # prisma migrate deploy

# 4. Seed Plans + the bootstrap admin (ADMIN_EMAIL/ADMIN_PASSWORD) + a sample published bank
npm run db:seed

# 5. Run the dev server
npm run dev              # http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

### No-database smoke demo
[`/demo`](http://localhost:3000/demo) renders the full app shell with the built-in 13-type sample
envelope + local grading and **requires no database** — useful for a quick visual/CSP smoke test.
(Everything else that touches accounts, persistence, or billing needs a real Postgres. DB-dependent
end-to-end testing therefore requires a running database.)

---

## Question-authoring workflow

1. Write a JSON file with `"$schema": "./public/qbank.schema.json"` (or point your editor at the
   published URL) for autocomplete + validation. The envelope is
   `{ "format": "byteoffer.qbank", "schemaVersion": 1, "questions": [ … ] }`.
2. Each question is a `QuestionRecord` with a stable `id`, a `type`, a `stem`, type-specific answer
   fields, and an optional `explanation` / `x` extension bag. See
   [`docs/design/qbank-data-model.md`](docs/design/qbank-data-model.md) for the per-type shapes and
   the grading rules (e.g. `fill_blank` stem `___` count must equal `blanks.length`; `ordering.order`
   must be a permutation).
3. As an admin, go to **/admin/import**, upload the file, review the per-row report (`✅ / ⚠️ / ❌`),
   and confirm. Imported questions land in `in_review`; publish them from **/admin/review**.
4. Round-trip: export a bank from the admin export route to get a canonical envelope back.

---

## Project layout

```
app/                     # App Router: (marketing) (auth) (app) (admin) + api/*  + /demo
components/              # sidebar / main-area / headers / screens/* (design, preserved) + qbank/admin/billing
lib/
  qbank/                 # pure isomorphic kernel: types, enums, grade, validate, migrate, serialize, seed
  server/
    db.ts env.ts auth.ts guards.ts action.ts errors.ts logger.ts ratelimit.ts stripe.ts
    qbank/mapping.ts     # record<->row + stripAnswerKey/revealKey
    services/            # the ONLY layer that touches Prisma
  actions/               # "use server" thin wrappers (guard + zod + service)
  validation/            # zod schemas
prisma/                  # schema.prisma + migrations/* + seed.ts
proxy.ts                 # edge auth gate + CSP + security headers (Next 16 convention)
docs/design/             # architecture.md + qbank-data-model.md (authoritative)
docs/DEPLOYMENT.md       # ops runbook
```

---

## Deployment

Two supported targets — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full runbook (env
table, migrate/seed, Stripe production webhook, cron, admin bootstrap).

- **Vercel + Neon** (recommended): connect the repo, set the env vars, run `prisma migrate deploy` +
  `prisma db seed` against the Neon branch. A nightly reconciliation cron is declared in
  [`vercel.json`](vercel.json). Register the Stripe production webhook at `/api/stripe/webhook`.
- **Docker** (self-host): the multi-stage [`Dockerfile`](Dockerfile) builds the Next **standalone**
  output and runs `node server.js`. Run `prisma migrate deploy` as a release step. CI is defined in
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (typecheck → the two qbank self-checks as
  hard gates → build).

---

## Testing / CI gates

```bash
npx tsc --noEmit                              # strict typecheck
npx tsx lib/qbank/selfcheck.ts                # partial-credit grading math (HARD GATE)
npx tsx lib/server/qbank/mapping.selfcheck.ts # record<->row mapping (HARD GATE)
npx next build                                # all routes compile
```

The two self-checks guard the highest-correctness-risk code (partial-credit math + the record↔row
mapping) and are hard gates in CI. Full end-to-end tests that exercise the database are not included
and require a running Postgres.

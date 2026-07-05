# ByteOffer — Launch-Readiness Report

Audit method: static code reading (no DB available). All five findings below were re-verified against the source; every one holds.

## launch blockers

Confirmed issues that MUST be fixed before charging real users, ordered by severity.

### 1. Authed practice crashes on any `fill_blank` question (whole-app error boundary)
`lib/app-context.tsx:1124` → `correctAnswerText` at `lib/app-context.tsx:542`

`computeVals` runs `pCorrect: q ? correctAnswerText(q, submittedReveal) : ""` for **every** rendered question, including pre-submit (`submittedReveal` is `undefined` until submit — confirmed at line 780). For a `fill_blank`, the reveal-less branch executes `(q as FillBlankQ).blanks.map((b) => b.accept)`. The RSC-injected bank is stripped by `stripAnswerKey`, which drops `accept` from every blank (`lib/server/qbank/mapping.ts:229` — a label-less blank becomes `{}`). So the expression yields `[undefined, undefined]`, and the inner `.map` at line 543-544 throws `TypeError: Cannot read properties of undefined (reading 'map')`. This runs inside the render-phase `useMemo` (line 1713) with no try/catch, so the entire authed app falls to the error boundary. No submit, no crafted input — just opening 刷题 on a fill_blank question. This is a hard, deterministic crash of a core screen.

**Minimal fix** — make the demo fallback null-safe and don't dereference the key pre-submit, at `lib/app-context.tsx:542`:
```ts
const perBlank: Accept[][] =
  reveal?.blanks ?? (q as FillBlankQ).blanks.map((b) => b.accept ?? []);
```
Defense-in-depth: gate line 1124 on submit like the sibling fields already do — `pCorrect: q && submittedReveal ? correctAnswerText(q, submittedReveal) : ""` — so a stripped record is never asked for its answer key before the server reveal arrives.

### 2. Authed exam (模拟面试) always scores 0/100 — server exam flow never wired
`lib/app-context.tsx:1606` (`examSubmit`), `:846` (skipped local grade), `:1610` (`examSessionId` always null)

The server exam session flow is fully implemented server-side (`sessionService.startExam/saveExamAnswer/getExamState/submitExam`) and typed into `serverActions` (`lib/app-context.tsx:223-239`), but **none of `startExam`, `saveExamAnswer`, `getExamState` is ever called**, and `examSessionId` is initialized to `null` (line 383) and never set. Consequences in the authed flow (`serverSubmit === true`):
- `examSubmit` (line 1610-1611) reads `examSessionId === null`, so it never calls `submitExam`; it only sets `examSubmitted = true`.
- The local grade block (line 846) is guarded by `!serverSubmit`, so it is skipped → `examCorrect/examWrong/examScoreSum/examMaxSum` all stay 0 → `examScore100 = 0` (line 858).

Result: an entitled user answers everything, submits, and the result screen shows **0/100, 答对 0, 答错 0** regardless of performance, and no server exam grade/stats are recorded. A paid, headline feature is broken and actively misleading.

**Minimal fix** — wire the server flow into the client: on entering 模拟面试 call `serverActions.startExam({ count })` and store `examSessionId` + the returned stripped `questions` as `examBank`; on each answer call `serverActions.saveExamAnswer(...)`; in `examSubmit` when `serverSubmit`, `await serverActions.submitExam({ sessionId })` and drive `examScore100/examCorrect/examWrong` from the server's authoritative response. Until wired, do not present 0/100 as a real score.

### 3. Exam deadline is never enforced — unlimited exam time
`lib/server/services/sessionService.ts:258` (`saveExamAnswer`), and `submitExam`

`saveExamAnswer` gates only on `session.status !== "active"` (line 258) and question-set membership (line 261). Nothing ever transitions a session to `expired`, and the `remainingSec` clamp is only monotonic-decreasing — it never rejects a save. So hours after a 60-minute exam started, every late `saveExamAnswerAction` still succeeds. A user can look up every answer at leisure, save all-correct, then `submitExam`, and `submitExam` grades all saved answers to full marks; `deadlineBlown` is recorded only as an analytics prop. The timed constraint is entirely unenforceable server-side.

This becomes reachable and exploitable the moment blocker #2 is fixed (wiring the exam flow), so it must ship together with the fix. **Minimal fix**: in `saveExamAnswer`, also select `startedAt` + `durationSec` and reject (throw `ValidationError`, transition the session to `expired`) when `(Date.now() - startedAt)/1000 > durationSec`. In `submitExam`, when the deadline is blown, grade past-deadline answers as unanswered (score 0) rather than crediting them.

## should-fix

Confirmed, non-blocking (defense-in-depth / operational hardening).

### 4. Entitlement gates never re-check `validUntil` at read time; no reconciliation sweep
`lib/server/services/entitlementService.ts` — `get` (L54-58), `assertCanAttempt` (L80-86), `assertBankAccess`/`assertExamMode` (L116-136)

The gates trust the denormalized `Entitlement` snapshot and never compare `validUntil` against `now`. `rebuildEntitlement` runs only from the webhook path. So if a `past_due` sub is written with `validUntil = currentPeriodEnd` (grace, L151/L195) and then no further webhook arrives — Stripe retries exhausted/disabled, a dropped `customer.subscription.deleted`, or a sub lingering in `past_due` — the snapshot is never re-derived. `assertCanAttempt` returns immediately (dailyQuota null → unlimited), `assertBankAccess`/`assertExamMode` pass, indefinitely past the paid period, with `validUntil` pointing at a past date and no cron to correct it.

Not a live exploit (a user cannot force a dropped webhook on demand), so it is should-fix rather than a blocker — but it is real revenue leakage under normal Stripe delivery failure. **Fix**: add a read-time expiry check — when `validUntil !== null && now >= validUntil`, treat the row as `DEFAULT_FREE_ENTITLEMENT` in `get` **and** mirror it in the raw select in `assertCanAttempt` (L80-86) so the atomic increment still gates an expired snapshot. Add a nightly reconciliation sweep re-running `rebuildEntitlement` for subs whose `currentPeriodEnd` has passed.

### 5. Webhook grants `tier:"plus"` on status alone, never validating the sub's price
`lib/server/services/billingService.ts:244` (and 269, 309, 329)

`applyEvent` hardcodes `tier:"plus"` in every subscription upsert; it never compares the sub's actual price against the configured Plus prices. The header comment and invariant #3 claim per-grant price validation, but it does not exist for the webhook grant path (only `createCheckoutSession` at L92-96 validates). Not externally forgeable — the webhook is signature-verified and normal checkout is price-validated — so impact is operational drift: a sub created in the Stripe dashboard, migrated from a legacy price, or on a price later removed from env would still grant full Plus. **Fix**: compute `const tier = configuredPriceIds().includes(priceIdOf(sub) ?? "") ? "plus" : "free"` and pass it through, applied consistently to all four grant branches.

## uncertain / needs-DB-verification

None. All five findings were settled by reading code; no item in this batch requires a live DB run to confirm. (Worth noting for completeness: the *fixes* for #2/#3 — the wired exam round-trip and post-deadline grading — should be smoke-tested against a live DB once implemented, since the server exam path has never been exercised end-to-end from the UI.)

## verdict

**Not launch-ready as-is** — but the blockers are concentrated and fixable, not architectural. The security core the design claims (server-authoritative grading, stripped answer keys, signature-verified idempotent webhook, ownership scoping, atomic quota) holds up under reading. The problems are in the client wiring and one gap in exam-session enforcement: blocker #1 is a deterministic crash of the practice screen on a whole question type; blocker #2 makes the paid exam feature silently return 0/100; blocker #3 makes exam timing unenforceable and must land alongside #2 since fixing #2 is what makes #3 reachable. Fix those three and the product is chargeable. Residual risk after the blockers is the should-fix pair: entitlement expiry is not re-checked at read time (revenue leakage whenever a Stripe webhook is dropped or a sub lingers in `past_due`) and the webhook grants Plus without validating price (operational drift). Neither is remotely exploitable, but both weaken the paid boundary over time and should be closed shortly after launch, ideally in the same release. Fix #1–#3 to launch; ship #4–#5 immediately after.
```
---

## Resolution (all 5 fixed + verified, no-DB)

| # | Finding | Fix | Verified |
|---|---|---|---|
| 1 | fill_blank crash (authed) | `app-context` null-safe `accept ?? []` + gate `pCorrect` on submit; audited all 13 types | 13/13 stripped no-crash test; `/demo` fill_blank submit works, 0 console errors |
| 2 | exam always 0/100 (authed) | wired `startExam`/`saveExamAnswer`/`submitExam` into the client; server-authoritative exam score; demo keeps local grade; graceful degrade (no fake 0/100) | `adaptExamSubmit` 8/8; tsc/build; demo exam renders |
| 3 | exam deadline unenforced | `saveExamAnswer` rejects + `expired` past `startedAt+durationSec`; `submitExam` drops post-deadline answers | logic test PASS |
| 4 | entitlement ignores validUntil | read-time `isExpired` in `get` + `assertCanAttempt` (free-quota, not unlimited) | logic test PASS |
| 5 | webhook grants plus on status only | `tierForSubscription` validates the sub's price across all grant branches | logic test PASS |

Needs live-DB e2e (no DB in build env): the wired exam round-trip (#2/#3) and entitlement/webhook writes (#4/#5) — smoke-test against a Postgres before charging real users.

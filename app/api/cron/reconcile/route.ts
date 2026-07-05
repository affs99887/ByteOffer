// app/api/cron/reconcile/route.ts
// Nightly reconciliation Route Handler (architecture §7.2 self-heal drift, §11 Vercel Cron). It
// recomputes each user's DailyUserStat rows from the AUTHORITATIVE Attempt table for a recent
// window and upserts corrections. Correctness does NOT depend on this job — the attempt tx already
// materializes the counters incrementally; this only repairs drift and is fully IDEMPOTENT (a
// re-run recomputes identical values → no-op).
//
// AuthZ: guarded by the CRON_SECRET shared secret. Send it as `Authorization: Bearer <secret>`
// (what Vercel Cron sends automatically) or `x-cron-secret: <secret>`. When CRON_SECRET is unset
// the route is DISABLED (404) so a misconfigured deploy can never run it unauthenticated. A wrong/
// missing secret is 404 (do not reveal the endpoint, §3.2). Both GET and POST are accepted (Vercel
// Cron issues GET; POST is convenient for manual/CI triggering). Node runtime (Prisma).
//
// Response: { reconciled: number } — the count of (user, day) rows written.

import { NextResponse } from "next/server";
import { env } from "@/lib/server/env";
import { logger } from "@/lib/server/logger";
import { reconcileWindow } from "@/lib/server/services/statsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many trailing days to recompute each run (today + the prior N-1). */
const RECONCILE_DAYS = 3;

const notFound = () => new NextResponse("Not Found", { status: 404 });

/** Constant-time-ish equality on the presented secret vs the configured one. */
function presentedSecret(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  const header = req.headers.get("x-cron-secret");
  if (header) return header.trim();
  return null;
}

/** Authorize the request against CRON_SECRET. Disabled (→ false) when the secret is unconfigured. */
function authorized(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false; // route disabled when no secret is configured
  const presented = presentedSecret(req);
  return presented !== null && presented === secret;
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) return notFound();

  try {
    const { reconciled } = await reconcileWindow(RECONCILE_DAYS);
    logger.info("cron_reconcile_ok", { reconciled, days: RECONCILE_DAYS });
    return NextResponse.json({ reconciled }, { status: 200 });
  } catch (err) {
    logger.error("cron_reconcile_error", {
      message: err instanceof Error ? err.message : String(err),
    });
    // 500 so an external scheduler surfaces the failure (unlike the webhook, retries are safe here
    // because the job is idempotent).
    return NextResponse.json({ error: { code: "INTERNAL" } }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

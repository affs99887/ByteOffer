// app/api/health/route.ts
// Public liveness/readiness probe (architecture §4.2, §10 observability). GET → { ok, db } where
// db is "up" | "down" from a cheap `SELECT 1`. Never leaks the underlying error (only the coarse
// status). Returns 200 when the DB is reachable, 503 when it is not (so a load balancer / uptime
// monitor can distinguish a healthy instance from one that cannot serve). Node runtime (Prisma).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { logger } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let db: "up" | "down" = "down";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
  } catch (err) {
    // Log server-side only; the response body never carries the error detail (§10).
    logger.error("health_db_down", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const ok = db === "up";
  return NextResponse.json({ ok, db }, { status: ok ? 200 : 503 });
}

// lib/server/ratelimit.ts
// Durable rate limiting (architecture §10). DEFAULT = a Postgres fixed-window counter so the app
// stays single-deployable with no external Redis dependency. An optional Upstash Redis path is used
// automatically when UPSTASH_REDIS_REST_URL + _TOKEN are configured (a v2 upgrade; not required).
//
// FIXED WINDOW: the window index is floor(now / windowSec); the durable key is
// `bucket:identifier:windowIndex`, so each window is its own row. The increment is a SINGLE atomic
// statement — `INSERT ... ON CONFLICT (key) DO UPDATE SET count = RateLimit.count + 1` — which is
// safe under concurrency (no read-then-write TOCTOU): the returned `count` is the post-increment
// value, and the request is allowed iff that value is ≤ limit.
//
// FAIL-OPEN (§10 hard constraint): if the limiter's OWN backing store errors (DB blip, Redis down),
// we LOG and ALLOW rather than hard-block legitimate users. A limiter must never become a new outage
// surface. The trade-off: a store outage temporarily removes the protection — acceptable, and noted.

import { prisma } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { RateLimitError } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";

export interface RateLimitResult {
  /** true = the request is within budget (or the limiter failed open). */
  ok: boolean;
  /** Remaining allowance in the current window (0 when over). */
  remaining: number;
  /** Seconds until the current window resets (only meaningful when !ok). */
  retryAfter: number;
}

export interface RateLimitOptions {
  /** Max allowed hits per window. */
  limit: number;
  /** Window length in seconds (fixed window). */
  windowSec: number;
}

/** Whether the optional Upstash Redis REST path is configured. */
function hasUpstash(): boolean {
  return env.UPSTASH_REDIS_REST_URL !== "" && env.UPSTASH_REDIS_REST_TOKEN !== "";
}

/**
 * checkRateLimit — atomically consume one token from `bucket:identifier`. Returns whether the
 * caller is within budget plus `remaining` / `retryAfter`. NEVER throws: on a backing-store error
 * it fails OPEN (logs + returns ok:true) so a store outage cannot hard-block real users (§10).
 */
export async function checkRateLimit(
  bucket: string,
  identifier: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const { limit, windowSec } = options;
  const nowSec = Math.floor(Date.now() / 1000);
  const windowIndex = Math.floor(nowSec / windowSec);
  const windowStartSec = windowIndex * windowSec;
  const retryAfter = Math.max(1, windowStartSec + windowSec - nowSec);
  const key = `${bucket}:${identifier}:${windowIndex}`;

  try {
    const count = hasUpstash()
      ? await incrUpstash(key, windowSec)
      : await incrPostgres(key, new Date(windowStartSec * 1000));

    const ok = count <= limit;
    const remaining = Math.max(0, limit - count);
    return { ok, remaining, retryAfter };
  } catch (err) {
    // FAIL-OPEN: the limiter's own store errored — allow the request rather than block a legit user.
    logger.error("ratelimit_store_error_fail_open", {
      bucket,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: true, remaining: limit, retryAfter: 0 };
  }
}

/**
 * assertRateLimit — checkRateLimit + throw RateLimitError when over budget. Use at an action/route
 * entry (after the guard, before work). Fail-open behavior is inherited from checkRateLimit, so a
 * store outage will NOT throw.
 */
export async function assertRateLimit(
  bucket: string,
  identifier: string,
  options: RateLimitOptions,
): Promise<void> {
  const res = await checkRateLimit(bucket, identifier, options);
  if (!res.ok) {
    logger.warn("ratelimit_exceeded", { bucket, retryAfter: res.retryAfter });
    throw new RateLimitError();
  }
}

/**
 * Atomic Postgres fixed-window increment. One statement:
 *   INSERT (key, count=1, windowStart) ON CONFLICT (key) DO UPDATE SET count = RateLimit.count + 1
 * `RETURNING count` gives the post-increment value. Concurrency-safe: Postgres serializes the
 * conflicting upserts on the primary key, so no two concurrent requests can read a stale count.
 */
async function incrPostgres(key: string, windowStart: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart", "updatedAt")
    VALUES (${key}, 1, ${windowStart}, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "count" = "RateLimit"."count" + 1, "updatedAt" = NOW()
    RETURNING "count"
  `;
  return rows[0]?.count ?? 1;
}

/**
 * Optional Upstash Redis REST path: INCR then EXPIRE (only meaningful on the first hit; re-setting
 * the TTL each call keeps a hot key from lingering but is harmless). Returns the post-increment
 * value. Used only when UPSTASH_* env is present; otherwise the Postgres path is authoritative.
 */
async function incrUpstash(key: string, windowSec: number): Promise<number> {
  const base = env.UPSTASH_REDIS_REST_URL.replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` };

  // Pipeline INCR + EXPIRE in one round-trip.
  const res = await fetch(`${base}/pipeline`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(windowSec)],
    ]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const data = (await res.json()) as Array<{ result?: number }>;
  const count = data?.[0]?.result;
  if (typeof count !== "number") throw new Error("upstash bad response");
  return count;
}

// ------------------------------------------------------------------
//  Identifier helpers
// ------------------------------------------------------------------

/**
 * clientIp — best-effort client IP from forwarded headers (read via next/headers in the caller).
 * Falls back to "unknown" so an absent header still yields a stable (if coarse) bucket rather than
 * throwing. Uses the first hop of x-forwarded-for (the original client on Vercel/most proxies).
 */
export function clientIpFrom(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

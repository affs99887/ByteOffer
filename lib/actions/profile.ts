"use server";

// lib/actions/profile.ts
// Profile Server Actions (architecture §4.2). requireUser is the security boundary; every write
// targets the SESSION user id (never a client-supplied id → no IDOR). updateProfileAction whitelists
// name/image via the schema (mass-assignment guard §3.3). changePasswordAction is hand-written
// (NOT defineAction, like loginAction): it must surface error codes OUTSIDE the fixed ErrorCode
// union (WRONG_PASSWORD / NO_PASSWORD) so the settings form can render precise inline messages, so
// we hand-roll the guard → rate-limit → parse → service pipeline and map the typed sentinels.

import { defineAction, mapError } from "@/lib/server/action";
import type { ActionResult } from "@/lib/server/action";
import { requireUser } from "@/lib/server/guards";
import { checkRateLimit } from "@/lib/server/ratelimit";
import * as profileService from "@/lib/server/services/profileService";
import { changePasswordSchema, updateProfileSchema } from "@/lib/validation/profile";

export const updateProfileAction = defineAction(
  updateProfileSchema,
  requireUser,
  async (input, user): Promise<{ id: string; name: string | null; image: string | null }> =>
    profileService.update(user.id, { name: input.name, image: input.image }),
);

/**
 * changePasswordAction — logged-in password change (settings → 账户与安全 → 修改密码, wired by a
 * later stage). Returns ActionResult<{ ok:true }>. Pipeline: requireUser (UNAUTHENTICATED if absent)
 * → per-user rate limit (5 / 15min, RATE_LIMITED) → zod parse (VALIDATION; fields.newPassword carries
 * the strength message) → profileService.changePassword. Distinct error codes for the form:
 *   - NO_PASSWORD    : OAuth-only account (no password set to verify against).
 *   - WRONG_PASSWORD : current password did not match (fields.currentPassword set).
 * Enumeration is a non-issue here — the caller is already authenticated and only ever touches their
 * own row. rate-limit uses checkRateLimit (non-throwing) so a store outage fails open, not 500.
 */
export async function changePasswordAction(input: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();

    const rl = await checkRateLimit("profile:change-password", user.id, { limit: 5, windowSec: 15 * 60 });
    if (!rl.ok) {
      return { ok: false, error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" } };
    }

    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: mapError(parsed.error) };

    const data = await profileService.changePassword(user.id, parsed.data);
    return { ok: true, data };
  } catch (err) {
    // Map the typed sentinels to their distinct codes BEFORE the generic fallback (both extend
    // ValidationError, so mapError would otherwise flatten them to VALIDATION).
    if (err instanceof profileService.NoPasswordError) {
      return { ok: false, error: { code: "NO_PASSWORD", message: err.message, fields: err.fields } };
    }
    if (err instanceof profileService.WrongPasswordError) {
      return { ok: false, error: { code: "WRONG_PASSWORD", message: err.message, fields: err.fields } };
    }
    // requireUser's AuthError → UNAUTHENTICATED; anything else → opaque INTERNAL (logged, no leak).
    return { ok: false, error: mapError(err) };
  }
}

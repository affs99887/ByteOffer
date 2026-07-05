"use server";

// lib/actions/auth.ts
// Public auth Server Actions (architecture §3.3, §4.2). All are defineAction(schema, noGuard,
// handler) — no session required. The heavy lifting (argon2id hashing, transactional user +
// subscription + entitlement + verification-token creation, enumeration-safe branching, email
// delivery) lives in authService (actions never import prisma directly). register /
// requestPasswordReset return an IDENTICAL response whether or not the email exists (§3.3).

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { defineAction, noGuard } from "@/lib/server/action";
import type { ActionResult } from "@/lib/server/action";
import { signIn, signOut } from "@/lib/server/auth";
import { assertRateLimit, checkRateLimit, clientIpFrom } from "@/lib/server/ratelimit";
import * as analyticsService from "@/lib/server/services/analyticsService";
import * as authService from "@/lib/server/services/authService";
import {
  credentialsSchema,
  registerSchema,
  requestResetSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@/lib/validation/auth";

// Auth surfaces: 5 attempts / 15min, keyed by IP+email (§10). Brute-force + enumeration throttle.
const AUTH_LIMIT = { limit: 5, windowSec: 15 * 60 };

/** Derive the auth rate-limit identifier from the request IP + (optional) email. */
async function authRateId(email?: string): Promise<string> {
  const ip = clientIpFrom(await headers());
  return `${ip}:${(email ?? "").toLowerCase()}`;
}

export const registerAction = defineAction(
  registerSchema,
  noGuard,
  async (input): Promise<{ ok: true }> => {
    await assertRateLimit("auth:register", await authRateId(input.email), AUTH_LIMIT);
    return authService.register({ email: input.email, password: input.password, name: input.name });
  },
);

export const requestPasswordResetAction = defineAction(
  requestResetSchema,
  noGuard,
  async (input): Promise<{ ok: true }> => {
    await assertRateLimit("auth:reset-request", await authRateId(input.email), AUTH_LIMIT);
    return authService.requestPasswordReset({ email: input.email });
  },
);

export const resetPasswordAction = defineAction(
  resetPasswordSchema,
  noGuard,
  async (input): Promise<{ ok: true }> => {
    // Keyed by IP only (the reset token is opaque; there is no email in this payload).
    await assertRateLimit("auth:reset", await authRateId(), AUTH_LIMIT);
    return authService.resetPassword({ token: input.token, password: input.password });
  },
);

/**
 * verifyEmailAction — consume a VerificationToken and set emailVerified (architecture §3.3, verify
 * page). Enumeration-safe generic failure on a bad/expired token (ResetTokenError-style). Public.
 */
export const verifyEmailAction = defineAction(
  verifyEmailSchema,
  noGuard,
  async (input): Promise<{ ok: true }> => authService.verifyEmail({ token: input.token }),
);

// ------------------------------------------------------------------
//  loginAction / logoutAction — thin wrappers around Auth.js v5 signIn/signOut.
//  These are NOT defineAction: they call the Auth.js primitives directly and must map the
//  v5 AuthError shape to our stable { ok, error } envelope. `redirect:false` keeps signIn from
//  throwing a NEXT_REDIRECT (the client router.push("/app") drives navigation on success).
// ------------------------------------------------------------------

/**
 * loginAction — credential sign-in (§3.3). Returns the standard ActionResult envelope so the
 * client form can branch. On a wrong email/password Auth.js throws CredentialsSignin → we return
 * a generic BAD_CREDENTIALS (no enumeration). The authorize() step throws Error("EMAIL_NOT_VERIFIED")
 * for an unverified credential account; we surface that as a distinct code so the form can prompt
 * the user to verify. Any other AuthError → generic.
 */
export async function loginAction(input: unknown): Promise<ActionResult<{ ok: true }>> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "邮箱或密码格式有误" } };
  }

  // Brute-force throttle (§10): 5 / 15min per IP+email. Fail-open on a limiter-store error.
  const rl = await checkRateLimit("auth:login", await authRateId(parsed.data.email), AUTH_LIMIT);
  if (!rl.ok) {
    return { ok: false, error: { code: "RATE_LIMITED", message: "登录尝试过于频繁，请稍后再试" } };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    // Funnel event (§7.1): a successful credential login. Fire-and-forget — never blocks/breaks the
    // login. We key by email in props (the userId is not returned by signIn here).
    void analyticsService.track("auth.login", { email: parsed.data.email, method: "credentials" });
    return { ok: true, data: { ok: true } };
  } catch (err) {
    if (err instanceof AuthError) {
      // The unverified-email signal is thrown from authorize(); Auth.js v5 preserves the original
      // message on error.cause.err.message. Match it to surface the distinct code.
      const causeMsg =
        typeof err.cause === "object" && err.cause && "err" in err.cause
          ? (err.cause as { err?: { message?: string } }).err?.message
          : undefined;
      if (causeMsg === "EMAIL_NOT_VERIFIED" || err.message.includes("EMAIL_NOT_VERIFIED")) {
        return { ok: false, error: { code: "EMAIL_NOT_VERIFIED", message: "邮箱尚未验证" } };
      }
      return { ok: false, error: { code: "BAD_CREDENTIALS", message: "邮箱或密码错误" } };
    }
    // A NEXT_REDIRECT would only occur if redirect were true; rethrow anything unexpected so the
    // framework can handle control-flow errors, but never leak internals to the client.
    if (isRedirectError(err)) throw err;
    return { ok: false, error: { code: "BAD_CREDENTIALS", message: "邮箱或密码错误" } };
  }
}

/** logoutAction — sign out and redirect to the login page (§4.2 profile/settings 退出登录). */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

/**
 * oauthSignInAction — start an OAuth authorization flow (§3.3). signIn without redirect:false
 * throws a NEXT_REDIRECT that Next.js turns into the provider redirect, so this never "returns"
 * on success. Only "github"/"google" are accepted (whitelist). Callers render these buttons only
 * when the provider is configured (hasOAuth), but we re-check nothing here — an unconfigured
 * provider simply has no route and Auth.js will reject it.
 */
export async function oauthSignInAction(provider: "github" | "google"): Promise<void> {
  await signIn(provider, { redirectTo: "/app" });
}

/** Detect Next.js control-flow redirect errors so we never swallow them. */
function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

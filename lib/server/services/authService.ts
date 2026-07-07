// lib/server/services/authService.ts
// Registration + password-reset domain logic (architecture §3.3). One of the ONLY layers
// touching Prisma. ACCOUNT-ENUMERATION SAFE: register / requestPasswordReset / resendVerification
// return the SAME shape whether or not the email already exists (§3.3, §10 abuse list). Passwords
// are argon2id-hashed. Verification / reset links are emailed via sendEmail().
//
// DUAL-MODE by email posture (isEmailEnabled(), see email.ts): with Resend configured we enforce
// strict email verification (register issues a link + emailVerified stays null); WITHOUT it we
// cannot deliver any link, so registration is verification-FREE (accounts are born emailVerified,
// immediately usable) and password reset reports that self-serve recovery is unavailable. The
// returned `mode` discriminator reflects ONLY this SERVER config — never account existence — so it
// stays enumeration-safe. This closes the pre-launch dead-end where an unconfigured deployment
// created emailVerified=null users that authorize() then permanently refused (EMAIL_NOT_VERIFIED).

import { randomBytes, createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { ValidationError } from "@/lib/server/errors";
import { sendEmail, isEmailEnabled } from "@/lib/server/email";
import { logger } from "@/lib/server/logger";

/**
 * Registration outcome discriminator. ENUMERATION-SAFE: a pure function of isEmailEnabled(), NEVER
 * of whether the account already existed — every caller under the same server config gets the same
 * value. "verify" = a verification email was issued; the account is unverified and must click the
 * link before it can log in. "active" = no-email deployment; the account is born emailVerified and
 * is immediately usable at /login.
 */
export type RegisterMode = "verify" | "active";

/**
 * Password-reset request outcome discriminator. Same enumeration-safety property (reflects SERVER
 * email config, not account existence). "sent" = email is configured; if the address maps to a
 * credential account a reset link was sent (response identical either way). "disabled" = no email
 * service, so self-serve reset is impossible and the form must tell the user to contact the admin.
 */
export type ResetRequestMode = "sent" | "disabled";

/** Thrown when a reset token is missing/expired/malformed — mapped to a generic VALIDATION error. */
export class ResetTokenError extends ValidationError {
  constructor() {
    super("重置链接无效或已过期，请重新申请", { token: "无效或已过期" });
  }
}

/** Thrown when an email-verification token is missing/expired/malformed. Generic (no enumeration). */
export class VerifyTokenError extends ValidationError {
  constructor() {
    super("验证链接无效或已过期，请重新注册或申请", { token: "无效或已过期" });
  }
}

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

/** A raw URL-safe token + its SHA-256 hash (only the hash is persisted). */
function makeToken(): { raw: string; hashed: string } {
  const raw = randomBytes(32).toString("base64url");
  const hashed = createHash("sha256").update(raw).digest("hex");
  return { raw, hashed };
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function baseUrl(): string {
  return (env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * register — create a new user (enumeration-safe, dual-mode). The whole verify-vs-active policy
 * hinges on ONE server-config predicate (isEmailEnabled()), evaluated once so the response is a
 * pure function of config. Create User + Subscription{free} + Entitlement (free = FULL grants:
 * dailyQuota null/unlimited + premiumBanks, per the all-free launch — mirrors
 * DEFAULT_FREE_ENTITLEMENT / seed Plan / backfill; a finite quota here would resurrect the
 * unpurchasable paywall for every new credential registrant) in one transaction; when email is
 * enabled also mint a verification token (emailVerified:null) and
 * send the link, when it is disabled the account is born emailVerified:now (immediately usable) and
 * no token is issued. Taken email: do NOT reveal it — only nudge the real owner (when email works)
 * and return the SAME { ok, mode } shape. Both branches (and both configs) return identically for a
 * given server config → no enumeration.
 */
export async function register(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ ok: true; mode: RegisterMode }> {
  const { email, password, name } = input;
  const emailEnabled = isEmailEnabled();
  const mode: RegisterMode = emailEnabled ? "verify" : "active";

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    // Do not create a second account and do not signal existence: the RESPONSE ({ ok, mode }) is
    // identical to the fresh-account path below. Only when email is deliverable do we nudge the real
    // owner (who alone learns anything — the caller does not); in no-email mode we send nothing.
    if (emailEnabled) {
      await sendEmail({
        to: email,
        subject: "ByteOffer 账号提示",
        html: `<p>你或他人尝试用该邮箱注册 ByteOffer，但该邮箱已注册。若是你本人，请直接登录；若忘记密码，可在登录页选择"忘记密码"。</p>`,
        text: "该邮箱已注册 ByteOffer。若是你本人，请直接登录或使用忘记密码。",
      });
    }
    return { ok: true, mode };
  }

  const passwordHash = await hash(password);
  // A verification token is only meaningful when we can actually email it. In no-email mode the
  // account is born verified so it is usable immediately — otherwise a deployment without Resend
  // would strand every new registrant behind EMAIL_NOT_VERIFIED forever.
  const token = emailEnabled ? makeToken() : null;
  const expires = new Date(Date.now() + VERIFY_TTL_MS);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: name ?? null,
        role: "user",
        emailVerified: emailEnabled ? null : new Date(),
        passwordHash,
        subscription: { create: { tier: "free", status: "active" } },
        entitlement: {
          create: { tier: "free", dailyQuota: null, premiumBanks: true, examMode: true, aiExplain: false },
        },
      },
      select: { id: true },
    });

    if (token) {
      await tx.verificationToken.create({
        data: { identifier: email, token: token.hashed, expires },
      });
    }

    await tx.analyticsEvent
      .create({ data: { userId: user.id, name: "auth.registered", props: { email, mode } } })
      .catch(() => undefined);
  });

  if (token) {
    const link = `${baseUrl()}/verify?token=${token.raw}`;
    await sendEmail({
      to: email,
      subject: "验证你的 ByteOffer 邮箱",
      html: `<p>欢迎加入 ByteOffer！请点击以下链接验证邮箱（24 小时内有效）：</p><p><a href="${link}">${link}</a></p>`,
      text: `验证你的 ByteOffer 邮箱（24 小时内有效）：${link}`,
    });
    logger.info("auth_verification_issued", { email });
  } else {
    logger.info("auth_registered_active", { email });
  }

  return { ok: true, mode };
}

/**
 * resendVerification — re-issue a verification link for an EXISTING, still-unverified credential
 * account. ENUMERATION-SAFE: returns { ok:true } identically whether the email is unknown, already
 * verified, OAuth-only, or genuinely pending — the observable response never varies. No-ops entirely
 * when email delivery is not configured (there is nothing to resend, and in that posture no
 * unverified accounts exist). Stale verify tokens for the address are cleared so only the newest
 * link is valid (reset tokens use a `reset:` prefix, so they are never touched here).
 */
export async function resendVerification(input: { email: string }): Promise<{ ok: true }> {
  const { email } = input;
  if (!isEmailEnabled()) return { ok: true };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { passwordHash: true, emailVerified: true },
  });

  if (user?.passwordHash && !user.emailVerified) {
    const { raw, hashed } = makeToken();
    const expires = new Date(Date.now() + VERIFY_TTL_MS);
    await prisma.$transaction(async (tx) => {
      await tx.verificationToken.deleteMany({ where: { identifier: email } }).catch(() => undefined);
      await tx.verificationToken.create({ data: { identifier: email, token: hashed, expires } });
    });

    const link = `${baseUrl()}/verify?token=${raw}`;
    await sendEmail({
      to: email,
      subject: "验证你的 ByteOffer 邮箱",
      html: `<p>请点击以下链接验证邮箱（24 小时内有效）：</p><p><a href="${link}">${link}</a></p>`,
      text: `验证你的 ByteOffer 邮箱（24 小时内有效）：${link}`,
    });
    logger.info("auth_verification_resent", { email });
  }

  return { ok: true };
}

/**
 * requestPasswordReset — CONSTANT response (§3.3), dual-mode. When email is unconfigured there is no
 * way to deliver a reset link, so we return mode:"disabled" — this reveals SERVER config (that
 * self-serve recovery is off), NOT account existence, so it is still enumeration-safe; the form then
 * tells the user to contact the admin instead of falsely claiming an email was sent. When email is
 * configured we behave as before: if the email maps to a credential account, mint a reset token +
 * email the link; otherwise do nothing — either way return { ok:true, mode:"sent" }.
 */
export async function requestPasswordReset(
  input: { email: string },
): Promise<{ ok: true; mode: ResetRequestMode }> {
  const { email } = input;

  if (!isEmailEnabled()) {
    return { ok: true, mode: "disabled" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  // Only issue for accounts that actually have a password (credential accounts). OAuth-only or
  // unknown emails silently do nothing — but the response is identical.
  if (user?.passwordHash) {
    const { raw, hashed } = makeToken();
    const expires = new Date(Date.now() + RESET_TTL_MS);
    await prisma.verificationToken.create({
      data: { identifier: `reset:${email}`, token: hashed, expires },
    });

    const link = `${baseUrl()}/reset?token=${raw}`;
    await sendEmail({
      to: email,
      subject: "重置你的 ByteOffer 密码",
      html: `<p>点击以下链接重置密码（1 小时内有效）。若非你本人操作，请忽略此邮件。</p><p><a href="${link}">${link}</a></p>`,
      text: `重置你的 ByteOffer 密码（1 小时内有效）：${link}`,
    });
    logger.info("auth_reset_issued", { email });
  }

  return { ok: true, mode: "sent" };
}

/**
 * resetPassword — consume a reset token and set a new password. Validates the hashed token exists
 * + is unexpired, resolves the identifier (reset:<email>) to the user, argon2id-hashes the new
 * password, updates the user, and deletes the token — all in one transaction. Generic error on an
 * invalid/expired token (no enumeration).
 */
export async function resetPassword(input: { token: string; password: string }): Promise<{ ok: true }> {
  const { token, password } = input;
  const hashed = hashToken(token);

  const record = await prisma.verificationToken.findUnique({ where: { token: hashed } });
  if (!record || record.expires.getTime() < Date.now() || !record.identifier.startsWith("reset:")) {
    // Generic failure — do not reveal which part failed.
    throw new ResetTokenError();
  }

  const email = record.identifier.slice("reset:".length);
  const passwordHash = await hash(password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { email }, data: { passwordHash } });
    await tx.verificationToken.delete({ where: { token: hashed } }).catch(() => undefined);
    // Invalidate any other outstanding reset tokens for this identifier.
    await tx.verificationToken
      .deleteMany({ where: { identifier: `reset:${email}` } })
      .catch(() => undefined);
  });

  logger.info("auth_reset_completed", { email });
  return { ok: true };
}

/**
 * verifyEmail — consume an email-verification token and set emailVerified (§3.3). The register flow
 * stores the token with identifier = the plain email (reset tokens use a `reset:` prefix, which we
 * reject here so a reset link can never double as a verify link). Validates the hashed token exists
 * + is unexpired, sets User.emailVerified = now, and deletes the token — all in one transaction.
 * Generic failure (VerifyTokenError) on any invalid/expired token — no enumeration.
 */
export async function verifyEmail(input: { token: string }): Promise<{ ok: true }> {
  const { token } = input;
  const hashed = hashToken(token);

  const record = await prisma.verificationToken.findUnique({ where: { token: hashed } });
  if (
    !record ||
    record.expires.getTime() < Date.now() ||
    record.identifier.startsWith("reset:")
  ) {
    throw new VerifyTokenError();
  }

  const email = record.identifier;

  await prisma.$transaction(async (tx) => {
    // Idempotent: setting emailVerified again is harmless. updateMany avoids throwing if the user
    // row was removed between issuance and verification.
    await tx.user.updateMany({ where: { email }, data: { emailVerified: new Date() } });
    await tx.verificationToken.delete({ where: { token: hashed } }).catch(() => undefined);
  });

  logger.info("auth_email_verified", { email });
  return { ok: true };
}

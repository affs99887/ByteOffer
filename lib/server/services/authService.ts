// lib/server/services/authService.ts
// Registration + password-reset domain logic (architecture §3.3). One of the ONLY layers
// touching Prisma. ACCOUNT-ENUMERATION SAFE: register / requestPasswordReset perform the SAME
// observable work and return the SAME shape whether or not the email already exists (§3.3,
// §10 abuse list). Passwords are argon2id-hashed. Verification / reset links are emailed via
// sendEmail(), which no-ops+logs when Resend is unconfigured (never crashes build/dev).

import { randomBytes, createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { ValidationError } from "@/lib/server/errors";
import { sendEmail } from "@/lib/server/email";
import { logger } from "@/lib/server/logger";

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
 * register — create a new user (enumeration-safe). When the email is free: create User{role:user,
 * emailVerified:null} + Subscription{free} + Entitlement{free,quota:30} + a verification token, in
 * one transaction, then email the verification link. When the email is taken: do NOT reveal it —
 * send a "password reset / already registered" style email to the existing address and return the
 * SAME { ok:true } shape. Either branch returns identically.
 */
export async function register(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ ok: true }> {
  const { email, password, name } = input;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    // Do not create a second account and do not signal existence. Optionally nudge the user that
    // an account already exists (still enumeration-safe: the RESPONSE is identical; only the email
    // recipient — who owns the address — learns anything).
    await sendEmail({
      to: email,
      subject: "ByteOffer 账号提示",
      html: `<p>你或他人尝试用该邮箱注册 ByteOffer，但该邮箱已注册。若是你本人，请直接登录；若忘记密码，可在登录页选择"忘记密码"。</p>`,
      text: "该邮箱已注册 ByteOffer。若是你本人，请直接登录或使用忘记密码。",
    });
    return { ok: true };
  }

  const passwordHash = await hash(password);
  const { raw, hashed } = makeToken();
  const expires = new Date(Date.now() + VERIFY_TTL_MS);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: name ?? null,
        role: "user",
        emailVerified: null,
        passwordHash,
        subscription: { create: { tier: "free", status: "active" } },
        entitlement: {
          create: { tier: "free", dailyQuota: 30, premiumBanks: false, examMode: true, aiExplain: false },
        },
      },
      select: { id: true },
    });

    await tx.verificationToken.create({
      data: { identifier: email, token: hashed, expires },
    });

    await tx.analyticsEvent
      .create({ data: { userId: user.id, name: "auth.registered", props: { email } } })
      .catch(() => undefined);
  });

  const link = `${baseUrl()}/verify?token=${raw}`;
  await sendEmail({
    to: email,
    subject: "验证你的 ByteOffer 邮箱",
    html: `<p>欢迎加入 ByteOffer！请点击以下链接验证邮箱（24 小时内有效）：</p><p><a href="${link}">${link}</a></p>`,
    text: `验证你的 ByteOffer 邮箱（24 小时内有效）：${link}`,
  });
  logger.info("auth_verification_issued", { email });

  return { ok: true };
}

/**
 * requestPasswordReset — CONSTANT response (§3.3). If the email maps to a credential account,
 * mint a reset token + email the link; otherwise do nothing. Either way return { ok:true }.
 */
export async function requestPasswordReset(input: { email: string }): Promise<{ ok: true }> {
  const { email } = input;

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

  return { ok: true };
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

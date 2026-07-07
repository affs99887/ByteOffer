// lib/validation/auth.ts
// Auth zod schemas (architecture.md §3.3). Password strength is a dependency-free floor:
// ≥10 chars with at least one letter and one digit (no zxcvbn dep). All schemas whitelist
// fields (mass-assignment protection §3.3) — role/status are never client-settable.

import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email();

/** ≥10 chars, at least one letter and one digit. */
export const strongPassword = z
  .string()
  .min(10, "密码至少 10 个字符")
  .regex(/[A-Za-z]/, "密码需包含至少一个字母")
  .regex(/[0-9]/, "密码需包含至少一个数字");

// Login: password only needs to be present (strength was enforced at registration).
export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type CredentialsInput = z.infer<typeof credentialsSchema>;

export const registerSchema = z.object({
  email: emailSchema,
  password: strongPassword,
  name: z.string().trim().min(1).max(60).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const requestResetSchema = z.object({
  email: emailSchema,
});
export type RequestResetInput = z.infer<typeof requestResetSchema>;

// Resend the email-verification link. Same {email} shape as a reset request, kept as a distinct
// schema so the action reads self-documenting (this is a verify resend, not a password reset).
export const resendVerificationSchema = z.object({
  email: emailSchema,
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: strongPassword,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

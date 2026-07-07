// lib/server/services/profileService.ts
// Profile service (architecture §4.2 Profile row). One of the ONLY layers touching Prisma.
// Ownership is intrinsic: every write targets where:{ id: userId } from the SESSION, never a
// client-supplied id (no IDOR). update() writes only name/image (mass-assignment guard §3.3);
// changePassword() is the sole path that (re)writes passwordHash, and it does so only after
// verifying the caller's current password against the stored argon2id hash.

import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@/lib/server/db";
import { ValidationError } from "@/lib/server/errors";

export interface UpdateProfileInput {
  name?: string;
  image?: string;
}

/**
 * Thrown by changePassword when the supplied current password does not match the stored hash. The
 * action layer maps it to the stable WRONG_PASSWORD code; it extends ValidationError so any other
 * path degrades safely to a generic VALIDATION rather than leaking internals. Carries a field
 * message so a form can render it inline under the current-password input.
 */
export class WrongPasswordError extends ValidationError {
  constructor() {
    super("当前密码不正确", { currentPassword: "当前密码不正确" });
  }
}

/**
 * Thrown by changePassword for OAuth-only accounts (passwordHash is null — there is nothing to
 * verify against, and setting one here would bypass the reset flow). The action maps it to the
 * stable NO_PASSWORD code so the UI can steer the user to third-party login / 找回密码.
 */
export class NoPasswordError extends ValidationError {
  constructor() {
    super("当前账号未设置密码（第三方登录账号），请使用第三方登录或通过“找回密码”设置密码", {
      currentPassword: "该账号未设置密码",
    });
  }
}

/**
 * updateProfile — patch the session user's name/image. Undefined fields are omitted (no clobber);
 * an empty-string image is treated as "clear" (→ null). Returns the updated public profile fields.
 */
export async function update(
  userId: string,
  input: UpdateProfileInput,
): Promise<{ id: string; name: string | null; image: string | null }> {
  const data: { name?: string; image?: string | null } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.image !== undefined) data.image = input.image === "" ? null : input.image;

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, image: true },
  });
  return user;
}

/**
 * changePassword — verify the caller's CURRENT password (argon2id) then set a new hash. Ownership is
 * intrinsic: only ever reads/writes where:{ id: userId } from the SESSION (never a client id → no
 * IDOR). Throws NoPasswordError for OAuth-only accounts (no hash to verify against) and
 * WrongPasswordError when the current password does not match; the action layer maps these to the
 * NO_PASSWORD / WRONG_PASSWORD codes. New-password strength is enforced by zod (changePasswordSchema)
 * upstream, so this layer trusts the shape and only guards the current-password check.
 */
export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<{ ok: true }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) throw new NoPasswordError();
  if (!(await verify(user.passwordHash, input.currentPassword))) throw new WrongPasswordError();

  const passwordHash = await hash(input.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

// lib/server/services/profileService.ts
// Profile update service (architecture §4.2 Profile row). One of the ONLY layers touching Prisma.
// Ownership is intrinsic: the update targets where:{ id: userId } from the SESSION, never a
// client-supplied id. Only name/image are writable (mass-assignment guard §3.3) — role/email/
// passwordHash are never accepted here.

import { prisma } from "@/lib/server/db";

export interface UpdateProfileInput {
  name?: string;
  image?: string;
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

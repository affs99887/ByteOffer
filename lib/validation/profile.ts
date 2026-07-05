// lib/validation/profile.ts
// Zod schema for the profile Server Action (architecture §4.2 Profile row). Whitelists exactly
// {name?, image?} — role/email/passwordHash are NEVER client-settable (mass-assignment §3.3).

import { z } from "zod";

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    // image is either an empty string (clear) or a data: / https: URL (kept permissive; the
    // real CSP is enforced at render time — we only bound the length here to avoid abuse).
    image: z.string().max(200_000).optional(),
  })
  .refine((v) => v.name !== undefined || v.image !== undefined, {
    message: "至少需要提供一个要更新的字段",
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

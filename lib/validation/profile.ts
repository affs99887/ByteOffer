// lib/validation/profile.ts
// Zod schemas for the profile Server Actions (architecture §4.2 Profile row). updateProfileSchema
// whitelists exactly {name?, image?} — role/email/passwordHash are NEVER client-settable
// (mass-assignment §3.3). changePasswordSchema validates the logged-in password change; the new
// password reuses register's strongPassword policy so both entry points share one strength floor.

import { z } from "zod";
import { strongPassword } from "@/lib/validation/auth";

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

// Logged-in password change. currentPassword only needs to be present (it is checked against the
// stored argon2id hash server-side); newPassword must satisfy the same strength policy as register.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: strongPassword,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// UI-preference patch (settings → 外观/目标). Every field optional so the client PATCHes only what
// changed; prefsService.savePreferences merges onto the existing row (or the schema defaults) and
// re-clamps dailyGoal. layout / appTheme / sbTheme are strict enums — no other value persists.
export const savePreferencesSchema = z.object({
  layout: z.enum(["sidebar", "top"]).optional(),
  appTheme: z.enum(["light", "dark"]).optional(),
  sbTheme: z.enum(["light", "dark"]).optional(),
  dailyGoal: z.number().int().min(5).max(500).optional(),
});
export type SavePreferencesInput = z.infer<typeof savePreferencesSchema>;

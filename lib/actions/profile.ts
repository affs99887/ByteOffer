"use server";

// lib/actions/profile.ts
// Thin profile Server Action (architecture §4.2). requireUser is the security boundary; the
// update targets the SESSION user id (never a client-supplied id → no IDOR). Only name/image are
// whitelisted by the schema (mass-assignment guard §3.3).

import { defineAction } from "@/lib/server/action";
import { requireUser } from "@/lib/server/guards";
import * as profileService from "@/lib/server/services/profileService";
import { updateProfileSchema } from "@/lib/validation/profile";

export const updateProfileAction = defineAction(
  updateProfileSchema,
  requireUser,
  async (input, user): Promise<{ id: string; name: string | null; image: string | null }> =>
    profileService.update(user.id, { name: input.name, image: input.image }),
);

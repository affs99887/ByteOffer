// lib/validation/library.ts
// Zod schemas for library Server Actions (wrongbook / favorites / recent — architecture §4.2).
// All are user-scoped in the service via where:{ userId } (IDOR kill, §3.2); these schemas only
// whitelist the cursor / target-question fields. No user id is ever accepted from the client.

import { z } from "zod";

export const listWrongbookSchema = z.object({
  cursor: z.string().min(1).optional(),
  /** Optional filter: true → only mastered, false → only unmastered, omitted → all. */
  mastered: z.boolean().optional(),
});
export type ListWrongbookInput = z.infer<typeof listWrongbookSchema>;

export const masterWrongSchema = z.object({
  questionId: z.string().min(1),
});
export type MasterWrongInput = z.infer<typeof masterWrongSchema>;

export const toggleFavoriteSchema = z.object({
  questionId: z.string().min(1),
});
export type ToggleFavoriteInput = z.infer<typeof toggleFavoriteSchema>;

export const listCursorSchema = z.object({
  cursor: z.string().min(1).optional(),
});
export type ListCursorInput = z.infer<typeof listCursorSchema>;

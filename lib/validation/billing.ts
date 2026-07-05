// lib/validation/billing.ts
// Zod schemas for the billing Server Actions (architecture §4.2, §6.2). The priceId is only
// shape-validated here (non-empty string) — the AUTHORITATIVE allow-list check (is it one of the
// configured Plus prices?) happens in billingService.createCheckoutSession, so an arbitrary but
// well-formed string still gets rejected server-side (mass-assignment guard §6.2). deleteAccount /
// portal take no input.

import { z } from "zod";

export const createCheckoutSchema = z.object({
  // Bounded non-empty string; the real validation is the price allow-list in the service.
  priceId: z.string().trim().min(1).max(255),
});
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;

/** Portal + deleteAccount carry no fields; an empty object schema keeps the defineAction shape. */
export const emptySchema = z.object({}).strict();
export type EmptyInput = z.infer<typeof emptySchema>;

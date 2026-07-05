// lib/validation/qbank.ts
// Zod mirror of the qbank UserAnswer discriminated union (qbank-data-model.md §4). This is
// the write-boundary schema for client-submitted answers — the client submits only a
// UserAnswer, never a score (architecture.md §2 invariant 2). The authoritative record shape
// is validated separately by lib/qbank/validate.ts (validateEnvelope), not here.

import { z } from "zod";
import type { UserAnswer } from "@/lib/qbank/types";

// ---- shared enums (match lib/qbank/types.ts exactly) ----
export const difficultyEnum = z.enum(["easy", "medium", "hard"]);

export const questionTypeEnum = z.enum([
  "single_choice",
  "multiple_choice",
  "true_false",
  "fill_blank",
  "numeric",
  "code_output",
  "ordering",
  "matching",
  "short_answer",
  "essay",
  "code_writing",
  "scenario",
  "cloze",
]);

const optionKeyEnum = z.enum(["A", "B", "C", "D", "E", "F", "G", "H"]);

// A [leftId, rightId] tuple for matching answers.
const pairTuple = z.tuple([z.string(), z.string()]);

/**
 * userAnswerSchema — discriminated union on `kind`, 1:1 with the UserAnswer type.
 * `composite.parts` is Record<string, UserAnswer>; because it is recursive we build the
 * union via z.lazy and type the export explicitly with z.ZodType<UserAnswer>.
 */
export const userAnswerSchema: z.ZodType<UserAnswer> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("choice"), value: optionKeyEnum }),
    z.object({ kind: z.literal("multi"), value: z.array(optionKeyEnum) }),
    z.object({ kind: z.literal("boolean"), value: z.boolean() }),
    z.object({ kind: z.literal("blanks"), values: z.array(z.string()) }),
    z.object({ kind: z.literal("numeric"), raw: z.string() }),
    z.object({ kind: z.literal("text"), value: z.string() }),
    z.object({ kind: z.literal("order"), order: z.array(z.string()) }),
    z.object({ kind: z.literal("pairs"), pairs: z.array(pairTuple) }),
    z.object({
      kind: z.literal("self"),
      selfScore: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
      rubricTicks: z.array(z.number()).optional(),
    }),
    z.object({
      kind: z.literal("composite"),
      parts: z.record(z.string(), userAnswerSchema),
    }),
  ]),
);

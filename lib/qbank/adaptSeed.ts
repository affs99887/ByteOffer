// lib/qbank/adaptSeed.ts
// One-time adapter: deprecated `practiceBank` (PracticeQuestion) → QuestionRecord[]
// (qbank-data-model.md §6.3). PURE — no react/next/prisma; importable by prisma/seed.ts and
// by the app's first-run bootstrap. Runtime code only ever sees the new QuestionRecord types.

import { practiceBank } from "@/lib/data";
import type { PracticeQuestion } from "@/lib/data";
import { DIFF_LABEL } from "./enums";
import type {
  Difficulty,
  MultipleChoiceQ,
  Opt,
  OptionKey,
  QuestionRecord,
  SingleChoiceQ,
  Explanation,
} from "./types";

// Chinese type label → ASCII discriminator (only the two legacy prototype types exist).
const TYPE_FROM_LABEL: Record<string, "single_choice" | "multiple_choice"> = {
  单选题: "single_choice",
  多选题: "multiple_choice",
};

// Inverse of DIFF_LABEL (中文 → ASCII); built once so we don't hardcode a second map.
const DIFF_FROM_LABEL: Record<string, Difficulty> = Object.fromEntries(
  (Object.entries(DIFF_LABEL) as [Difficulty, string][]).map(([ascii, zh]) => [zh, ascii]),
) as Record<string, Difficulty>;

const OPTION_KEYS: readonly OptionKey[] = ["A", "B", "C", "D", "E", "F", "G", "H"];

function toOptionKey(k: string): OptionKey {
  return (OPTION_KEYS as readonly string[]).includes(k) ? (k as OptionKey) : "A";
}

function toOpts(opts: PracticeQuestion["opts"]): Opt[] {
  return opts.map((o) => ({ k: toOptionKey(o.k), t: o.t }));
}

// Legacy `ana: Analysis` → `explanation: Explanation` (field-compatible superset).
function toExplanation(ana: PracticeQuestion["ana"]): Explanation {
  return {
    explain: ana.explain,
    points: ana.points,
    pitfalls: ana.pitfalls,
    related: ana.related,
    ai: ana.ai,
  };
}

function adaptOne(p: PracticeQuestion): QuestionRecord {
  const type = TYPE_FROM_LABEL[p.type] ?? (p.multi ? "multiple_choice" : "single_choice");
  const difficulty = DIFF_FROM_LABEL[p.diff] ?? "medium";
  const base = {
    id: p.id,
    difficulty,
    tags: p.tags,
    stem: p.q,
    explanation: toExplanation(p.ana),
    options: toOpts(p.opts),
  };

  if (type === "multiple_choice") {
    const answer = (Array.isArray(p.answer) ? p.answer : [p.answer]).map(toOptionKey);
    const rec: MultipleChoiceQ = {
      ...base,
      type: "multiple_choice",
      answer,
      grading: { partial: true },
    };
    return rec;
  }

  const answer = toOptionKey(Array.isArray(p.answer) ? p.answer[0] : p.answer);
  const rec: SingleChoiceQ = { ...base, type: "single_choice", answer };
  return rec;
}

/** Convert the deprecated seed array to QuestionRecord[]. Pure + deterministic. */
export function adaptSeed(): QuestionRecord[] {
  return practiceBank.map(adaptOne);
}

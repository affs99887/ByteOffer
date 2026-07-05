// lib/qbank/selfcheck.ts
// Dependency-free self-check for the high-risk partial-credit math + round-trip invariant.
// Run: npx tsx lib/qbank/selfcheck.ts  (prints "PASS n" and any failures; exits 1 on failure).

import { grade } from "./grade";
import { buildEnvelope } from "./serialize";
import { sampleEnvelope } from "./seed";
import { validateEnvelope } from "./validate";
import type {
  CodeOutputQ,
  FillBlankQ,
  MultipleChoiceQ,
  NumericQ,
  OrderingQ,
  ScenarioQ,
  ShortAnswerQ,
} from "./types";

const EPS = 1e-9;

export function runSelfCheck(): { pass: number; fail: string[] } {
  let pass = 0;
  const fail: string[] = [];

  const ok = (cond: boolean, label: string): void => {
    if (cond) pass++;
    else fail.push(label);
  };
  const near = (a: number | null, b: number, label: string): void => {
    ok(a !== null && Math.abs(a - b) < EPS, `${label} (got ${a}, want ${b})`);
  };

  // ---------- multiple_choice net-hit anti-guessing ----------
  const mc: MultipleChoiceQ = {
    id: "mc", type: "multiple_choice", difficulty: "medium", tags: [],
    stem: "?",
    options: [{ k: "A", t: "a" }, { k: "B", t: "b" }, { k: "C", t: "c" }, { k: "D", t: "d" }, { k: "E", t: "e" }],
    answer: ["A", "B", "C", "E"], // C=4, W=1
    grading: { partial: true },
  };
  near(grade(mc, { kind: "multi", value: ["A", "B", "C", "E"] }).score, 1, "mc all-correct → 1");
  near(grade(mc, { kind: "multi", value: ["A", "B", "C", "D", "E"] }).score, 0, "mc select-all → 0");
  // one correct + one wrong: 1/4? no — 3 correct + 1 wrong: 3/4 - 1/1 = -0.25 → clamp 0
  near(grade(mc, { kind: "multi", value: ["A", "B", "C", "D"] }).score, 0, "mc 3c+1w → clamp 0");
  near(grade(mc, { kind: "multi", value: ["A", "B"] }).score, 0.5, "mc 2 of 4 correct → 0.5");

  // W===0 degenerate: all options correct.
  const mcDegenerate: MultipleChoiceQ = {
    id: "mcd", type: "multiple_choice", difficulty: "easy", tags: [],
    stem: "?", options: [{ k: "A", t: "a" }, { k: "B", t: "b" }],
    answer: ["A", "B"], grading: { partial: true }, // C=2, W=0
  };
  near(grade(mcDegenerate, { kind: "multi", value: ["A"] }).score, 0.5, "mc W===0 degenerate → correctHits/C");
  near(grade(mcDegenerate, { kind: "multi", value: ["A", "B"] }).score, 1, "mc W===0 full → 1");

  // ---------- fill_blank unordered greedy one-to-one ----------
  const fbUnordered: FillBlankQ = {
    id: "fbu", type: "fill_blank", difficulty: "medium", tags: [],
    stem: "______ ______", mode: "unordered",
    blanks: [{ accept: [{ text: "cat" }] }, { accept: [{ text: "dog" }] }],
  };
  // Answers given in swapped order → greedy still matches both.
  near(grade(fbUnordered, { kind: "blanks", values: ["dog", "cat"] }).score, 1, "fill unordered swapped → 1");
  near(grade(fbUnordered, { kind: "blanks", values: ["cat", "fish"] }).score, 0.5, "fill unordered one hit → 0.5");
  // A single user answer must not claim two blanks even if it matches both patterns.
  const fbDup: FillBlankQ = {
    id: "fbd", type: "fill_blank", difficulty: "medium", tags: [],
    stem: "______ ______", mode: "unordered",
    blanks: [{ accept: [{ text: "x" }] }, { accept: [{ text: "x" }] }],
  };
  near(grade(fbDup, { kind: "blanks", values: ["x", ""] }).score, 0.5, "fill unordered greedy no double-claim → 0.5");

  // ordered fill_blank per-position
  const fbOrdered: FillBlankQ = {
    id: "fbo", type: "fill_blank", difficulty: "medium", tags: [],
    stem: "______ ______", mode: "ordered",
    blanks: [{ accept: [{ text: "cat" }] }, { accept: [{ text: "dog" }] }],
  };
  near(grade(fbOrdered, { kind: "blanks", values: ["dog", "cat"] }).score, 0, "fill ordered swapped → 0");

  // ---------- ordering position vs kendall ----------
  const base = {
    id: "ord", type: "ordering" as const, difficulty: "hard" as const, tags: [],
    stem: "?",
    items: [{ id: "a", t: "a" }, { id: "b", t: "b" }, { id: "c", t: "c" }, { id: "d", t: "d" }],
    order: ["a", "b", "c", "d"],
    grading: { partial: true },
  };
  const ordPosition: OrderingQ = { ...base, orderScoring: "position" };
  const ordKendall: OrderingQ = { ...base, orderScoring: "kendall" };
  // user ["a","c","b","d"]: position → a,d correct = 2/4 = 0.5; kendall → 1 inversion / 6 = 5/6.
  near(grade(ordPosition, { kind: "order", order: ["a", "c", "b", "d"] }).score, 0.5, "ordering position → 0.5");
  near(grade(ordKendall, { kind: "order", order: ["a", "c", "b", "d"] }).score, 1 - 1 / 6, "ordering kendall → 5/6");
  // whole shift by one: ["b","c","d","a"] → position 0, kendall 0.5 (more forgiving).
  near(grade(ordPosition, { kind: "order", order: ["b", "c", "d", "a"] }).score, 0, "ordering position shift → 0");
  near(grade(ordKendall, { kind: "order", order: ["b", "c", "d", "a"] }).score, 0.5, "ordering kendall shift → 0.5");

  // ---------- numeric abs / rel tolerance ----------
  const numAbs: NumericQ = { id: "na", type: "numeric", difficulty: "easy", tags: [], stem: "?", value: 100, tolerance: { abs: 2 } };
  ok(grade(numAbs, { kind: "numeric", raw: "101" }).status === "correct", "numeric abs within → correct");
  ok(grade(numAbs, { kind: "numeric", raw: "105" }).status === "incorrect", "numeric abs outside → incorrect");
  const numRel: NumericQ = { id: "nr", type: "numeric", difficulty: "easy", tags: [], stem: "?", value: 100, tolerance: { rel: 0.1 } };
  ok(grade(numRel, { kind: "numeric", raw: "108" }).status === "correct", "numeric rel within → correct");
  ok(grade(numRel, { kind: "numeric", raw: "115" }).status === "incorrect", "numeric rel outside → incorrect");
  const numStrict: NumericQ = { id: "ns", type: "numeric", difficulty: "easy", tags: [], stem: "?", value: 1024 };
  ok(grade(numStrict, { kind: "numeric", raw: "1,024" }).status === "correct", "numeric strict thousands → correct");
  ok(grade(numStrict, { kind: "numeric", raw: "1.024e3" }).status === "correct", "numeric strict sci → correct");

  // ---------- scenario subjective exclusion (null never counted as 0) ----------
  const scen: ScenarioQ = {
    id: "sc", type: "scenario", difficulty: "hard", tags: [],
    stem: "?",
    parts: [
      { id: "sc.1", type: "code_output", difficulty: "hard", tags: [], stem: "?", expected: "3 3 3", points: 1 },
      { id: "sc.2", type: "short_answer", difficulty: "hard", tags: [], stem: "?", reference: "…", selfAssess: true, points: 1 },
    ],
  };
  // objective part correct, subjective part unanswered → score = 1 (subjective excluded from denom).
  const scenRes = grade(scen, { kind: "composite", parts: { "sc.1": { kind: "text", value: "3 3 3" } } });
  near(scenRes.score, 1, "scenario subjective-excluded → 1 (not 0.5)");
  // objective part wrong, subjective unanswered → 0 (objective denom only).
  const scenRes2 = grade(scen, { kind: "composite", parts: { "sc.1": { kind: "text", value: "wrong" } } });
  near(scenRes2.score, 0, "scenario objective wrong → 0");
  // no objective answered path still yields objective denom (code_output is objective regardless of answer)
  ok(scenRes.max === 1, "scenario max = Σ objective weights (1)");

  // scenario with ONLY subjective parts → score null
  const scenSubjOnly: ScenarioQ = {
    id: "scs", type: "scenario", difficulty: "hard", tags: [],
    stem: "?",
    parts: [
      { id: "scs.1", type: "essay", difficulty: "hard", tags: [], stem: "?", reference: "…", selfAssess: true, points: 1 },
    ],
  };
  ok(grade(scenSubjOnly, { kind: "composite", parts: {} }).score === null, "scenario all-subjective → null");

  // ---------- self_assess ungraded → null ----------
  const sa: ShortAnswerQ = { id: "sa", type: "short_answer", difficulty: "medium", tags: [], stem: "?", reference: "…", selfAssess: true };
  const saUnrated = grade(sa, { kind: "text", value: "some answer" });
  ok(saUnrated.score === null && saUnrated.status === "ungraded", "self_assess unrated → null/ungraded");
  ok(grade(sa, { kind: "self", selfScore: 0.5 }).score === 0.5, "self_assess rated 0.5 → 0.5");
  ok(grade(sa, undefined).score === null, "self_assess no answer → null");

  // ---------- undefined answer never correct ----------
  ok(grade(mc, undefined).status === "incorrect" && grade(mc, undefined).answered === false, "undefined answer → incorrect/unanswered");

  // ---------- code_output multi-line structure (regression: newline must survive normalization) ----------
  const coMulti: CodeOutputQ = { id: "com", type: "code_output", difficulty: "medium", tags: [], stem: "?", expected: "1\n2\n3" };
  ok(grade(coMulti, { kind: "text", value: "1\n2\n3" }).status === "correct", "code_output multi-line exact → correct");
  ok(grade(coMulti, { kind: "text", value: "1 2 3" }).status === "incorrect", "code_output single-line must NOT match multi-line expected");
  ok(grade(coMulti, { kind: "text", value: "1  \n2\t\n3 " }).status === "correct", "code_output per-line trailing whitespace tolerated");

  // ---------- scenario: self-GRADED subjective part still excluded from objective denom (regression) ----------
  const scenMixRated = grade(scen, {
    kind: "composite",
    parts: { "sc.1": { kind: "text", value: "3 3 3" }, "sc.2": { kind: "self", selfScore: 0 } },
  });
  near(scenMixRated.score, 1, "scenario self-graded subjective excluded → objective score stable (1, not 0.5)");

  // ---------- round-trip invariant ----------
  const rebuilt = buildEnvelope(sampleEnvelope.questions);
  const report = validateEnvelope(rebuilt);
  ok(
    report.accepted.length === sampleEnvelope.questions.length,
    `round-trip accepted ${report.accepted.length}/${sampleEnvelope.questions.length}`,
  );
  ok(report.fileOk, "round-trip fileOk");

  return { pass, fail };
}

// Runnable guard — works under `npx tsx` (CJS interop) and plain node CJS.
declare const require: any;
declare const module: any;
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const r = runSelfCheck();
  console.log(`PASS ${r.pass}`);
  if (r.fail.length) {
    for (const f of r.fail) console.log(`FAIL: ${f}`);
    // eslint-disable-next-line no-undef
    (globalThis as any).process?.exit?.(1);
  }
}

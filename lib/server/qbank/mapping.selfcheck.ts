// lib/server/qbank/mapping.selfcheck.ts
// NO-DB runnable self-check for the security-critical mapping layer (§5.4).
// Run: npx tsx lib/server/qbank/mapping.selfcheck.ts
// Proves stripAnswerKey removes every answer-key/explanation field (incl. nested scenario
// parts), keeps the render sets, round-trips through recordFromRow, and that
// questionRowFromRecord derives gradingClass + enforces the media write-boundary invariant.

import { effectiveClass } from "@/lib/qbank/enums";
import { sampleEnvelope } from "@/lib/qbank/seed";
import type { QuestionRecord } from "@/lib/qbank/types";
import {
  plainStem,
  questionRowFromRecord,
  recordFromRow,
  revealKey,
  stripAnswerKey,
} from "@/lib/server/qbank/mapping";

// Fields that must never survive anywhere in a stripped (public) question.
const FORBIDDEN_KEYS = [
  "answer",
  "accept",
  "expected",
  "order",
  "pairs",
  "reference",
  "rubric",
  "explanation",
  "keywords",
  "value", // NumericQ answer — must be stripped from the public view
] as const;

/** Walk any value; return the set of forbidden keys that appear at ANY depth. */
function findForbidden(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) findForbidden(v, acc);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((FORBIDDEN_KEYS as readonly string[]).includes(k)) acc.add(k);
      findForbidden(v, acc);
    }
  }
  return acc;
}

/** Assert a nested `blanks` array (if present) carries no `accept` at any depth. */
function findBlankAccept(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(findBlankAccept);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.blanks)) {
      for (const b of obj.blanks) {
        if (b && typeof b === "object" && "accept" in (b as object)) return true;
      }
    }
    return Object.values(obj).some(findBlankAccept);
  }
  return false;
}

/**
 * runMappingSelfCheck — run every mapping-layer assertion and return the tally.
 * Extracted so both the runnable script (below) and the vitest wrapper
 * (mapping.test.ts) drive the SAME checks. Pure: no DB, no I/O.
 */
export function runMappingSelfCheck(): { pass: number; fail: string[] } {
  let pass = 0;
  const fail: string[] = [];
  const ok = (cond: boolean, label: string): void => {
    if (cond) pass++;
    else fail.push(label);
  };

  const questions = sampleEnvelope.questions;

  // ---------- (a) stripAnswerKey removes all key/explanation fields for EVERY type ----------
  for (const rec of questions) {
  const pub = stripAnswerKey(rec);
  const leaked = [...findForbidden(pub)];
  ok(leaked.length === 0, `strip[${rec.type}] leaks forbidden keys: ${leaked.join(",") || "-"}`);
  ok(!findBlankAccept(pub), `strip[${rec.type}] leaks blanks[].accept`);
}

// ---------- (a') nested scenario parts are stripped ----------
const scenario = questions.find((q) => q.type === "scenario") as
  | Extract<QuestionRecord, { type: "scenario" }>
  | undefined;
ok(!!scenario, "sample envelope contains a scenario question");
if (scenario) {
  const pub = stripAnswerKey(scenario) as { parts?: unknown[] };
  ok(Array.isArray(pub.parts) && pub.parts.length === scenario.parts.length, "scenario parts preserved (count)");
  const leakedInParts = [...findForbidden(pub.parts)];
  ok(leakedInParts.length === 0, `scenario parts leak forbidden keys: ${leakedInParts.join(",") || "-"}`);
}

// ---------- (b) stripAnswerKey KEEPS render sets + stem ----------
const single = questions.find((q) => q.type === "single_choice");
if (single) {
  const pub = stripAnswerKey(single) as Record<string, unknown>;
  ok(Array.isArray(pub.options) && (pub.options as unknown[]).length > 0, "single_choice keeps options");
  ok(typeof pub.stem === "string" && (pub.stem as string).length > 0, "single_choice keeps stem");
  ok(pub.type === "single_choice", "single_choice keeps type");
  ok(pub.difficulty !== undefined, "single_choice keeps difficulty");
  ok(Array.isArray(pub.tags), "single_choice keeps tags");
}
const matching = questions.find((q) => q.type === "matching");
if (matching) {
  const pub = stripAnswerKey(matching) as Record<string, unknown>;
  ok(Array.isArray(pub.left) && Array.isArray(pub.right), "matching keeps left/right");
  ok(!("pairs" in pub), "matching drops pairs");
}
const orderingQ = questions.find((q) => q.type === "ordering");
if (orderingQ) {
  const pub = stripAnswerKey(orderingQ) as Record<string, unknown>;
  ok(Array.isArray(pub.items), "ordering keeps items");
  ok(!("order" in pub), "ordering drops order");
  ok(pub.orderScoring !== undefined, "ordering keeps orderScoring");
}
const fillBlank = questions.find((q) => q.type === "fill_blank");
if (fillBlank) {
  const pub = stripAnswerKey(fillBlank) as { blanks?: unknown[] };
  ok(
    Array.isArray(pub.blanks) &&
      (pub.blanks as unknown[]).length === (fillBlank as { blanks: unknown[] }).blanks.length,
    "fill_blank keeps blank count",
  );
}
// numeric: DROP the `value` answer key, but KEEP `unit` + `tolerance` (both are render/tolerance
// state, not secrets). The generic findForbidden sweep above already proves `value` never leaks;
// this pins the render set so a future edit can't strip unit/tolerance to "play it safe".
const numericQ = questions.find((q) => q.type === "numeric");
if (numericQ) {
  const src = numericQ as { unit?: unknown; tolerance?: unknown };
  const pub = stripAnswerKey(numericQ) as Record<string, unknown>;
  ok(!("value" in pub), "numeric drops value (the answer key)");
  ok(src.unit === undefined || pub.unit === src.unit, "numeric keeps unit");
  ok(src.tolerance === undefined || pub.tolerance !== undefined, "numeric keeps tolerance");
}

// ---------- (c) round-trip: JSON clone deep-equals recordFromRow({payload: rec}) ----------
for (const rec of questions) {
  const clone = JSON.parse(JSON.stringify(rec));
  const back = recordFromRow({ payload: rec as never });
  ok(back !== null, `recordFromRow[${rec.type}] returns non-null`);
  ok(JSON.stringify(clone) === JSON.stringify(back), `round-trip[${rec.type}] deep-equal`);
}

// ---------- (c') questionRowFromRecord sets gradingClass + non-empty stemText ----------
for (const rec of questions) {
  const row = questionRowFromRecord(rec, "b");
  ok(row.gradingClass === effectiveClass(rec), `row[${rec.type}] gradingClass === effectiveClass`);
  ok(row.stemText === plainStem(rec.stem) && row.stemText.length > 0, `row[${rec.type}] stemText non-empty`);
  ok(row.bankId === "b", `row[${rec.type}] bankId set`);
  ok(row.id === rec.id, `row[${rec.type}] id preserved`);
}

// ---------- (c'') revealKey is the inverse (key fields present where expected) ----------
if (single) {
  const rev = revealKey(single);
  ok(rev.answer !== undefined, "revealKey(single_choice) exposes answer");
}
if (numericQ) {
  const rev = revealKey(numericQ);
  ok(rev.value !== undefined, "revealKey(numeric) exposes value (post-submit answer)");
}
if (scenario) {
  const rev = revealKey(scenario);
  ok(rev.parts !== undefined && Object.keys(rev.parts).length === scenario.parts.length, "revealKey(scenario) has per-part keys");
}

// ---------- (d) media write-boundary invariant: throw on non data:image/ src ----------
const badMedia: QuestionRecord = {
  id: "bad-media",
  type: "single_choice",
  difficulty: "easy",
  tags: [],
  stem: "x",
  options: [
    { k: "A", t: "a" },
    { k: "B", t: "b" },
  ],
  answer: "A",
  media: [{ kind: "image", src: "data:text/html,x" }],
};
let threw = false;
try {
  questionRowFromRecord(badMedia, "b");
} catch {
  threw = true;
}
ok(threw, "questionRowFromRecord throws on non data:image/ media.src");

// A valid data:image/ src must NOT throw.
const goodMedia: QuestionRecord = {
  ...badMedia,
  id: "good-media",
  media: [{ kind: "image", src: "data:image/png;base64,AAAA" }],
};
let threwGood = false;
try {
  questionRowFromRecord(goodMedia, "b");
} catch {
  threwGood = true;
}
ok(!threwGood, "questionRowFromRecord accepts data:image/ media.src");

// Media inside a scenario part must also be enforced.
const badPartMedia: QuestionRecord = {
  id: "bad-part-media",
  type: "scenario",
  difficulty: "easy",
  tags: [],
  stem: "x",
  parts: [
    {
      id: "bad-part-media.1",
      type: "code_output",
      difficulty: "easy",
      tags: [],
      stem: "y",
      expected: "z",
      media: [{ kind: "image", src: "http://evil/x.png" }],
    },
  ],
};
let threwPart = false;
try {
  questionRowFromRecord(badPartMedia, "b");
} catch {
  threwPart = true;
}
ok(threwPart, "questionRowFromRecord throws on bad media.src inside scenario part");

  return { pass, fail };
}

// ---------- report (runnable guard — works under `npx tsx` CJS interop and plain node CJS) ----------
declare const require: any;
declare const module: any;
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const { pass, fail } = runMappingSelfCheck();
  if (fail.length === 0) {
    console.log(`PASS ${pass}`);
  } else {
    console.error(`FAIL ${fail.length} / ${pass + fail.length}`);
    for (const f of fail) console.error("  ✗ " + f);
    process.exit(1);
  }
}

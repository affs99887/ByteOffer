// lib/server/qbank/mapping.strip.test.ts
// Security-critical unit test for stripAnswerKey (§5.4): the single most important abuse-surface
// control. Over ALL 13 sample question types it must leak NONE of the answer-key/explanation fields
// at ANY depth (including nested scenario parts and blanks[].accept) and must NOT mutate its input.

import { describe, expect, test } from "vitest";
import { sampleEnvelope } from "@/lib/qbank/seed";
import type { QuestionRecord } from "@/lib/qbank/types";
import { stripAnswerKey } from "@/lib/server/qbank/mapping";

// Every field that must never survive anywhere in a stripped (public) question.
const FORBIDDEN = [
  "answer",
  "accept",
  "expected",
  "order",
  "pairs",
  "reference",
  "rubric",
  "explanation",
  "keywords",
  "value",
] as const;

/** Walk any value; collect every forbidden key that appears at ANY depth. */
function findForbidden(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) findForbidden(v, acc);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((FORBIDDEN as readonly string[]).includes(k)) acc.add(k);
      findForbidden(v, acc);
    }
  }
  return acc;
}

const questions = sampleEnvelope.questions;

describe("stripAnswerKey — no forbidden key leaks (all sample types)", () => {
  // Sanity: the sample bank exercises the full type surface.
  test("sample envelope covers 13 distinct question types", () => {
    const types = new Set(questions.map((q) => q.type));
    expect(types.size).toBe(13);
  });

  test.each(questions.map((q) => [q.type, q] as const))(
    "strip[%s] leaks no answer-key/explanation field at any depth",
    (_type, rec) => {
      const pub = stripAnswerKey(rec as QuestionRecord);
      const leaked = [...findForbidden(pub)];
      expect(leaked).toEqual([]);
    },
  );

  test("nested scenario parts are also fully stripped", () => {
    const scenario = questions.find((q) => q.type === "scenario") as
      | Extract<QuestionRecord, { type: "scenario" }>
      | undefined;
    expect(scenario).toBeTruthy();
    const pub = stripAnswerKey(scenario!) as { parts?: unknown[] };
    expect(Array.isArray(pub.parts)).toBe(true);
    expect(pub.parts).toHaveLength(scenario!.parts.length);
    expect([...findForbidden(pub.parts)]).toEqual([]);
  });
});

describe("stripAnswerKey — purity (does not mutate the source)", () => {
  test.each(questions.map((q) => [q.type, q] as const))(
    "strip[%s] leaves the source record byte-for-byte unchanged",
    (_type, rec) => {
      const before = JSON.stringify(rec);
      stripAnswerKey(rec as QuestionRecord);
      expect(JSON.stringify(rec)).toBe(before);
    },
  );
});

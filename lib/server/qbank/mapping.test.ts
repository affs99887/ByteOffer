// lib/server/qbank/mapping.test.ts
// Thin vitest wrapper over the security-critical record<->row mapping self-check
// (lib/server/qbank/mapping.selfcheck.ts). The original stays a HARD-GATE CI step
// (`npx tsx lib/server/qbank/mapping.selfcheck.ts`); this asserts the same invariant — stripAnswerKey
// leaks nothing forbidden (incl. nested scenario parts), the record round-trips, and the media
// write-boundary throws — reports ZERO failures from the test layer.

import { describe, expect, test } from "vitest";
import type { QuestionRecord } from "@/lib/qbank/types";
import { questionRowFromRecord } from "./mapping";
import { runMappingSelfCheck } from "./mapping.selfcheck";

describe("qbank record<->row mapping self-check", () => {
  test("reports zero failures", () => {
    const r = runMappingSelfCheck();
    expect(r.fail).toEqual([]);
    expect(r.pass).toBeGreaterThanOrEqual(34);
  });
});

describe("questionRowFromRecord — chapter/section mirror columns", () => {
  const base: QuestionRecord = {
    id: "q-map-ch",
    type: "single_choice",
    difficulty: "easy",
    tags: [],
    stem: "x",
    options: [
      { k: "A", t: "a" },
      { k: "B", t: "b" },
    ],
    answer: "A",
  };

  test("copies chapter/section from the record into the row", () => {
    const row = questionRowFromRecord({ ...base, chapter: "JavaScript", section: "闭包" }, "bank1");
    expect(row.chapter).toBe("JavaScript");
    expect(row.section).toBe("闭包");
  });

  test("a record without chapter/section yields null mirror columns (未分类)", () => {
    const row = questionRowFromRecord(base, "bank1");
    expect(row.chapter).toBeNull();
    expect(row.section).toBeNull();
  });
});

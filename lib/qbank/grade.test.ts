// lib/qbank/grade.test.ts
// Thin vitest wrapper over the dependency-free grading self-check (lib/qbank/selfcheck.ts).
// The original script remains a HARD-GATE CI step (`npx tsx lib/qbank/selfcheck.ts`); this asserts
// the same invariant — the partial-credit math + round-trip checks report ZERO failures — from the
// test layer, so a regression fails `npm test` too. See selfcheck.ts for the individual cases.

import { describe, expect, test } from "vitest";
import { runSelfCheck } from "./selfcheck";

describe("qbank grading self-check", () => {
  test("reports zero failures and the expected pass count", () => {
    const r = runSelfCheck();
    expect(r.fail).toEqual([]);
    expect(r.pass).toBeGreaterThanOrEqual(34);
  });
});

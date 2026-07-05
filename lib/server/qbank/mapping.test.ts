// lib/server/qbank/mapping.test.ts
// Thin vitest wrapper over the security-critical record<->row mapping self-check
// (lib/server/qbank/mapping.selfcheck.ts). The original stays a HARD-GATE CI step
// (`npx tsx lib/server/qbank/mapping.selfcheck.ts`); this asserts the same invariant — stripAnswerKey
// leaks nothing forbidden (incl. nested scenario parts), the record round-trips, and the media
// write-boundary throws — reports ZERO failures from the test layer.

import { describe, expect, test } from "vitest";
import { runMappingSelfCheck } from "./mapping.selfcheck";

describe("qbank record<->row mapping self-check", () => {
  test("reports zero failures", () => {
    const r = runMappingSelfCheck();
    expect(r.fail).toEqual([]);
    expect(r.pass).toBeGreaterThanOrEqual(34);
  });
});

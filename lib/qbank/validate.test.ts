// lib/qbank/validate.test.ts
// Focused unit tests for §5 two-phase validation (lib/qbank/validate.ts). Pure, never throws.
// Covers: bad envelope format rejected, per-record error isolation (one bad row does not sink the
// others), fill_blank blank-count mismatch, and unknown-type records dropped.

import { describe, expect, test } from "vitest";
import { FORMAT_ID, SCHEMA_VERSION } from "./types";
import { validateEnvelope } from "./validate";

/** A minimal well-formed envelope wrapper (schemaVersion pinned to current). */
function envelope(questions: unknown[]): Record<string, unknown> {
  return { format: FORMAT_ID, schemaVersion: SCHEMA_VERSION, questions };
}

const goodSingle = {
  id: "q-single",
  type: "single_choice",
  difficulty: "easy",
  tags: [],
  stem: "1 + 1 = ?",
  options: [
    { k: "A", t: "1" },
    { k: "B", t: "2" },
  ],
  answer: "B",
};

describe("validateEnvelope — envelope-level rejection", () => {
  test("non-object input → fileOk:false, not_object", () => {
    const r = validateEnvelope(42);
    expect(r.fileOk).toBe(false);
    expect(r.envelopeIssues.some((i) => i.code === "not_object")).toBe(true);
    expect(r.accepted).toEqual([]);
  });

  test("wrong format magic string → fileOk:false, bad_format", () => {
    const r = validateEnvelope({ format: "not.byteoffer", schemaVersion: 1, questions: [] });
    expect(r.fileOk).toBe(false);
    expect(r.envelopeIssues.some((i) => i.code === "bad_format")).toBe(true);
  });

  test("schemaVersion newer than supported → version_too_new", () => {
    const r = validateEnvelope({ format: FORMAT_ID, schemaVersion: SCHEMA_VERSION + 5, questions: [] });
    expect(r.fileOk).toBe(false);
    expect(r.envelopeIssues.some((i) => i.code === "version_too_new")).toBe(true);
  });

  test("a valid envelope with one good record is accepted", () => {
    const r = validateEnvelope(envelope([goodSingle]));
    expect(r.fileOk).toBe(true);
    expect(r.counts.accepted).toBe(1);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0]?.id).toBe("q-single");
  });
});

describe("validateEnvelope — per-record error isolation", () => {
  test("one bad row is rejected but the good rows are still accepted", () => {
    const badSingle = { ...goodSingle, id: "q-bad", answer: "Z" }; // answer_not_in_options
    const r = validateEnvelope(envelope([goodSingle, badSingle, { ...goodSingle, id: "q-good2" }]));
    expect(r.fileOk).toBe(true);
    expect(r.counts.total).toBe(3);
    expect(r.counts.accepted).toBe(2);
    expect(r.counts.rejected).toBe(1);
    const acceptedIds = r.accepted.map((q) => q.id);
    expect(acceptedIds).toContain("q-single");
    expect(acceptedIds).toContain("q-good2");
    expect(acceptedIds).not.toContain("q-bad");
    const badReport = r.records.find((rep) => rep.id === "q-bad");
    expect(badReport?.ok).toBe(false);
    expect(badReport?.issues.some((i) => i.code === "answer_not_in_options")).toBe(true);
  });
});

describe("validateEnvelope — fill_blank blank-count mismatch", () => {
  test("stem marker count != blanks length → blank_count_mismatch error", () => {
    const mismatched = {
      id: "q-fill",
      type: "fill_blank",
      difficulty: "medium",
      tags: [],
      // Two ______ markers (runs of 6+ underscores) but only ONE blank defined.
      stem: "A ______ and a ______ walk in.",
      mode: "ordered",
      blanks: [{ accept: [{ text: "x" }] }],
    };
    const r = validateEnvelope(envelope([mismatched]));
    const report = r.records.find((rep) => rep.id === "q-fill");
    expect(report?.ok).toBe(false);
    expect(report?.issues.some((i) => i.code === "blank_count_mismatch")).toBe(true);
  });

  test("matching marker/blank counts validate cleanly", () => {
    const ok = {
      id: "q-fill-ok",
      type: "fill_blank",
      difficulty: "medium",
      tags: [],
      stem: "A ______ and a ______ walk in.",
      mode: "ordered",
      blanks: [{ accept: [{ text: "x" }] }, { accept: [{ text: "y" }] }],
    };
    const r = validateEnvelope(envelope([ok]));
    expect(r.counts.accepted).toBe(1);
    expect(r.accepted[0]?.id).toBe("q-fill-ok");
  });
});

describe("validateEnvelope — unknown type dropped", () => {
  test("an unknown record type is rejected with unknown_type, siblings survive", () => {
    const unknown = { id: "q-unknown", type: "mystery_type", difficulty: "easy", tags: [], stem: "?" };
    const r = validateEnvelope(envelope([goodSingle, unknown]));
    expect(r.fileOk).toBe(true);
    expect(r.counts.accepted).toBe(1);
    const report = r.records.find((rep) => rep.id === "q-unknown");
    expect(report?.ok).toBe(false);
    expect(report?.issues.some((i) => i.code === "unknown_type")).toBe(true);
    expect(r.accepted.map((q) => q.id)).not.toContain("q-unknown");
  });
});

describe("validateEnvelope — chapter/section (optional browse-tree display strings)", () => {
  test("a record WITH chapter/section is accepted; values are trimmed and mirrored", () => {
    const withCh = { ...goodSingle, id: "q-ch", chapter: "  JavaScript  ", section: "作用域与闭包" };
    const r = validateEnvelope(envelope([withCh]));
    expect(r.counts.accepted).toBe(1);
    const acc = r.accepted[0] as { chapter?: string; section?: string };
    expect(acc.chapter).toBe("JavaScript"); // surrounding whitespace trimmed
    expect(acc.section).toBe("作用域与闭包");
    // A clean chapter/section produces no chapter/section warning.
    const rep = r.records.find((x) => x.id === "q-ch");
    expect(rep?.issues.some((i) => i.path.endsWith(".chapter") || i.path.endsWith(".section"))).toBe(false);
  });

  test("a record WITHOUT chapter/section is still valid (fields simply absent)", () => {
    const r = validateEnvelope(envelope([goodSingle]));
    expect(r.counts.accepted).toBe(1);
    const acc = r.accepted[0] as { chapter?: string; section?: string };
    expect(acc.chapter).toBeUndefined();
    expect(acc.section).toBeUndefined();
  });

  test("blank chapter + over-long section are dropped with WARNINGS (never rejected)", () => {
    const bad = {
      ...goodSingle,
      id: "q-ch-bad",
      chapter: "   ", // blank after trim → dropped
      section: "x".repeat(81), // > 80 chars → dropped
    };
    const r = validateEnvelope(envelope([bad]));
    expect(r.counts.accepted).toBe(1); // a warning never rejects the record
    const rep = r.records.find((x) => x.id === "q-ch-bad");
    expect(rep?.ok).toBe(true);
    expect(rep?.issues.some((i) => i.code === "bad_chapter" && i.level === "warning")).toBe(true);
    expect(rep?.issues.some((i) => i.code === "section_too_long" && i.level === "warning")).toBe(true);
    const acc = r.accepted[0] as { chapter?: string; section?: string };
    expect(acc.chapter).toBeUndefined();
    expect(acc.section).toBeUndefined();
  });

  test("a non-string chapter is dropped with a warning, record stays accepted", () => {
    const bad = { ...goodSingle, id: "q-ch-num", chapter: 123 };
    const r = validateEnvelope(envelope([bad]));
    expect(r.counts.accepted).toBe(1);
    const rep = r.records.find((x) => x.id === "q-ch-num");
    expect(rep?.issues.some((i) => i.code === "bad_chapter" && i.level === "warning")).toBe(true);
    expect((r.accepted[0] as { chapter?: string }).chapter).toBeUndefined();
  });
});

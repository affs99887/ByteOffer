// lib/qbank/normalize.test.ts
// Focused unit tests for the §2.4 normalization pipeline + numeric parsing (lib/qbank/normalize.ts).
// Pure functions, no DB. Covers: fullwidth→halfwidth, Chinese-punct equivalence, the code_output
// newline-preserving override, and parseNumeric edge cases.

import { describe, expect, test } from "vitest";
import { normalize, normalizeCodeOutput, parseNumeric } from "./normalize";

describe("normalize — fullwidth → halfwidth", () => {
  test("fullwidth ASCII letters/digits fold to halfwidth (then lowercased by default)", () => {
    // Ａ→A→a, Ｂ→B→b, Ｃ→C→c ; １２３→123
    expect(normalize("ＡＢＣ")).toBe("abc");
    expect(normalize("１２３")).toBe("123");
  });

  test("fullwidth == halfwidth after normalization", () => {
    expect(normalize("ＨＥＬＬＯ")).toBe(normalize("hello"));
  });

  test("fullwidth space (U+3000) collapses to a normal space and trims", () => {
    expect(normalize("a　b")).toBe("a b");
    expect(normalize("　hi　")).toBe("hi");
  });
});

describe("normalize — Chinese punctuation equivalence", () => {
  test("，≡ , and （ ）≡ ( ) so equivalent strings compare equal", () => {
    expect(normalize("a，b")).toBe(normalize("a,b"));
    expect(normalize("（x）")).toBe(normalize("(x)"));
  });

  test("、 and ； both map to ;", () => {
    expect(normalize("a、b")).toBe("a;b");
    expect(normalize("a；b")).toBe("a;b");
    expect(normalize("a、b")).toBe(normalize("a；b"));
  });
});

describe("normalize — general defaults", () => {
  test("collapses internal whitespace and trims by default", () => {
    expect(normalize("  foo   bar  ")).toBe("foo bar");
  });

  test("case-insensitive by default", () => {
    expect(normalize("MixedCase")).toBe("mixedcase");
  });

  test("synonyms canonicalize to the group's first member", () => {
    const opts = { synonyms: [["子", "子元素", "直接子代"]] };
    expect(normalize("子元素", opts)).toBe(normalize("子", opts));
    expect(normalize("直接子代", opts)).toBe(normalize("子", opts));
  });
});

describe("normalizeCodeOutput — newline preservation", () => {
  test("multi-line output keeps its newlines (NOT folded to spaces)", () => {
    expect(normalizeCodeOutput("1\n2\n3")).toBe("1\n2\n3");
  });

  test("a single-line answer does NOT equal multi-line expected output", () => {
    expect(normalizeCodeOutput("1 2 3")).not.toBe(normalizeCodeOutput("1\n2\n3"));
  });

  test("case-sensitive by default (unlike the general pipeline)", () => {
    expect(normalizeCodeOutput("TRUE")).not.toBe(normalizeCodeOutput("true"));
  });

  test("trailing per-line whitespace is trimmed but interior lines preserved", () => {
    expect(normalizeCodeOutput("a  \nb\t\nc")).toBe("a\nb\nc");
  });
});

describe("parseNumeric — edge cases", () => {
  test("plain integer and decimal", () => {
    expect(parseNumeric("1024")).toBe(1024);
    expect(parseNumeric("3.14")).toBe(3.14);
  });

  test("thousands separators and underscores stripped", () => {
    expect(parseNumeric("1,024")).toBe(1024);
    expect(parseNumeric("1_000")).toBe(1000);
  });

  test("scientific notation", () => {
    expect(parseNumeric("1.024e3")).toBe(1024);
  });

  test("trailing unit text ignored (leading numeric token extracted)", () => {
    expect(parseNumeric("1024字节")).toBe(1024);
  });

  test("fullwidth digits and sign", () => {
    expect(parseNumeric("１０２４")).toBe(1024);
    expect(parseNumeric("－5")).toBe(-5);
  });

  test("leading dot and signed values", () => {
    expect(parseNumeric(".5")).toBe(0.5);
    expect(parseNumeric("-2.5")).toBe(-2.5);
  });

  test("non-numeric / empty / nullish → null", () => {
    expect(parseNumeric("abc")).toBeNull();
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("   ")).toBeNull();
    // @ts-expect-error explicit nullish input is guarded at runtime
    expect(parseNumeric(null)).toBeNull();
  });
});

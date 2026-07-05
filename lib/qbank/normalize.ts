// lib/qbank/normalize.ts
// §2.4 normalization pipeline + numeric parsing. Pure, declarative, dependency-free.

import type { NormalizeOpts } from "./types";

// Resolved (defaults applied) option set.
interface Resolved {
  trim: boolean;
  collapseWhitespace: boolean;
  caseInsensitive: boolean;
  fullwidthToHalfwidth: boolean;
  ignoreChinesePunctVariant: boolean;
  stripPunctuation: boolean;
  trimTrailingWhitespace: boolean;
  collapseBlankLines: boolean;
  synonyms: string[][];
}

// §2.4 documented defaults (the general-purpose text defaults, not the code_output override).
const DEFAULTS: Resolved = {
  trim: true,
  collapseWhitespace: true,
  caseInsensitive: true,
  fullwidthToHalfwidth: true,
  ignoreChinesePunctVariant: true,
  stripPunctuation: false,
  trimTrailingWhitespace: true,
  collapseBlankLines: false,
  synonyms: [],
};

function resolve(opts?: NormalizeOpts): Resolved {
  return {
    trim: opts?.trim ?? DEFAULTS.trim,
    collapseWhitespace: opts?.collapseWhitespace ?? DEFAULTS.collapseWhitespace,
    caseInsensitive: opts?.caseInsensitive ?? DEFAULTS.caseInsensitive,
    fullwidthToHalfwidth: opts?.fullwidthToHalfwidth ?? DEFAULTS.fullwidthToHalfwidth,
    ignoreChinesePunctVariant: opts?.ignoreChinesePunctVariant ?? DEFAULTS.ignoreChinesePunctVariant,
    stripPunctuation: opts?.stripPunctuation ?? DEFAULTS.stripPunctuation,
    trimTrailingWhitespace: opts?.trimTrailingWhitespace ?? DEFAULTS.trimTrailingWhitespace,
    collapseBlankLines: opts?.collapseBlankLines ?? DEFAULTS.collapseBlankLines,
    synonyms: opts?.synonyms ?? DEFAULTS.synonyms,
  };
}

/** Fullwidth ASCII (U+FF01–FF5E) → halfwidth (U+0021–007E); fullwidth space U+3000 → normal space. */
function toHalfwidth(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0); // （）→(), １→1, ，→,, ；→; ...
    } else if (code === 0x3000) {
      out += " ";
    } else {
      out += s[i];
    }
  }
  return out;
}

/** Chinese punctuation ≡ ASCII per §2.4: ，≡, 、≡; ；≡; （≡( ）≡). */
function unifyChinesePunct(s: string): string {
  return s
    .replace(/，/g, ",")
    .replace(/、/g, ";")
    .replace(/；/g, ";")
    .replace(/（/g, "(")
    .replace(/）/g, ")");
}

// ASCII + the Chinese punctuation variants covered above, stripped when requested.
const PUNCT_RE = /[!-/:-@[-`{-~，、；（）。！？：]/g;

function stripPunct(s: string): string {
  return s.replace(PUNCT_RE, "");
}

/** Any whitespace incl. fullwidth space collapsed to a single ASCII space. */
function collapseWs(s: string): string {
  return s.replace(/[\s　]+/g, " ");
}

function trimTrailingPerLine(s: string): string {
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t　]+$/g, ""))
    .join("\n");
}

function collapseBlank(s: string): string {
  return s.replace(/\n{2,}/g, "\n");
}

/**
 * Apply synonym groups: if the whole normalized string equals any member of a group,
 * canonicalize it to the group's first member so equal candidates compare equal.
 */
function applySynonyms(s: string, groups: string[][], o: Resolved): string {
  for (const group of groups) {
    if (!group || group.length === 0) continue;
    const canon = pre(group[0], o);
    for (const member of group) {
      if (pre(member, o) === s) return canon;
    }
  }
  return s;
}

/** The transform chain WITHOUT synonym canonicalization (used to compare synonym members). */
function pre(raw: string, o: Resolved): string {
  let s = raw;
  if (o.fullwidthToHalfwidth) s = toHalfwidth(s);
  if (o.ignoreChinesePunctVariant) s = unifyChinesePunct(s);
  if (o.trimTrailingWhitespace) s = trimTrailingPerLine(s);
  if (o.collapseBlankLines) s = collapseBlank(s);
  if (o.collapseWhitespace) s = collapseWs(s);
  if (o.caseInsensitive) s = s.toLowerCase();
  if (o.stripPunctuation) s = stripPunct(s);
  if (o.trim) s = s.trim();
  return s;
}

/**
 * normalize(raw, opts) — the §2.4 pipeline. Both the author's accept candidates and
 * the user input pass through this same function so objective matching is reproducible.
 */
export function normalize(raw: string, opts?: NormalizeOpts): string {
  const o = resolve(opts);
  const s = pre(raw, o);
  return applySynonyms(s, o.synonyms, o);
}

/**
 * code_output override (§2.4 note): caseInsensitive defaults false; collapseWhitespace OFF so
 * newlines survive and the line-oriented steps (trimTrailingWhitespace / collapseBlankLines) are
 * actually live — otherwise `collapseWs` would fold "1\n2\n3" into "1 2 3" and a single-line answer
 * would be wrongly accepted for multi-line expected output.
 */
export const CODE_OUTPUT_NORMALIZE_DEFAULTS: NormalizeOpts = {
  caseInsensitive: false,
  collapseWhitespace: false,
  trimTrailingWhitespace: true,
};

/**
 * normalize for code_output — folds the type-specific defaults under any author overrides.
 * (Author-supplied opts win over the code_output defaults.)
 */
export function normalizeCodeOutput(raw: string, opts?: NormalizeOpts): string {
  return normalize(raw, { ...CODE_OUTPUT_NORMALIZE_DEFAULTS, ...(opts ?? {}) });
}

/**
 * parseNumeric — §2.4 numeric user-input parsing.
 * Strips unit text, thousands separators (,), underscores, converts fullwidth digits,
 * and parses. Supports 1024 / 1,024 / 1.024e3 / 1_000. Returns null on failure.
 */
export function parseNumeric(raw: string): number | null {
  if (raw == null) return null;
  // Fullwidth digits / plus / minus / dot / e → halfwidth first.
  let s = toHalfwidth(String(raw)).trim();
  if (s === "") return null;
  // Drop thousands separators and underscore digit-group separators.
  s = s.replace(/,/g, "").replace(/_/g, "");
  // Extract the leading numeric token (handles trailing unit text like "1024字节").
  const m = s.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

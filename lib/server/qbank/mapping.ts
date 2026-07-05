// lib/server/qbank/mapping.ts
// Record <-> Prisma-row mapping + the load-bearing answer-key security element (architecture
// §5.3 / §5.4). RUNTIME-PURE: only TYPE-ONLY imports from @prisma/client (no prisma runtime),
// no react/next. Safe to import from services AND (for the pure parts) anywhere.
//
// Responsibilities:
//   - questionRowFromRecord: QuestionRecord -> the object for a Prisma create/update, with the
//     media write-boundary invariant (media[].src must be ^data:image/) enforced HERE, on every
//     write path (import + admin CRUD + migration) per architecture §10.
//   - recordFromRow: quarantine bad payloads (migrate + try/catch, null on failure).
//   - stripAnswerKey: recursively produce a client-safe PublicQuestion (answer key + explanation
//     removed, incl. scenario.parts) — the single most important abuse-surface control (§5.4).
//   - revealKey: the inverse — just the removed key + explanation, merged back after submit.

import { effectiveClass } from "@/lib/qbank/enums";
import { migrate } from "@/lib/qbank/migrate";
import { SCHEMA_VERSION } from "@/lib/qbank/types";
import type {
  LocalizedString,
  Media,
  QuestionRecord,
} from "@/lib/qbank/types";
import { ValidationError } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import type {
  Difficulty,
  Prisma,
  Question,
  QuestionStatus,
  QuestionType,
} from "@prisma/client";

// ============================================================
//  Stem flattening
// ============================================================

/** Flatten a LocalizedString to plain text (first locale value when it is a map). */
export function plainStem(stem: LocalizedString): string {
  if (typeof stem === "string") return stem;
  if (stem && typeof stem === "object") {
    // Prefer zh-CN, then the first available string value.
    const zh = (stem as Record<string, string>)["zh-CN"];
    if (typeof zh === "string") return zh;
    for (const v of Object.values(stem)) {
      if (typeof v === "string") return v;
    }
  }
  return "";
}

// ============================================================
//  Media write-boundary invariant (§10)
// ============================================================

/** True iff every media.src on this leaf-shaped object is a data:image/ URI. */
function assertMediaOnNode(node: unknown, path: string): void {
  if (!node || typeof node !== "object") return;
  const media = (node as { media?: unknown }).media;
  if (media === undefined) return;
  if (!Array.isArray(media)) {
    throw new ValidationError("media 字段必须是数组", { [`${path}.media`]: "media 不是数组" });
  }
  media.forEach((m: unknown, i: number) => {
    const src = (m as { src?: unknown } | null)?.src;
    if (typeof src !== "string" || !/^data:image\//.test(src)) {
      throw new ValidationError("图片必须是 data:image/* URI（禁外链/防 XSS）", {
        [`${path}.media[${i}].src`]: "非法的 media.src（必须以 data:image/ 开头）",
      });
    }
  });
}

/**
 * Enforce the media write-boundary invariant recursively: the record itself AND every
 * scenario part. Throws ValidationError (never leaks) on the first violation.
 */
function assertMediaBoundary(rec: QuestionRecord): void {
  assertMediaOnNode(rec, "record");
  if (rec.type === "scenario" && Array.isArray(rec.parts)) {
    rec.parts.forEach((part, i) => assertMediaOnNode(part, `record.parts[${i}]`));
  }
}

// ============================================================
//  Record -> Prisma row
// ============================================================

/** The shape written to Prisma Question.create / .update (mirror columns + JSONB payload). */
export interface QuestionRowInput {
  id: string;
  bankId: string;
  type: QuestionType;
  difficulty: Difficulty;
  gradingClass: ReturnType<typeof effectiveClass>;
  status?: QuestionStatus;
  stemText: string;
  tagsFlat: string[];
  payload: Prisma.InputJsonValue;
  schemaVersion: number;
  authorId?: string;
}

/**
 * questionRowFromRecord — map a validated QuestionRecord to the Prisma row object.
 * gradingClass is ALWAYS recomputed via effectiveClass (never trusted from input, §2.1).
 * Enforces the media write-boundary invariant BEFORE returning (throws ValidationError).
 */
export function questionRowFromRecord(
  rec: QuestionRecord,
  bankId: string,
  opts?: { status?: QuestionStatus; authorId?: string },
): QuestionRowInput {
  assertMediaBoundary(rec);

  const row: QuestionRowInput = {
    id: rec.id,
    bankId,
    type: rec.type as QuestionType,
    difficulty: rec.difficulty as Difficulty,
    gradingClass: effectiveClass(rec),
    stemText: plainStem(rec.stem),
    tagsFlat: rec.tags,
    payload: rec as unknown as Prisma.InputJsonValue,
    schemaVersion: SCHEMA_VERSION,
  };
  if (opts?.status !== undefined) row.status = opts.status;
  if (opts?.authorId !== undefined) row.authorId = opts.authorId;
  return row;
}

/** Convenience: the tag slugs to sync for a record (thin, but keeps call sites uniform). */
export function syncTagsInput(rec: QuestionRecord): string[] {
  return rec.tags;
}

// ============================================================
//  Prisma row -> Record (quarantine bad rows)
// ============================================================

/**
 * recordFromRow — read a Question.payload back into a QuestionRecord via migrate() (lazy
 * up-versioning, §6.4). On any failure the row is QUARANTINED: log + return null, so one bad
 * payload never crashes a list query (§5.3). Callers filter out null.
 */
export function recordFromRow(row: Pick<Question, "payload">): QuestionRecord | null {
  try {
    return migrate(row.payload) as QuestionRecord;
  } catch (e) {
    logger.error("payload_migrate_failed", {
      id: (row as { id?: string }).id,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

// ============================================================
//  stripAnswerKey / revealKey — the load-bearing security element (§5.4)
// ============================================================

// Keys that carry the answer key or explanation and must NEVER reach an un-answered client.
// (blanks[].accept is stripped separately — we keep blank count + labels.)
const KEY_FIELDS = [
  "answer",
  "accept",
  "expected",
  "order",
  "pairs",
  "reference",
  "rubric",
  "explanation",
  "keywords", // hints the answer → drop
  "value", // numeric answer → drop (stripNode is shallow-per-node, so only NumericQ.value at a
  //          record/part top level is removed — nested x.value is preserved)
] as const;

/**
 * PublicQuestion — a client-safe view of a QuestionRecord: same structural fields the UI needs
 * to render the prompt (stem/type/difficulty/tags/media/options/items/left/right/blank shells/
 * mode/unit/orderScoring), with the answer key AND explanation removed at every level including
 * scenario parts. Modeled as a deep-partial-ish erasure of QuestionRecord (a pragmatic view;
 * every removed field is optional here so the type is tsc-clean and usable by the client).
 */
export type PublicQuestion = DeepPublic<QuestionRecord>;

// Recursive "strip the key fields" type. For arrays, map element-wise; for objects, omit the
// key fields and recurse; primitives pass through. `parts` is handled specially in the type so
// scenario stays a usable discriminated shape.
type StrippedKey = (typeof KEY_FIELDS)[number];
type DeepPublic<T> = T extends readonly (infer E)[]
  ? DeepPublic<E>[]
  : T extends object
    ? { [K in Exclude<keyof T, StrippedKey>]: DeepPublic<T[K]> }
    : T;

/** A public blank shell — the count/label survive, the accept[] key is dropped. */
interface PublicBlank {
  label?: string;
}

/**
 * stripAnswerKey — RECURSIVELY remove the answer key + explanation from a record, returning a
 * client-safe copy. Never mutates the input. Handles:
 *   - top-level key fields (answer/accept/expected/order/pairs/reference/rubric/explanation/keywords)
 *   - blanks[]  → keep count + labels, DROP accept
 *   - matching  → keep left/right, DROP pairs
 *   - ordering  → keep items, DROP order
 *   - scenario  → recurse into parts[], stripping each part's own key/explanation
 * KEEPS: options/items/left/right/stem/type/difficulty/tags/media/id/mode/unit/orderScoring.
 */
export function stripAnswerKey(rec: QuestionRecord): PublicQuestion {
  return stripNode(rec) as PublicQuestion;
}

/** Strip one record-or-part node (used for both the top record and each scenario part). */
function stripNode(node: QuestionRecord | (QuestionRecord & { points?: number })): unknown {
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(node)) {
    if ((KEY_FIELDS as readonly string[]).includes(k)) continue; // drop key/explanation/keywords
    if (k === "blanks") continue; // handled below (keep shells only)
    if (k === "parts") continue; // handled below (recurse)
    out[k] = v;
  }

  // blanks → keep count + labels, drop accept (fill_blank / cloze).
  const blanks = (node as { blanks?: { label?: string }[] }).blanks;
  if (Array.isArray(blanks)) {
    out.blanks = blanks.map((b): PublicBlank => (b.label !== undefined ? { label: b.label } : {}));
  }

  // scenario parts → recurse, stripping each part's own key/reference/expected/explanation.
  const parts = (node as { parts?: (QuestionRecord & { points?: number })[] }).parts;
  if (Array.isArray(parts)) {
    out.parts = parts.map((p) => {
      const stripped = stripNode(p) as Record<string, unknown>;
      // `points` (weight) is safe to reveal for layout; it is preserved by the generic copy above
      // because it is not a KEY_FIELD, so nothing extra to do here.
      return stripped;
    });
  }

  return out;
}

// ============================================================
//  revealKey — the inverse projection (merged back after submit)
// ============================================================

/** The removed key + explanation for one leaf/record (all optional — shape depends on type). */
export interface AnswerReveal {
  answer?: unknown;
  accept?: unknown;
  expected?: unknown;
  order?: unknown;
  pairs?: unknown;
  reference?: unknown;
  rubric?: unknown;
  blanks?: unknown; // blanks[].accept (the graded part of each blank)
  explanation?: unknown;
  keywords?: unknown;
  value?: unknown; // NumericQ answer (revealed after submit)
  /** For scenario: per-part reveal keyed by part id. */
  parts?: Record<string, AnswerReveal>;
}

/**
 * revealKey — the INVERSE of stripAnswerKey: return ONLY the fields stripAnswerKey removed
 * (the answer key + explanation), so the client can merge them back in after a graded submit
 * (§5.4). For scenario, `parts` is keyed by each part id.
 */
export function revealKey(rec: QuestionRecord): AnswerReveal {
  const reveal = revealNode(rec);

  if (rec.type === "scenario" && Array.isArray(rec.parts)) {
    const parts: Record<string, AnswerReveal> = {};
    for (const part of rec.parts) {
      parts[part.id] = revealNode(part);
    }
    reveal.parts = parts;
  }

  return reveal;
}

/** Pull the key + explanation fields off one node (record or scenario part). */
function revealNode(node: QuestionRecord | (QuestionRecord & { points?: number })): AnswerReveal {
  const n = node as unknown as Record<string, unknown>;
  const r: AnswerReveal = {};

  if ("answer" in n) r.answer = n.answer;
  if ("accept" in n) r.accept = n.accept;
  if ("expected" in n) r.expected = n.expected;
  if ("order" in n) r.order = n.order;
  if ("pairs" in n) r.pairs = n.pairs;
  if ("reference" in n) r.reference = n.reference;
  if ("rubric" in n) r.rubric = n.rubric;
  if ("explanation" in n) r.explanation = n.explanation;
  if ("keywords" in n) r.keywords = n.keywords;
  if ("value" in n) r.value = n.value;

  // blanks: reveal the accept[] (the graded key) keyed positionally.
  const blanks = (node as { blanks?: { accept?: unknown }[] }).blanks;
  if (Array.isArray(blanks)) {
    r.blanks = blanks.map((b) => b.accept);
  }

  return r;
}

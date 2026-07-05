// lib/qbank/serialize.ts
// Pure envelope construction (§6.5). No DOM, no Date.now/new Date — exportedAt is a param.

import { FORMAT_ID, SCHEMA_VERSION } from "./types";
import type { QBankEnvelope, QuestionRecord, QuestionType } from "./types";

/** Count questions by ASCII type for the redundant `counts` field. */
function countByType(questions: QuestionRecord[]): Partial<Record<QuestionType, number>> {
  const by: Partial<Record<QuestionType, number>> = {};
  for (const q of questions) {
    by[q.type] = (by[q.type] ?? 0) + 1;
  }
  return by;
}

/**
 * buildEnvelope — wrap questions into a QBankEnvelope with format/schemaVersion/counts.
 * Pure: `exportedAt` is passed in (defaults to "" so callers stay deterministic; the app
 * layer supplies a timestamp). Questions are embedded as-is (no runtime progress).
 */
export function buildEnvelope(
  questions: QuestionRecord[],
  meta?: { title?: string; locale?: string; author?: string },
  exportedAt: string = "",
): QBankEnvelope {
  const envelope: QBankEnvelope = {
    format: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    counts: { total: questions.length, byType: countByType(questions) },
    questions,
  };

  if (meta?.author) {
    envelope.source = { app: "ByteOffer", author: meta.author };
  }
  if (meta?.title || meta?.locale) {
    envelope.meta = {};
    if (meta.title) envelope.meta.title = meta.title;
    if (meta.locale) envelope.meta.locale = meta.locale;
  }

  return envelope;
}

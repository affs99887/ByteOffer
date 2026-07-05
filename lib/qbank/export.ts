// lib/qbank/export.ts
// PURE export helpers (qbank-data-model.md §6.5). Re-exports the pure envelope builder and
// adds JSON serialization. NO DOM here — the browser download (Blob/URL.createObjectURL)
// stays in a client component (Phase 3).

export { buildEnvelope } from "./serialize";
import type { QBankEnvelope } from "./types";

/** Serialize an envelope to pretty-printed JSON (for file download / inspection). */
export function envelopeToJson(env: QBankEnvelope): string {
  return JSON.stringify(env, null, 2);
}

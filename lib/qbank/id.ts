// lib/qbank/id.ts
// Zero-dependency deterministic id derivation (§3.4).
// deriveId(type, stem) = "q_" + fnv1a(type + "|" + stem).toString(36)

/** FNV-1a 32-bit hash of a UTF-16 code-unit stream, returned as an unsigned int. */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5; // 2166136261 offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit FNV prime multiply (16777619) via shifts to stay in 32-bit range.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic id so identical (type, stem) → identical id (idempotent re-import). */
export function deriveId(type: string, stem: string): string {
  return "q_" + fnv1a(type + "|" + stem).toString(36);
}

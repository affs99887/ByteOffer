// lib/qbank/migrate.ts
// §6.4 schemaVersion migration chain. Pure. Empty MIGRATIONS map for v1.

import { SCHEMA_VERSION } from "./types";

// vN -> vN+1, pure.
type Migration = (e: any) => any;

// Fill when 1->2 lands, e.g. { 1: migrate1to2 }.
const MIGRATIONS: Record<number, Migration> = {};

export class SchemaTooNewError extends Error {
  constructor(version: string) {
    super(`schema version ${version} is newer than supported ${SCHEMA_VERSION}`);
    this.name = "SchemaTooNewError";
  }
}

/**
 * migrate(raw) — walk the migration chain up to SCHEMA_VERSION.
 * Both file imports and load-from-localStorage pass through this so memory is always current.
 * Throws SchemaTooNewError when the payload is from a newer app.
 */
export function migrate(raw: any): any {
  let e = raw;
  let v: number = e?.schemaVersion ?? 1;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break; // no migration registered for this step; leave as-is.
    e = step(e);
    v = e.schemaVersion;
  }
  if (v > SCHEMA_VERSION) throw new SchemaTooNewError(String(v));
  return e;
}

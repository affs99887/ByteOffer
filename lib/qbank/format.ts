// lib/qbank/format.ts
// Zero-dependency date formatting + LocalizedString resolution.
// (Does NOT touch the existing fmtTime in lib/data.ts.)

import type { LocalizedString } from "./types";

/** epoch ms → "YYYY-MM-DD" (UTC-stable via the Date's local calendar fields). */
export function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * resolveLocale(field, locale?) — collapse a LocalizedString to a plain string.
 * - string → returned as-is.
 * - Record → exact locale, else meta locale's base language, else first available value.
 */
export function resolveLocale(field: LocalizedString, locale?: string): string {
  if (typeof field === "string") return field;
  if (!field || typeof field !== "object") return "";

  if (locale && typeof field[locale] === "string") return field[locale];

  if (locale) {
    const base = locale.split("-")[0];
    if (typeof field[base] === "string") return field[base];
    for (const key of Object.keys(field)) {
      if (key.split("-")[0] === base && typeof field[key] === "string") return field[key];
    }
  }

  const keys = Object.keys(field);
  return keys.length > 0 ? field[keys[0]] : "";
}

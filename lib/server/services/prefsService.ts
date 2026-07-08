// lib/server/services/prefsService.ts
// UI-preference persistence (architecture §4.2). One of the ONLY layers touching Prisma. Backs the
// settings screen's layout (侧边栏/顶部导航), app + sidebar theme (浅色/深色), and daily-goal controls,
// replacing the demo's localStorage (bo_daily_goal etc.) with a durable, per-user UserPreference row.
// Ownership is intrinsic: every read/write targets where:{ userId } from the SESSION, never a
// client-supplied id (no IDOR). Values are normalized on BOTH read and write (defense in depth): the
// row is the authority, but a malformed/legacy value never escapes as an out-of-union pref.

import { prisma } from "@/lib/server/db";

/** The full preference set the client store mirrors (dailyGoal == the app-context `setGoal`). */
export interface UserPrefs {
  layout: "sidebar" | "top";
  appTheme: "light" | "dark";
  sbTheme: "light" | "dark";
  dailyGoal: number;
}

/**
 * Schema defaults — returned verbatim when the user has no UserPreference row yet, and the base a
 * first create() layers the patch onto. Mirrors the app-context INITIAL (layout sidebar, app light,
 * sidebar dark, goal 30) so an un-persisted client and a fresh server read agree.
 */
const DEFAULT_PREFS: UserPrefs = {
  layout: "sidebar",
  appTheme: "light",
  sbTheme: "dark",
  dailyGoal: 30,
};

const GOAL_MIN = 5;
const GOAL_MAX = 500;

/** Narrow a stored/incoming layout to the union (unknown → sidebar). */
function normLayout(v: string): "sidebar" | "top" {
  return v === "top" ? "top" : "sidebar";
}
/** Narrow a stored/incoming theme to the union, falling back to the field's default. */
function normTheme(v: string, fallback: "light" | "dark"): "light" | "dark" {
  return v === "light" ? "light" : v === "dark" ? "dark" : fallback;
}
/** Round + clamp the daily goal into [GOAL_MIN, GOAL_MAX]; non-finite → the default. */
function clampGoal(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PREFS.dailyGoal;
  return Math.min(GOAL_MAX, Math.max(GOAL_MIN, Math.round(n)));
}

/** Project a UserPreference row (whatever the columns hold) to a normalized UserPrefs. */
function toPrefs(row: {
  layout: string;
  appTheme: string;
  sbTheme: string;
  dailyGoal: number;
}): UserPrefs {
  return {
    layout: normLayout(row.layout),
    appTheme: normTheme(row.appTheme, DEFAULT_PREFS.appTheme),
    sbTheme: normTheme(row.sbTheme, DEFAULT_PREFS.sbTheme),
    dailyGoal: clampGoal(row.dailyGoal),
  };
}

/**
 * getPreferences — the session user's persisted prefs. No row yet → the schema DEFAULT_PREFS (the
 * user has simply never saved). Every field is normalized so the caller always sees a valid union.
 */
export async function getPreferences(userId: string): Promise<UserPrefs> {
  const row = await prisma.userPreference.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_PREFS };
  return toPrefs(row);
}

/**
 * savePreferences — upsert the session user's prefs from a PARTIAL patch: create layers the patch
 * onto DEFAULT_PREFS (a first-ever save), update writes only the patched fields (unset fields keep
 * their stored value). dailyGoal is re-clamped (5..500) and the enums re-normalized here even though
 * the action's zod already validated — the service is the last line before the DB. Returns the full
 * merged, normalized prefs so the client can reconcile its store from the authoritative row.
 */
export async function savePreferences(
  userId: string,
  patch: Partial<UserPrefs>,
): Promise<UserPrefs> {
  // Build a clean patch containing only the provided fields, each normalized.
  const clean: Partial<UserPrefs> = {};
  if (patch.layout !== undefined) clean.layout = normLayout(patch.layout);
  if (patch.appTheme !== undefined) clean.appTheme = normTheme(patch.appTheme, DEFAULT_PREFS.appTheme);
  if (patch.sbTheme !== undefined) clean.sbTheme = normTheme(patch.sbTheme, DEFAULT_PREFS.sbTheme);
  if (patch.dailyGoal !== undefined) clean.dailyGoal = clampGoal(patch.dailyGoal);

  const row = await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_PREFS, ...clean },
    update: clean,
  });
  return toPrefs(row);
}

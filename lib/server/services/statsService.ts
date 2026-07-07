// lib/server/services/statsService.ts
// Real stats (architecture §7.2). One of the ONLY layers touching Prisma. All reads are
// ownership-scoped by userId. Objective accuracy ALWAYS uses the objectiveAttempts denominator
// (§7.2 铁律): selfGraded / null-score attempts are excluded by that counter and are NEVER counted
// as wrong. Everything degrades to empty arrays / zeros when there is no data, so `/` renders for a
// brand-new user (and the whole module fails soft — app/page.tsx also wraps calls in try/catch).
//
// Phase 6 fills the prior TODOs: report(userId, rangeDays) → accuracy trend, category mastery,
// weakest categories, difficulty breakdown, streak, study minutes. dashboard() now delegates to a
// subset of report() so the two never diverge. The nightly reconciliation lives in
// app/api/cron/reconcile/route.ts and recomputes DailyUserStat from the authoritative Attempt table.

import { prisma } from "@/lib/server/db";
import type { GradingClass, Prisma } from "@prisma/client";

// ============================================================
//  Objective-denominator铁律 helpers (mirror attemptService)
// ============================================================

/** Grading classes that contribute to the objective accuracy denominator (§7.2). */
const OBJECTIVE_CLASSES: ReadonlySet<GradingClass> = new Set<GradingClass>([
  "auto_exact",
  "auto_set",
  "auto_normalized",
  "auto_partial",
]);

/** Cap category/difficulty breakdowns so a huge taxonomy can't bloat the payload. */
const MAX_CATEGORIES = 12;
const CATEGORY_MASTERY_CACHE_MS = 5 * 60 * 1000; // optional 5-min in-memory cache (§7.2)

// ============================================================
//  Date helpers (date-only, matches @db.Date)
// ============================================================

/** UTC midnight for a Date (date-only, matches the @db.Date column). */
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** ISO date key (YYYY-MM-DD) in UTC for trend keys + streak set membership. */
function dayKey(d: Date): string {
  return utcMidnight(d).toISOString().slice(0, 10);
}

/** Objective accuracy percentage from a correct/objective pair (0 when the denominator is 0). */
function pct(correct: number, objective: number): number {
  return objective > 0 ? Math.round((correct / objective) * 100) : 0;
}

// ============================================================
//  Public shapes
// ============================================================

export interface AccuracyTrendPoint {
  /** YYYY-MM-DD (UTC). */
  day: string;
  attempts: number;
  correct: number;
  objectiveAttempts: number;
  /** correct / objectiveAttempts as a whole percent (0 when no objective attempts that day). */
  accuracyPct: number;
}

export interface CategoryMastery {
  /** Display name (Category.name if joined by categoryId, else a tag slug). */
  category: string;
  /** Number of objective attempts observed for this category. */
  count: number;
  /** Objective accuracy % for this category (correct / objectiveAttempts). */
  accuracyPct: number;
}

export interface DifficultyMastery {
  difficulty: string;
  count: number;
  accuracyPct: number;
}

export interface TypeMastery {
  /** ASCII QuestionType enum (e.g. "single_choice"); the client maps it via TYPE_LABEL. */
  type: string;
  count: number;
  accuracyPct: number;
}

export interface StatsReport {
  /** Per-day objective accuracy over the last `rangeDays` (ascending by day). */
  accuracyTrend: AccuracyTrendPoint[];
  /** Lifetime attempts (sum of DailyUserStat.attempts). */
  totalAttempts: number;
  /** Lifetime correct answers. */
  correctCount: number;
  /** Lifetime objective attempts (the accuracy denominator). */
  objectiveAttempts: number;
  /** Lifetime objective accuracy % = correctCount / objectiveAttempts. */
  accuracyPct: number;
  /** Lifetime study minutes (sum of DailyUserStat.studyMs / 60000, rounded). */
  studyMinutes: number;
  /** Consecutive days (ending today or yesterday) with attempts > 0. */
  streak: number;
  /** Attempts logged today. */
  todayCount: number;
  /** Objective accuracy by difficulty (from Attempt joined to Question). */
  byDifficulty?: DifficultyMastery[];
  /** Objective accuracy by question TYPE (ASCII enum), SAME 铁律 denominator as byDifficulty. */
  typeMastery: TypeMastery[];
  /** Objective mastery by category/tag, capped to the top N by attempt count. */
  categoryMastery: CategoryMastery[];
  /** The weakest categories (lowest accuracy, min sample size) — for the "focus here" nudge. */
  weakestCategories: string[];
}

/**
 * dashboard — the minimal, home-KPI subset kept for backward compatibility (Phase 3a). It now
 * DELEGATES to report() so the two never diverge (§7.2). The extra report() fields are simply
 * dropped here; existing dashboard() callers keep the same shape.
 */
export interface DashboardStats {
  totalAttempts: number;
  correctCount: number;
  accuracyPct: number;
  todayCount: number;
  streak: number;
  byCategory?: undefined;
}

// ============================================================
//  report — the Phase 6 enriched read (§7.2)
// ============================================================

/**
 * report — the full stats read for the home + stats screens (§7.2). Ownership-scoped by userId.
 *   - lifetime totals + objective accuracy from an aggregate over DailyUserStat;
 *   - accuracyTrend from DailyUserStat rows with day >= today-range, ascending;
 *   - streak by walking consecutive active days backward from today (or yesterday);
 *   - byDifficulty + categoryMastery + weakestCategories from Attempt joined to Question, using the
 *     objective filter (score != null && gradingClass ∈ auto_*) so subjective/ungraded never count
 *     as wrong (§7.2 铁律).
 * Degrades to empty arrays / zeros with no data (no throw on the happy path; the caller also guards).
 */
export async function report(userId: string, rangeDays = 30): Promise<StatsReport> {
  const range = Math.max(1, Math.min(rangeDays, 366));

  // --- Lifetime totals (single aggregate over the materialized daily rows) ---
  const agg = await prisma.dailyUserStat.aggregate({
    where: { userId },
    _sum: { attempts: true, correct: true, objectiveAttempts: true, studyMs: true },
  });
  const totalAttempts = agg._sum.attempts ?? 0;
  const correctCount = agg._sum.correct ?? 0;
  const objectiveAttempts = agg._sum.objectiveAttempts ?? 0;
  const studyMinutes = Math.round((agg._sum.studyMs ?? 0) / 60000);
  const accuracyPct = pct(correctCount, objectiveAttempts);

  // --- Accuracy trend over the range (ascending), plus today's count + streak ---
  const today = utcMidnight(new Date());
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (range - 1));

  const trendRows = await prisma.dailyUserStat.findMany({
    where: { userId, day: { gte: from } },
    orderBy: { day: "asc" },
    select: { day: true, attempts: true, correct: true, objectiveAttempts: true },
  });
  const accuracyTrend: AccuracyTrendPoint[] = trendRows.map((r) => ({
    day: dayKey(r.day),
    attempts: r.attempts,
    correct: r.correct,
    objectiveAttempts: r.objectiveAttempts,
    accuracyPct: pct(r.correct, r.objectiveAttempts),
  }));

  const todayCount =
    trendRows.find((r) => dayKey(r.day) === dayKey(today))?.attempts ?? 0;

  const streak = await computeStreak(userId, today);

  // --- Attempt-joined breakdowns (difficulty + type + category) ---
  const { byDifficulty, typeMastery, categoryMastery, weakestCategories } =
    await attemptBreakdowns(userId);

  return {
    accuracyTrend,
    totalAttempts,
    correctCount,
    objectiveAttempts,
    accuracyPct,
    studyMinutes,
    streak,
    todayCount,
    byDifficulty,
    typeMastery,
    categoryMastery,
    weakestCategories,
  };
}

/**
 * dashboard — the minimal home KPIs, delegating to report() (§7.2). A subset projection keeps the
 * legacy shape stable for any existing callers.
 */
export async function dashboard(userId: string): Promise<DashboardStats> {
  const r = await report(userId, 30);
  return {
    totalAttempts: r.totalAttempts,
    correctCount: r.correctCount,
    accuracyPct: r.accuracyPct,
    todayCount: r.todayCount,
    streak: r.streak,
  };
}

// ============================================================
//  streak — consecutive active days ending today or yesterday
// ============================================================

async function computeStreak(userId: string, today: Date): Promise<number> {
  const recent = await prisma.dailyUserStat.findMany({
    where: { userId, attempts: { gt: 0 } },
    orderBy: { day: "desc" },
    take: 400, // > 1 year of daily rows bounds any realistic streak scan
    select: { day: true },
  });
  const activeDays = new Set(recent.map((r) => dayKey(r.day)));

  let streak = 0;
  const cursor = new Date(today);
  // Let the streak "start" yesterday if today has no activity yet.
  if (!activeDays.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (activeDays.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

// ============================================================
//  Attempt-joined breakdowns (difficulty + category mastery)
// ============================================================

/** A single objective attempt row projected for the breakdowns (score + its question's facets). */
interface ObjectiveAttemptRow {
  score: number | null;
  gradingClass: GradingClass;
  question: {
    type: string;
    difficulty: string;
    categoryId: string | null;
    tagsFlat: string[];
    category: { name: string } | null;
  };
}

interface Breakdowns {
  byDifficulty: DifficultyMastery[];
  typeMastery: TypeMastery[];
  categoryMastery: CategoryMastery[];
  weakestCategories: string[];
}

/** Tiny per-user memo of the attempt breakdowns (optional 5-min cache, §7.2). */
const breakdownCache = new Map<string, { at: number; value: Breakdowns }>();

/**
 * attemptBreakdowns — difficulty + category mastery from the authoritative Attempt table joined to
 * Question. Reads ONLY objective attempts (score != null && gradingClass ∈ auto_*) — the same
 * filter as the objectiveAttempts counter — so subjective/ungraded attempts never affect accuracy
 * (§7.2 铁律). Grouped by difficulty, by question TYPE, and by category (Category.name when
 * categoryId is set, else the first tag slug). Categories are capped to the top N by attempt count;
 * weakest = lowest accuracy among categories with a minimum sample. Degrades to empty on no data /
 * any read failure.
 */
async function attemptBreakdowns(userId: string): Promise<Breakdowns> {
  const cached = breakdownCache.get(userId);
  if (cached && Date.now() - cached.at < CATEGORY_MASTERY_CACHE_MS) return cached.value;

  const EMPTY: Breakdowns = {
    byDifficulty: [],
    typeMastery: [],
    categoryMastery: [],
    weakestCategories: [],
  };

  let rows: ObjectiveAttemptRow[];
  try {
    rows = await prisma.attempt.findMany({
      where: {
        userId,
        score: { not: null },
        gradingClass: { in: [...OBJECTIVE_CLASSES] },
      },
      select: {
        score: true,
        gradingClass: true,
        question: {
          select: {
            type: true,
            difficulty: true,
            categoryId: true,
            tagsFlat: true,
            category: { select: { name: true } },
          },
        },
      },
      // Bound the scan; a heavy user's accuracy stabilizes well within this window.
      take: 5000,
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return EMPTY;
  }

  if (rows.length === 0) {
    breakdownCache.set(userId, { at: Date.now(), value: EMPTY });
    return EMPTY;
  }

  // A running (correct, count) accumulator keyed by bucket label.
  type Acc = { correct: number; count: number };
  const diffAcc = new Map<string, Acc>();
  const typeAcc = new Map<string, Acc>();
  const catAcc = new Map<string, Acc>();

  const bump = (m: Map<string, Acc>, key: string, isCorrect: boolean) => {
    const a = m.get(key) ?? { correct: 0, count: 0 };
    a.count += 1;
    if (isCorrect) a.correct += 1;
    m.set(key, a);
  };

  for (const row of rows) {
    // A score of 1 is a full-credit correct; partial (0<score<1) and 0 are not "correct". This
    // matches the AttemptStatus mapping without needing the status column.
    const isCorrect = (row.score ?? 0) >= 1;
    bump(diffAcc, row.question.difficulty, isCorrect);
    bump(typeAcc, row.question.type, isCorrect);

    const catLabel =
      row.question.category?.name ??
      (row.question.tagsFlat.length > 0 ? row.question.tagsFlat[0] : null);
    if (catLabel) bump(catAcc, catLabel, isCorrect);
  }

  // Preserve a stable difficulty order for the UI.
  const DIFF_ORDER = ["easy", "medium", "hard"];
  const byDifficulty: DifficultyMastery[] = [...diffAcc.entries()]
    .map(([difficulty, a]) => ({ difficulty, count: a.count, accuracyPct: pct(a.correct, a.count) }))
    .sort((x, y) => DIFF_ORDER.indexOf(x.difficulty) - DIFF_ORDER.indexOf(y.difficulty));

  // Type breakdown: most-practiced type first (ties by ASCII enum name) — same objective 铁律.
  const typeMastery: TypeMastery[] = [...typeAcc.entries()]
    .map(([type, a]) => ({ type, count: a.count, accuracyPct: pct(a.correct, a.count) }))
    .sort((x, y) => y.count - x.count || x.type.localeCompare(y.type));

  const categoryMastery: CategoryMastery[] = [...catAcc.entries()]
    .map(([category, a]) => ({ category, count: a.count, accuracyPct: pct(a.correct, a.count) }))
    .sort((x, y) => y.count - x.count)
    .slice(0, MAX_CATEGORIES);

  // Weakest: lowest accuracy among categories with a minimum sample (≥3 attempts) so a single miss
  // does not dominate. Fall back to the lowest-accuracy categories overall if none clear the bar.
  const MIN_SAMPLE = 3;
  const ranked = categoryMastery
    .filter((c) => c.count >= MIN_SAMPLE)
    .sort((x, y) => x.accuracyPct - y.accuracyPct);
  const pool = ranked.length > 0 ? ranked : [...categoryMastery].sort((x, y) => x.accuracyPct - y.accuracyPct);
  const weakestCategories = pool.slice(0, 3).map((c) => c.category);

  const value: Breakdowns = { byDifficulty, typeMastery, categoryMastery, weakestCategories };
  breakdownCache.set(userId, { at: Date.now(), value });
  return value;
}

// ============================================================
//  reconcile — recompute DailyUserStat from the authoritative Attempt table (§7.2)
// ============================================================

/** One reconciled day's authoritative counters, derived from Attempt rows. */
interface DayTotals {
  attempts: number;
  correct: number;
  objectiveAttempts: number;
  studyMs: number;
}

/**
 * reconcileWindow — self-heal DailyUserStat drift for a recent window (§7.2, nightly cron). For each
 * user with attempts in [from, today], recompute the authoritative daily counters from the Attempt
 * table and upsert corrections. IDEMPOTENT: recomputing yields identical values, so a re-run is a
 * no-op. Correctness does NOT depend on this — the attempt tx already materializes counters; this
 * only repairs drift (e.g. a crashed tx, a manual data fix). Returns the number of (user, day) rows
 * written. No auth here — the route handler guards with CRON_SECRET before calling.
 */
export async function reconcileWindow(rangeDays = 3): Promise<{ reconciled: number }> {
  const range = Math.max(1, Math.min(rangeDays, 90));
  const today = utcMidnight(new Date());
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (range - 1));
  // Upper bound is exclusive end-of-today so "today so far" is included.
  const toExclusive = new Date(today);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  // Pull every attempt in the window with just the fields needed to recompute the counters.
  const attempts = await prisma.attempt.findMany({
    where: { createdAt: { gte: from, lt: toExclusive } },
    select: {
      userId: true,
      createdAt: true,
      status: true,
      score: true,
      selfScore: true,
      gradingClass: true,
      durationMs: true,
    },
  });

  // Fold into a (userId → day → totals) map.
  const byUserDay = new Map<string, Map<string, DayTotals>>();
  for (const a of attempts) {
    const dk = dayKey(a.createdAt);
    let days = byUserDay.get(a.userId);
    if (!days) {
      days = new Map<string, DayTotals>();
      byUserDay.set(a.userId, days);
    }
    const t = days.get(dk) ?? { attempts: 0, correct: 0, objectiveAttempts: 0, studyMs: 0 };
    t.attempts += 1;
    // Objective denominator: objective class with a non-null score. selfScore-only attempts (§4)
    // and null-score (manual_reference/ungraded) are excluded — never counted as wrong.
    const isObjective =
      a.score !== null && OBJECTIVE_CLASSES.has(a.gradingClass as GradingClass);
    // §7.2 铁律: `correct` is the OBJECTIVE numerator — it must share the objectiveAttempts gate.
    // A self-assessed subjective attempt ends life as status="correct" with score=null; counting it
    // here (as an ungated status check once did) inflates objective accuracy overnight, diverging
    // from the live path (upsertDailyStat), which never books subjective self-grades as correct.
    if (isObjective && a.status === "correct") t.correct += 1;
    if (isObjective) t.objectiveAttempts += 1;
    if (a.durationMs && a.durationMs > 0) {
      t.studyMs += Math.min(a.durationMs, 24 * 3600 * 1000);
    }
    days.set(dk, t);
  }

  // Upsert each (user, day) with the recomputed authoritative counters.
  let reconciled = 0;
  for (const [userId, days] of byUserDay) {
    for (const [dk, t] of days) {
      const day = new Date(`${dk}T00:00:00.000Z`);
      const data: Prisma.DailyUserStatUncheckedUpdateInput = {
        attempts: t.attempts,
        correct: t.correct,
        objectiveAttempts: t.objectiveAttempts,
        studyMs: t.studyMs,
      };
      await prisma.dailyUserStat.upsert({
        where: { userId_day: { userId, day } },
        create: {
          userId,
          day,
          attempts: t.attempts,
          correct: t.correct,
          objectiveAttempts: t.objectiveAttempts,
          studyMs: t.studyMs,
        },
        update: data,
      });
      reconciled += 1;
    }
  }

  // A reconcile pass can change any user's numbers; drop the memo so the next report() recomputes.
  breakdownCache.clear();

  return { reconciled };
}

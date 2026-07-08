"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  wrongItems,
  favItems,
  recentItems,
  diffStyle,
  diffChip,
  typeChipStyle,
  fmtTime,
  type ListItem,
} from "@/lib/data";
import { computeThemeVars, type ThemeMode } from "@/lib/theme";
import { sampleEnvelope } from "@/lib/qbank/seed";
import { grade } from "@/lib/qbank/grade";
import { effectiveClass, TYPE_LABEL, DIFF_LABEL } from "@/lib/qbank/enums";
import { fmtDate, resolveLocale } from "@/lib/qbank/format";
import { validateEnvelope, type ImportReport, type RecordReport } from "@/lib/qbank/validate";
import { buildEnvelope, envelopeToJson } from "@/lib/qbank/export";
import { migrate } from "@/lib/qbank/migrate";
import type {
  Accept,
  CodeOutputQ,
  Difficulty,
  FillBlankQ,
  GradeResult,
  GradingClass,
  MatchingQ,
  MultipleChoiceQ,
  NumericQ,
  OrderingQ,
  QuestionRecord,
  ScenarioQ,
  QuestionType,
  SingleChoiceQ,
  TrueFalseQ,
  UserAnswer,
} from "@/lib/qbank/types";
import type { AnswerReveal } from "@/components/qbank/answer-field";
// TYPE-ONLY import (fully erased at compile — no server runtime pulled into the client bundle):
// the stripped practice-question shape produced by the server's stripAnswerKey (§5.4).
import type { PublicQuestion } from "@/lib/server/qbank/mapping";

const css = (o: CSSProperties): CSSProperties => o;

// ---------- practice question shape (demo full-record vs authed stripped) ----------
// In DEMO mode the bank holds full QuestionRecord[] (with answer keys) → local grade()/reveal.
// In AUTHED mode the bank holds server-STRIPPED records (PublicQuestion — no answer key, no
// explanation, §5.4); grading + reveal come from the server submit response, NEVER a local grade().
// PracticeQuestion is the union of both so the injected bank type-checks either way. The code below
// GATES every key-dependent call (grade/correctAnswerText/buildReveal/toAna) on `serverSubmit` so a
// stripped record is never fed to a key-reading function; structural reads (stem/options/items/
// left/right/blank shells/tags/source) are valid on both arms.
type PracticeQuestion = QuestionRecord | PublicQuestion;

/**
 * The "unanswered" objective result shown for an authed question BEFORE its server submit lands.
 * We cannot call grade() on a stripped record (keys gone), so pre-submit we surface a neutral,
 * ungraded placeholder. It is never displayed as a graded badge (pShownGrade withholds it until a
 * server reveal exists), and never contributes to any stat — it is a pure UI placeholder.
 */
const UNANSWERED_RESULT: GradeResult = {
  gradingClass: "auto_exact" as GradingClass,
  status: "ungraded",
  score: null,
  max: 1,
  answered: false,
};

/** Per-question submit outcome for the practice flow (authed: from server; demo: from local grade). */
export interface PracticeReveal {
  result: GradeResult;
  revealed?: AnswerReveal;
  attemptId?: string;
}

/**
 * The server's whole-exam grade, adapted for the result screen (authed mode). Derived from
 * submitExam's authoritative response ({ totalScore, maxScore, perQuestion }). score100 is the
 * server total normalized to 0..100 (same math the demo uses); correct/wrong count the graded
 * objective questions; perQuestion carries the reveals so the wrongbook can show correct answers.
 */
export interface ExamServerResult {
  score100: number;
  correct: number;
  wrong: number;
  perQuestion: { questionId: string; result: GradeResult; revealed?: AnswerReveal }[];
}

/** Loose mirror of the server SubmitExamResult (all fields optional so the action bundle assigns). */
interface SubmitExamResultLike {
  totalScore?: number;
  maxScore?: number;
  perQuestion?: {
    questionId: string;
    result: GradeResult;
    revealed?: AnswerRevealLike;
  }[];
}

/**
 * adaptExamSubmit — map the server's whole-exam grade into ExamServerResult for the result screen.
 * Normalizes totalScore/maxScore → 0..100 (Math.round, matching the demo), tallies correct/wrong
 * from the per-question statuses, and adapts each raw reveal → the friendly client shape by type.
 * Defensive: a malformed/empty payload yields a coherent 0/0/0 rather than throwing.
 */
export function adaptExamSubmit(
  raw: SubmitExamResultLike | undefined,
  typeById: (questionId: string) => string | undefined,
  partTypesById?: (questionId: string) => Record<string, string> | undefined,
): ExamServerResult {
  const per = raw?.perQuestion ?? [];
  let correct = 0;
  let wrong = 0;
  for (const p of per) {
    if (p.result?.status === "correct") correct++;
    else if (p.result?.status === "incorrect") wrong++;
  }
  const total = raw?.totalScore ?? 0;
  const max = raw?.maxScore ?? 0;
  const score100 = max > 0 ? Math.round((total / max) * 100) : 0;
  return {
    score100,
    correct,
    wrong,
    perQuestion: per.map((p) => ({
      questionId: p.questionId,
      result: p.result,
      revealed: adaptServerReveal(p.revealed, typeById(p.questionId), partTypesById?.(p.questionId)),
    })),
  };
}

// ---------- lightweight progress (client-side; server shape lives in prisma Progress) ----------
// Frozen kernel (lib/qbank/*) owns no progress type, so this is defined here. 3b-2 maps the
// server ProgressEntry onto this shape in initialData.
export interface ProgressLite {
  attempts?: number;
  correctCount?: number;
  wrongCount?: number;
  lastScore?: number | null;
  lastStatus?: GradeResult["status"];
  lastAt?: number; // epoch ms
  fav?: boolean;
  lastAnswer?: UserAnswer;
}

/**
 * The result of a submit attempt. DISCRIMINATED so the practice flow can tell a graded outcome from
 * a FAILURE (§B submit robustness): on `ok:false` we must NOT write a pReveal / open analysis — we
 * surface an inline pSubmitError and keep the answer editable. Demo always resolves `ok:true`
 * (local grade cannot fail); authed maps a server `{ok:false,error}` straight through here.
 */
export type SubmitOutcome =
  | { ok: true; result: GradeResult; revealed?: AnswerReveal; attemptId?: string }
  | { ok: false; error: { code: string; message?: string } };

// Dependency-injected submit (3b-2 passes the server action; standalone grades locally). Carries the
// practice `sessionId` (groups attempts + books studyMs) and a measured `durationMs` (the real time
// the question was on screen — the studyHours=0 fix was the client never sending it).
export type SubmitAttemptFn = (
  questionId: string,
  userAnswer: UserAnswer,
  opts?: { sessionId?: string; durationMs?: number },
) => Promise<SubmitOutcome>;

// ---------- server-action bundle (3b-2) ----------
// The authenticated app injects the real Server Actions here; standalone/demo passes nothing and
// every interaction falls back to the local (client-graded) behavior below. Each action returns
// the defineAction envelope { ok:true, data } | { ok:false, error } — the action layer in
// AppProvider adapts them; computeVals is NOT aware of any of this (it stays a pure derivation).
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message?: string } };

/**
 * A structurally-loose reveal shape matching the SERVER mapping's AnswerReveal (all fields
 * `unknown`), so the real Server Action's SubmitResult is assignable to the bundle. The adapter in
 * AppProvider narrows it to the client-side AnswerReveal (from answer-field) via a cast at the seam.
 */
export interface AnswerRevealLike {
  answer?: unknown;
  accept?: unknown;
  expected?: unknown;
  order?: unknown;
  pairs?: unknown;
  reference?: unknown;
  rubric?: unknown;
  blanks?: unknown;
  explanation?: unknown;
  keywords?: unknown;
  value?: unknown; // NumericQ answer (server sends `value`; client reveal wants `numericValue`)
  parts?: Record<string, unknown>;
}

/**
 * adaptServerReveal — the server→client reveal adapter at the client seam (§5.4).
 * The SERVER `revealKey` (lib/server/qbank/mapping) returns a RAW-field-name shape
 * (`answer`/`value`/`order`/…); the CLIENT `AnswerReveal` (answer-field) is a FRIENDLY shape
 * (`answers`/`boolean`/`numericValue`/…). This maps raw→friendly BY QUESTION TYPE so the graded
 * question renders its correct answer. Pure, defensive (every field optional), and demo-inert:
 * demo mode never routes through here (it builds the friendly shape locally via buildReveal).
 */
export function adaptServerReveal(
  raw: AnswerRevealLike | undefined,
  type: string | undefined,
  partTypes?: Record<string, string>,
): AnswerReveal | undefined {
  if (!raw) return undefined;
  const out: AnswerReveal = {};
  switch (type) {
    case "single_choice":
      out.answer = raw.answer as AnswerReveal["answer"];
      break;
    case "multiple_choice":
      out.answers = raw.answer as AnswerReveal["answers"];
      break;
    case "true_false":
      out.boolean = raw.answer as AnswerReveal["boolean"];
      break;
    case "numeric":
      out.numericValue = raw.value as AnswerReveal["numericValue"];
      break;
    case "code_output":
      out.expected = raw.expected as AnswerReveal["expected"];
      break;
    case "ordering":
      out.order = raw.order as AnswerReveal["order"];
      break;
    case "matching":
      out.pairs = raw.pairs as AnswerReveal["pairs"];
      break;
    case "fill_blank":
    case "cloze":
      out.blanks = raw.blanks as AnswerReveal["blanks"];
      break;
    case "short_answer":
    case "code_writing":
      out.reference = raw.reference as AnswerReveal["reference"];
      break;
    case "essay":
      out.reference = raw.reference as AnswerReveal["reference"];
      out.rubric = raw.rubric as AnswerReveal["rubric"];
      break;
    case "scenario": {
      const rawParts = (raw as { parts?: Record<string, AnswerRevealLike> }).parts;
      if (rawParts) {
        const parts: Record<string, AnswerReveal> = {};
        for (const [pid, rp] of Object.entries(rawParts)) parts[pid] = adaptServerReveal(rp, partTypes?.[pid]) ?? {};
        out.parts = parts;
      }
      break;
    }
    default:
      break;
  }
  // Always surface the explanation when present (drives the analysis block for every type).
  if (raw.explanation !== undefined) out.explanation = raw.explanation as AnswerReveal["explanation"];
  return out;
}

/**
 * A library list row as it crosses the action boundary (ListItem + this user's fav state, §7.4).
 * chapter/section (V2) are the joined question's data-driven browse-tree columns (null when the
 * imported question left them unset → 未分类/综合); the wrongbook/favorites screens render the tree
 * label and filter/launch review sessions by chapter. Optional so the demo ListItem arrays still fit.
 */
export interface LibraryListItem extends ListItem {
  fav: boolean;
  chapter?: string | null;
  section?: string | null;
}

/** The practice-filter snapshot the client sends the server (ASCII keys, §7.3). */
export interface PracticeFilterShape {
  types?: QuestionType[];
  difficulty?: Difficulty;
  tags?: string[];
  bankId?: string;
}

/** Loose mirror of the server ExamStateResult (all deep fields loose so the action bundle assigns). */
export interface ExamStateLike {
  sessionId: string;
  status: string;
  questions: unknown[];
  remainingSec: number;
  durationSec: number;
  answers: Record<string, UserAnswer>;
}

/**
 * SessionScope (V2 unified hub) — the data-driven target a launched session runs over. Mirrors the
 * server SessionScope (lib/validation/exam) 1:1; defined LOCALLY here (not imported) to keep the
 * client bundle free of the server validation module, matching this file's discipline for
 * PublicQuestion / ExamStateLike. chapter/section are plain content strings (the browse tree), NOT
 * enums; wrong/favorites optionally narrow to a single chapter. EXPORTED so the screens stage can
 * type scope builders if it constructs scopes directly (the hub vals also expose pre-bound launchers).
 */
export type SessionScope =
  | { kind: "all" }
  | { kind: "chapter"; chapter: string }
  | { kind: "section"; chapter: string; section: string }
  | { kind: "wrong"; chapter?: string }
  | { kind: "favorites"; chapter?: string };

/** Loose mirror of the server StartSessionResult (questions loose so the action bundle assigns). */
export interface StartSessionResultLike {
  sessionId: string;
  mode: "practice" | "exam";
  questionIds: string[];
  questions: unknown[];
  durationSec: number | null;
  remainingSec: number | null;
  scopeLabel: string;
  total: number;
}

/** Loose mirror of the server SessionStateResult (rehydrate a frozen unified session by id). */
export interface SessionStateResultLike {
  sessionId: string;
  mode: "practice" | "exam";
  status: string;
  questionIds: string[];
  questions: unknown[];
  answers: Record<string, UserAnswer>;
  remainingSec: number | null;
  durationSec: number | null;
  scopeLabel: string;
}

/** The UI-preference patch the client PATCHes to savePreferencesAction (every field optional, §F). */
export interface PreferencesPatch {
  layout?: "sidebar" | "top";
  appTheme?: "light" | "dark";
  sbTheme?: "light" | "dark";
  dailyGoal?: number;
}

/** Loose mirror of the server UserPrefs (savePreferences returns the merged authoritative row). */
export interface UserPrefsLike {
  layout?: string;
  appTheme?: string;
  sbTheme?: string;
  dailyGoal?: number;
}

export interface AppActionsBundle {
  submitAttempt?: (input: {
    questionId: string;
    sessionId?: string;
    userAnswer: UserAnswer;
    durationMs?: number;
  }) => Promise<ActionResult<{ result: GradeResult; revealed: AnswerRevealLike; attemptId: string }>>;
  selfGradeAttempt?: (input: {
    attemptId: string;
    selfScore: 0 | 0.5 | 1;
    rubricTicks?: number[];
  }) => Promise<ActionResult<{ result: GradeResult }>>;
  toggleFavorite?: (input: { questionId: string }) => Promise<ActionResult<{ fav: boolean }>>;
  // `chapter` (V2) narrows wrongbook/favorites to one browse-tree chapter (server-side relation filter).
  listWrongbook?: (input: { cursor?: string; mastered?: boolean; chapter?: string }) => Promise<
    ActionResult<{ items: LibraryListItem[]; nextCursor: string | null }>
  >;
  listFavorites?: (input: { cursor?: string; chapter?: string }) => Promise<
    ActionResult<{ items: LibraryListItem[]; nextCursor: string | null }>
  >;
  listRecent?: (input: { cursor?: string }) => Promise<
    ActionResult<{ items: LibraryListItem[]; nextCursor: string | null }>
  >;
  masterWrong?: (input: { questionId: string }) => Promise<ActionResult<{ ok: true }>>;
  /**
   * Practice BATCH read (§5.4, HARD break from the old single-question shape). Ad-hoc `filters` drive
   * the server query; `cursor` pages forward; `take` bounds the page. Returns key-STRIPPED questions.
   */
  getQuestionForPractice?: (input: {
    sessionId?: string;
    filters?: PracticeFilterShape;
    cursor?: string;
    take?: number;
  }) => Promise<ActionResult<{ questions: unknown[]; nextCursor: string | null }>>;
  /** Create a practice StudySession (its id groups submits + books studyMs). Currently filters-only. */
  startPractice?: (input: { filters?: PracticeFilterShape }) => Promise<
    ActionResult<{ sessionId: string; firstQuestion: unknown; questionMeta: unknown }>
  >;
  startExam?: (input: { bankId?: string; count: number }) => Promise<
    ActionResult<{
      sessionId: string;
      questionIds: string[];
      questions: unknown[];
      durationSec: number;
      remainingSec: number;
    }>
  >;
  saveExamAnswer?: (input: {
    sessionId: string;
    questionId: string;
    userAnswer: UserAnswer;
    remainingSec: number;
  }) => Promise<ActionResult<{ ok: true }>>;
  submitExam?: (input: { sessionId: string }) => Promise<ActionResult<SubmitExamResultLike>>;
  /** No-arg (`{}`) resumes the LATEST ACTIVE exam (or null); with `{sessionId}` loads that session. */
  getExamState?: (input: { sessionId?: string }) => Promise<ActionResult<ExamStateLike | null>>;
  /**
   * startSession (V2 unified hub) — launch a practice/exam run over a data-driven SCOPE (all /
   * chapter / section / wrong / favorites). The server SHUFFLES + TYPE-CLUSTERS + FREEZES the set and
   * returns the key-STRIPPED questions in the frozen order (practice: null timers; exam: countdown).
   */
  startSession?: (input: {
    mode: "practice" | "exam";
    scope: SessionScope;
    count?: number;
  }) => Promise<ActionResult<StartSessionResultLike>>;
  /** Rehydrate a frozen unified session by id (ownership-scoped) — powers exam refresh-resume. */
  getSessionState?: (input: { sessionId: string }) => Promise<ActionResult<SessionStateResultLike | null>>;
  /** Persist a UI-preference patch (layout / themes / daily goal) to the user's row (§F). */
  savePreferences?: (input: PreferencesPatch) => Promise<ActionResult<UserPrefsLike>>;
}

/**
 * Client mirror of the server's statsService.StatsReport (§7.2). Defined here (not imported) so no
 * server runtime is pulled into the client bundle — same discipline as PublicQuestion. app/page.tsx
 * fetches statsService.report() and injects it as initialData.stats; it is structurally assignable
 * to this shape. Every field is present on the server report; the ? markers only guard demo mode.
 */
export interface StatsData {
  accuracyTrend?: {
    day: string;
    attempts: number;
    correct: number;
    objectiveAttempts: number;
    accuracyPct: number;
  }[];
  totalAttempts?: number;
  correctCount?: number;
  objectiveAttempts?: number;
  accuracyPct?: number;
  studyMinutes?: number;
  streak?: number;
  todayCount?: number;
  byDifficulty?: { difficulty: string; count: number; accuracyPct: number }[];
  /** Objective accuracy by question TYPE (ASCII enum key), §7.2 — drives the stats 题型表现 bars. */
  typeMastery?: { type: string; count: number; accuracyPct: number }[];
  categoryMastery?: { category: string; count: number; accuracyPct: number }[];
  weakestCategories?: string[];
}

/** A category overview row: the first-tag label (tagsFlat[0]) + its published-question count. */
export interface CategoryOverviewItem {
  name: string;
  count: number;
}

/** A tag facet row for the practice filter chips: slug, display name, published-question count. */
export interface TagFacet {
  slug: string;
  name: string;
  count: number;
}

/**
 * Client mirror of the server BrowseStructure (§V2 hub). The data-driven 章节→小节 tree the merged
 * 题库 hub renders. Defined locally (not imported) — same no-server-runtime discipline as StatsData.
 * app/app/page.tsx fetches questionService.browseStructure() and injects it as initialData.browse.
 */
export interface BrowseSectionNode {
  section: string;
  count: number;
}
export interface BrowseChapterNode {
  chapter: string;
  count: number;
  sections: BrowseSectionNode[];
}
export interface BrowseTree {
  chapters: BrowseChapterNode[];
  total: number;
}

/** Client mirror of the server UserPrefs (§F) — injected as initialData.preferences (authed). */
export interface PreferencesData {
  layout: "sidebar" | "top";
  appTheme: "light" | "dark";
  sbTheme: "light" | "dark";
  dailyGoal: number;
}

export interface InitialData {
  // role (V2) drives the admin-only avatar-dropdown entry (isAdmin val, §G).
  user?: { name?: string; email?: string; role?: string } | null;
  entitlement?: { tier?: string } | null;
  /**
   * Real stats (Phase 6, §7.2). Present in AUTHED mode (from statsService.report); absent in DEMO
   * mode, where computeVals falls back to the original hardcoded demo numbers so /demo is unchanged.
   */
  stats?: StatsData | null;
  /**
   * The practice bank. DEMO passes full QuestionRecord[] (local grade). AUTHED passes server-
   * STRIPPED records (PublicQuestion — no answer key / explanation, §5.4), which are a structural
   * subset assignable here. The `serverSubmit` flag (derived from actions.submitAttempt) tells
   * computeVals which mode it is in, so it never calls grade() on a stripped record. In AUTHED mode
   * this is only the first-paint batch — the practice loop refetches per the live filters on entry.
   */
  bank?: PracticeQuestion[];
  progress?: Record<string, ProgressLite>;
  examBank?: PracticeQuestion[];
  /** Authoritative published-question total (questionService.countPublished) — the real 题库总数. */
  bankTotal?: number;
  /** Category overview (questionService.categoryOverview) for the home 分类练习进度 cards. */
  categories?: CategoryOverviewItem[];
  /** Published-question tag facet (listTags) — the real source for the practice filter chips (§7.3). */
  tags?: TagFacet[];
  /** First page of the user's recent practice (libraryService.listRecent) for the home 最近练习 card. */
  recentItems?: LibraryListItem[];
  /** Data-driven browse tree (questionService.browseStructure) for the merged 题库 hub (V2, §D). */
  browse?: BrowseTree | null;
  /** Persisted UI prefs (prefsService.getPreferences) — seed layout/themes/goal in authed mode (§F). */
  preferences?: PreferencesData | null;
}

export type MergeMode = "merge" | "replace";

export type ScreenKey =
  | "home"
  | "practice"
  | "interview"
  | "wrongbook"
  | "favorites"
  | "stats"
  | "qbank"
  | "settings"
  // V2: the transient UNIFIED answering screen (both 刷题 practice + 模拟面试 exam run here). No nav
  // routes to it — it is reached by launching a scope from the hub / wrongbook / favorites, or by
  // resuming an active exam. "practice"/"interview" stay VALID so the pre-V2 screen files still compile.
  | "session";

/**
 * SessionState (V2) — a launched UNIFIED session (the core of the practice/exam merge). Populated by
 * startSessionFlow from a StartSessionResult (or rehydrated by getSessionState on exam resume). The
 * frozen `questions` are migrated to PracticeQuestion (authed → server-STRIPPED, no key/explanation);
 * grading is ALWAYS server-authoritative (session is authed-only — demo never launches one).
 *   PRACTICE: no timer; per-question submit stores a reveal in `reveals` (immediate 判分+解析); a
 *     submitted question LOCKS; `submitted` flips true on 本轮完成.
 *   EXAM: countdown from `remainingSec` (server baseline, ticked locally, auto-submit at 0);
 *     answers saved per-change; `submitted` flips on 交卷; the whole-exam grade lands in `serverResult`.
 */
export interface SessionState {
  sessionId: string;
  mode: "practice" | "exam";
  /** Chinese scope label (e.g. "JavaScript · 作用域与闭包" / "全部题目" / "错题复习 · CSS"). */
  scopeLabel: string;
  /** The frozen questions, migrated, in the locked (shuffled + type-clustered) order. */
  questions: PracticeQuestion[];
  questionIds: string[];
  /** 0-based pointer into the frozen set. */
  index: number;
  /** User answers keyed by POSITION (0-based) in the frozen set. */
  answers: Record<number, UserAnswer>;
  /** Per-question server grade+reveal keyed by questionId (PRACTICE only; exam grades at submit). */
  reveals: Record<string, PracticeReveal>;
  /** Positions the user flagged (answer-card marker). */
  marked: number[];
  /** EXAM: server-baseline seconds remaining (ticked locally); null for practice (no timer). */
  remainingSec: number | null;
  durationSec: number | null;
  /** PRACTICE: 本轮完成 pressed/all-answered summary. EXAM: 交卷 pressed. */
  submitted: boolean;
  /** EXAM: the adapted whole-exam grade (score100/correct/wrong/perQuestion); null until it lands. */
  serverResult: ExamServerResult | null;
  /** A per-question (practice) / whole-exam (exam) submit failure — inline retry, never a fake grade. */
  submitError: { code: string; message: string } | null;
  /** A submit is in flight (per-question for practice; the whole exam for exam). */
  submitting: boolean;
  /** EXAM: guards the at-0 auto-submit so it fires exactly once. */
  autoSubmitted: boolean;
  status: "active" | "submitted";
}

export interface AppState {
  screen: ScreenKey;
  // data model
  user: { name?: string; email?: string } | null;
  entitlement: { tier?: string } | null;
  /** Real stats (§7.2) in authed mode; null in demo mode (→ computeVals uses the demo fallbacks). */
  stats: StatsData | null;
  /**
   * The practice queue. DEMO: the full sample bank (filtered + modulo-cycled locally). AUTHED: the
   * APPEND-ONLY server-filtered queue (seeded from the injected batch, extended by cursor paging).
   */
  bank: PracticeQuestion[];
  progress: Record<string, ProgressLite>;
  /** Authoritative published-question total (authed) or null (demo → screens keep their literal). */
  bankTotal: number | null;
  /** Category overview + tag facet from the server (authed); empty in demo. */
  categories: CategoryOverviewItem[];
  tags: TagFacet[];
  /** True iff the session user is an admin (initialData.user.role === "admin") — avatar menu (§G). */
  isAdmin: boolean;
  /** Data-driven browse tree for the merged 题库 hub (initialData.browse; null in demo → empty tree). */
  browse: BrowseTree | null;
  // ---- V2 unified session (the practice/exam merge; authed-only) ----
  /** The active launched session, or null when none is running (on the hub / anywhere else). */
  session: SessionState | null;
  /** A hub/wrongbook/favorites launch (startSession) is in flight (before `session` is set). */
  sessionLaunching: boolean;
  /** The last launch failed (empty scope / entitlement / network) — inline error on the launcher. */
  sessionLaunchError: { code: string; message: string } | null;
  /** An exam refresh-resume (getSessionState) is in flight (mount rehydrate). */
  sessionResuming: boolean;
  // practice
  pIndex: number;
  pAnswers: Record<string, UserAnswer>;
  /**
   * Per-question submit outcome (§5.4). AUTHED: filled from the server submit response (result +
   * revealed key/explanation + attemptId). DEMO: filled from a local grade() + buildReveal() on the
   * full record. Absence of an entry means "not yet submitted" → the question renders ungraded.
   */
  pReveal: Record<string, PracticeReveal>;
  pFav: Record<string, boolean>;
  pShowAnalysis: boolean;
  /** Authed practice session (groups submits + books studyMs); `pSessionStarting` guards start-once. */
  pSessionId: string | null;
  pSessionStarting: boolean;
  /** Cursor paging (authed): next-page cursor, exhaustion flag, and an in-flight guard. */
  pCursor: string | null;
  pNoMore: boolean;
  pLoadingBatch: boolean;
  /** Submits landed THIS session (drives the honest daily-goal progress alongside stats.todayCount). */
  pAnsweredCount: number;
  /** Submit robustness (§B): a submit is in flight / the last submit FAILED (inline retry, no reveal). */
  pSubmitting: boolean;
  pSubmitError: { code: string; message: string } | null;
  // exam
  examBank: PracticeQuestion[];
  examSessionId: string | null; // set only when a real server exam session is started (3b-2+)
  examAnswers: Record<number, UserAnswer>;
  examRemain: number | null;
  /** Frozen exam duration (server durationSec, authed); null in demo / before a session exists. */
  examDurationSec: number | null;
  examIndex: number;
  examMarked: number[];
  examSubmitted: boolean;
  /** Requested question count for the NEXT exam (authed; usable only before a session exists). */
  examCount: number;
  /**
   * Authed pre-start state: no active session was found to resume, and we are WAITING for the user
   * to pick a count and press 开始考试 (examStart) — auto-starting here would render the count
   * selector permanently unreachable (a session would always exist by the time it painted).
   */
  examAwaitingStart: boolean;
  /**
   * Server exam lifecycle (authed mode only; demo leaves these inert). `examStarting`/`examResuming`
   * guard the start-once / resume-once effect; `examStartError` surfaces a start failure (never a
   * fake 0/100); `examAutoSubmitted` guards the at-0 auto-submit; `examSubmitError` surfaces a submit
   * failure (screen offers 重试); `examServer` holds the AUTHORITATIVE submit result. Demo keeps local.
   */
  examStarting: boolean;
  examResuming: boolean;
  examStartError: boolean;
  examAutoSubmitted: boolean;
  examSubmitError: boolean;
  examServer: ExamServerResult | null;
  // wrongbook / favorites / recent (authed: real server lists; demo: bank∩progress projection)
  wbTab: string;
  wbPage: number;
  wbFav: Record<string, boolean>;
  /** Authed server-list state: the fetched rows, the paging cursor, load/err flags, loaded-tab guard. */
  wbItems: LibraryListItem[];
  wbCursor: string | null;
  wbLoading: boolean;
  wbError: boolean;
  wbLoadedTab: string | null;
  /** V2 chapter filter (wrongbook/favorites tabs): null = 全部; a chapter narrows the list + review scope. */
  wbChapter: string | null;
  /** Home 最近练习 card rows (authed: listRecent; seeded from initialData.recentItems). */
  homeRecent: LibraryListItem[];
  // settings
  setGoal: number;
  // practice filters (ASCII keys)
  pfTypes: Record<string, boolean>;
  pfDiff: string;
  pfTags: Record<string, boolean>;
  pfCompany: boolean;
  // qbank screen
  qbankReport: ImportReport | null;
  qbankMergeMode: MergeMode;
  qbankPasteText: string;
  qbankNotice: string;
  // shell / theme
  layout: "sidebar" | "top";
  sbTheme: ThemeMode;
  appTheme: ThemeMode;
  primaryColor: string[];
  showArt: boolean;
  mobileNav: boolean;
  collapsed: boolean;
}

// ASCII default filter (§7.3): objective 8 + subjective essay/short (default all-selected).
const INITIAL_PF_TYPES: Record<string, boolean> = {
  single_choice: true,
  multiple_choice: true,
  true_false: true,
  fill_blank: true,
  numeric: true,
  code_output: true,
  ordering: true,
  matching: true,
  short_answer: true,
  essay: true,
};

// Practice cursor-page size (server clamps to 1..50). Big enough to feel continuous, small enough
// that a filter change refetches cheaply.
const PRACTICE_BATCH = 20;
// DEMO-only exam countdown default (the prototype's local timer; authed uses the server clock).
const DEMO_EXAM_SEC = 5316;

const INITIAL: AppState = {
  screen: "home",
  user: null,
  entitlement: null,
  stats: null,
  bank: [],
  progress: {},
  bankTotal: null,
  categories: [],
  tags: [],
  isAdmin: false,
  browse: null,
  session: null,
  sessionLaunching: false,
  sessionLaunchError: null,
  sessionResuming: false,
  pIndex: 0,
  pAnswers: {},
  pReveal: {},
  pFav: {},
  pShowAnalysis: false,
  pSessionId: null,
  pSessionStarting: false,
  pCursor: null,
  pNoMore: false,
  pLoadingBatch: false,
  pAnsweredCount: 0,
  pSubmitting: false,
  pSubmitError: null,
  examBank: [],
  examSessionId: null,
  examAnswers: {},
  examRemain: null,
  examDurationSec: null,
  examIndex: 0,
  examMarked: [],
  examSubmitted: false,
  examCount: 30,
  examAwaitingStart: false,
  examStarting: false,
  examResuming: false,
  examStartError: false,
  examAutoSubmitted: false,
  examSubmitError: false,
  examServer: null,
  wbTab: "错题本",
  wbPage: 1,
  wbFav: {},
  wbItems: [],
  wbCursor: null,
  wbLoading: false,
  wbError: false,
  wbLoadedTab: null,
  wbChapter: null,
  homeRecent: [],
  setGoal: 30,
  pfTypes: { ...INITIAL_PF_TYPES },
  pfDiff: "medium",
  pfTags: {},
  pfCompany: false,
  qbankReport: null,
  qbankMergeMode: "merge",
  qbankPasteText: "",
  qbankNotice: "",
  layout: "sidebar",
  sbTheme: "dark",
  appTheme: "light",
  primaryColor: ["#2D5BFF", "#1E45E0", "#4E74FF", "#EAEEFF"],
  showArt: true,
  mobileNav: false,
  collapsed: false,
};

interface Actions {
  go(k: ScreenKey): void;
  toggleLayout(): void;
  toggleTheme(): void;
  toggleAppTheme(): void;
  toggleCollapse(): void;
  openNav(): void;
  closeNav(): void;
  // practice
  pAnswer(a: UserAnswer): void;
  pSubmit(): void;
  pSelfGrade(score: 0 | 0.5 | 1, ticks?: number[]): void;
  pMove(id: string, dir: -1 | 1): void;
  pToggleFav(id: string): void;
  pNext(): void;
  pPrev(): void;
  pRestart(): void;
  pToggleAna(): void;
  // exam
  examAnswer(a: UserAnswer): void;
  examGo(i: number): void;
  examStep(d: number): void;
  examMark(): void;
  examSubmit(): void;
  examRetrySubmit(): void;
  examReset(): void;
  examStart(): void;
  setExamCount(n: number): void;
  // V2 unified session (the practice/exam merge)
  sessionLaunch(scope: SessionScope, mode: "practice" | "exam"): void;
  sessionAnswer(a: UserAnswer): void;
  sessionSubmit(): void; // practice per-question submit (server-authoritative grade)
  sessionSelfGrade(score: 0 | 0.5 | 1, ticks?: number[]): void;
  sessionNext(): void;
  sessionPrev(): void;
  sessionGoto(i: number): void;
  sessionMark(): void;
  sessionFinish(): void; // practice: show 本轮完成 summary
  sessionSubmitExam(): void; // exam: 交卷 (submit-all)
  sessionRetrySubmit(): void; // exam: retry a failed submit (idempotent)
  sessionExit(): void; // leave the session, back to the hub
  // wrongbook / favorites / recent
  wbSetTab(t: string): void;
  wbGo(n: number): void;
  wbLoadMore(): void;
  wbSetChapter(chapter: string | null): void; // V2 chapter filter (refetches the list)
  wbStartReview(mode: "practice" | "exam"): void; // launch a wrong/favorites review session
  toggleFav(id: string): void;
  wbMaster(id: string): void;
  // filters (ASCII)
  toggleType(t: QuestionType): void;
  setDiff(d: string): void;
  toggleTag(t: string): void;
  toggleCompany(): void;
  resetFilters(): void;
  // settings
  setGoal(n: number): void;
  updateUserName(name: string): void;
  // qbank
  importPaste(text: string): void;
  importFile(file: File): void;
  confirmImport(): void;
  exportBank(): void;
  downloadSample(): void;
  downloadSchema(): void;
  setMergeMode(m: MergeMode): void;
}

// ---------- helpers ----------
const stem = (q: PracticeQuestion): string => resolveLocale(q.stem);

/** Project a question (+ progress) into the legacy ListItem shape the screens consume. */
function toListItem(q: PracticeQuestion, p?: ProgressLite): ListItem {
  return {
    id: q.id,
    type: TYPE_LABEL[q.type],
    diff: DIFF_LABEL[q.difficulty],
    q: stem(q),
    tags: q.tags,
    wrong: p?.wrongCount ?? 0,
    last: p?.lastAt ? fmtDate(p.lastAt) : "",
  };
}

/**
 * Standalone fallback progress: when no server progress is injected, synthesize plausible
 * per-question state from the bank so wrongbook/favorites/recent/stats are not empty.
 * Deterministic (id-hash based) so the demo is stable across renders.
 */
function synthProgress(bank: PracticeQuestion[]): Record<string, ProgressLite> {
  const out: Record<string, ProgressLite> = {};
  const now = Date.now();
  bank.forEach((q, i) => {
    // hash from id for stable pseudo-values
    let h = 0;
    for (let c = 0; c < q.id.length; c++) h = (h * 31 + q.id.charCodeAt(c)) >>> 0;
    const attempts = 1 + (h % 5);
    const wrong = h % 3; // 0,1,2
    const lastScore = wrong === 0 ? 1 : wrong === 1 ? 0.5 : 0;
    out[q.id] = {
      attempts,
      correctCount: wrong === 0 ? attempts : Math.max(0, attempts - wrong),
      wrongCount: wrong,
      lastScore,
      lastStatus: wrong === 0 ? "correct" : wrong === 1 ? "partial" : "incorrect",
      lastAt: now - i * 3600_000 - (h % 48) * 3600_000,
      fav: i % 4 === 0,
    };
  });
  return out;
}

/**
 * Numeric/text-answer analysis strings for the practice analysis block (correct answer display).
 * `reveal` (when present, i.e. AFTER an authed server submit) is the AUTHORITATIVE key source; the
 * record's own key fields are read ONLY in demo mode (reveal===undefined and the full record still
 * carries them). In authed mode the record is stripped, so we NEVER read q.answer/q.order/etc. —
 * we read the reveal, and fall back to "" (blank) if a field is absent (pre-reveal callers gate on
 * `submitted` so this is only reached post-submit anyway).
 */
function correctAnswerText(q: PracticeQuestion, reveal?: AnswerReveal): string {
  // Structural helpers (item/side text) come from the record — those fields survive stripping.
  const itemText = (id: string): string => {
    if (q.type !== "ordering") return id;
    const it = q.items.find((x) => x.id === id);
    return it ? resolveLocale(it.t) : id;
  };
  const sideText = (side: "left" | "right", id: string): string => {
    if (q.type !== "matching") return id;
    const it = q[side].find((x) => x.id === id);
    return it ? resolveLocale(it.t) : id;
  };

  // In authed mode `q` is stripped (no key fields); the `reveal?.x ??` arm short-circuits before the
  // record read. The per-branch casts below only materialize the full-leaf type for the DEMO read,
  // where the record genuinely carries the key. (Type-safe: the cast is unused when reveal is set.)
  switch (q.type) {
    case "single_choice":
      return (reveal?.answer ?? (q as SingleChoiceQ).answer) ?? "";
    case "multiple_choice":
      return (reveal?.answers ?? (q as MultipleChoiceQ).answer)?.join("、") ?? "";
    case "true_false": {
      const b = reveal?.boolean ?? (q as TrueFalseQ).answer;
      return b === undefined ? "" : b ? "对" : "错";
    }
    case "numeric": {
      const nq = q as NumericQ;
      const v = reveal?.numericValue ?? nq.value;
      const u = reveal?.numericUnit ?? nq.unit;
      return v === undefined ? "" : String(v) + (u ? ` ${u}` : "");
    }
    case "code_output":
      return (reveal?.expected ?? (q as CodeOutputQ).expected) ?? "";
    case "fill_blank": {
      // reveal.blanks is Accept[][] (per-blank accept lists); demo reads q.blanks[].accept.
      // A stripped record keeps the blank SHELLS but drops each `accept` (undefined), so the
      // per-blank fallback MUST default a missing accept to [] — otherwise the inner .map throws
      // (the whole-app crash from the audit, blocker #1). Guard the outer accepts too.
      const perBlank: Accept[][] =
        reveal?.blanks ?? (q as FillBlankQ).blanks.map((b) => b.accept ?? []);
      return perBlank
        .map((accepts) => (accepts ?? []).map((a) => ("text" in a ? a.text : `/${a.regex}/`)).join("/"))
        .join(" ; ");
    }
    case "ordering": {
      const order = reveal?.order ?? (q as OrderingQ).order;
      return order ? order.map(itemText).join(" → ") : "";
    }
    case "matching": {
      const pairs = reveal?.pairs ?? (q as MatchingQ).pairs;
      return pairs
        ? pairs.map(([l, r]) => `${sideText("left", l)}↔${sideText("right", r)}`).join(" ; ")
        : "";
    }
    case "short_answer":
    case "essay":
    case "code_writing":
      return "参考答案见解析";
    default:
      return "";
  }
}

/** A user-answer summary for the analysis block ("your answer"). Reads only structural fields. */
function userAnswerText(q: PracticeQuestion, a: UserAnswer | undefined): string {
  if (!a) return "未作答";
  switch (a.kind) {
    case "choice":
      return a.value;
    case "multi":
      return a.value.length ? a.value.join("、") : "未作答";
    case "boolean":
      return a.value ? "对" : "错";
    case "blanks":
      return a.values.filter((v) => v).join(" ; ") || "未作答";
    case "numeric":
      return a.raw || "未作答";
    case "text":
      return a.value || "未作答";
    case "order":
      return a.order
        .map((id) => {
          if (q.type !== "ordering") return id;
          const it = q.items.find((x) => x.id === id);
          return it ? resolveLocale(it.t) : id;
        })
        .join(" → ");
    case "pairs":
      return a.pairs.length ? `${a.pairs.length} 对` : "未作答";
    case "self":
      return a.selfScore === 1 ? "对" : a.selfScore === 0.5 ? "半对" : "错";
    case "composite":
      return "多问作答";
    default:
      return "未作答";
  }
}

/**
 * Explanation → the legacy `ana` shape (points/pitfalls/related/ai/explain) the practice screen
 * reads. DEMO reads q.explanation (present on the full record). AUTHED reads reveal.explanation
 * (the stripped record has no explanation — it arrives only in the post-submit server reveal, §5.4).
 */
function toAna(
  q: PracticeQuestion,
  reveal?: AnswerReveal,
): { explain: string; points: string[]; pitfalls: string[]; related: string[]; ai: string } {
  // Demo: the full record carries `explanation`; the stripped arm omits it, so cast for the read
  // (undefined at runtime in authed mode → the reveal arm supplies it post-submit).
  const e = reveal?.explanation ?? (q as QuestionRecord).explanation;
  return {
    explain: e?.explain ?? "暂无解析。",
    points: e?.points ?? [],
    pitfalls: e?.pitfalls ?? [],
    related: e?.related ?? [],
    ai: e?.ai ?? "暂无 AI 讲解。",
  };
}

function bubbleStyle(state: AppState, i: number, isAnswered: boolean): CSSProperties {
  const base: CSSProperties = {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono',ui-monospace,monospace",
    fontWeight: 600,
    cursor: "pointer",
    boxSizing: "border-box",
    transition: "all .12s",
  };
  if (i === state.examIndex)
    return { ...base, background: "var(--pri)", color: "#fff", border: "1.5px solid var(--pri)", boxShadow: "0 0 0 3px var(--pri-w)" };
  if (state.examMarked.includes(i))
    return { ...base, background: "#FDF3E7", color: "#B7791F", border: "1.5px solid #F5B45A" };
  if (isAnswered)
    return { ...base, background: "var(--pri-w)", color: "var(--pri-a)", border: "1.5px solid var(--pri-w2)" };
  return { ...base, background: "var(--surface)", color: "#98A2B3", border: "1px solid var(--line)" };
}

// ---------- filtering (sampling layer) ----------
function filterBank(bank: PracticeQuestion[], state: AppState): PracticeQuestion[] {
  const activeTags = Object.keys(state.pfTags).filter((t) => state.pfTags[t]);
  return bank.filter((q) => {
    if (!state.pfTypes[q.type]) return false;
    if (state.pfDiff && state.pfDiff !== "all" && q.difficulty !== state.pfDiff) return false;
    if (activeTags.length > 0 && !q.tags.some((t) => activeTags.includes(t))) return false;
    if (state.pfCompany && !q.source?.company) return false;
    return true;
  });
}

/**
 * currentPractice — the single source of truth for "which practice question is on screen" (used by
 * BOTH computeVals and the practice actions so they can never disagree). Dual-mode (§B):
 *   AUTHED (serverSubmit): the queue is the SERVER-filtered `state.bank`; the pointer is `pIndex`
 *     directly — NO modulo, NO local re-filter (filters already drove the fetch). Past the end → no q.
 *   DEMO: the queue is filterBank(bank) and the pointer wraps by modulo, exactly as the prototype did.
 * Returns the question, the queue length, and the 0-based position within the queue.
 */
function currentPractice(
  state: AppState,
  serverSubmit: boolean,
): { q: PracticeQuestion | undefined; queueLen: number; pos: number } {
  if (serverSubmit) {
    const queue = state.bank;
    const q = state.pIndex >= 0 && state.pIndex < queue.length ? queue[state.pIndex] : undefined;
    return { q, queueLen: queue.length, pos: state.pIndex };
  }
  const queue = filterBank(state.bank, state);
  if (queue.length === 0) return { q: undefined, queueLen: 0, pos: 0 };
  const pos = ((state.pIndex % queue.length) + queue.length) % queue.length;
  return { q: queue[pos], queueLen: queue.length, pos };
}

/**
 * buildPracticeFilters — map the client filter state (ASCII keys) → the server PracticeFilters shape
 * (§7.3). Only the SELECTED types are sent; difficulty is sent unless it is "all"; active tag slugs
 * are sent. pfCompany has NO server support (no bankId/company filter here) so it is intentionally
 * dropped — it stays a demo-only local filter.
 */
function buildPracticeFilters(state: AppState): PracticeFilterShape {
  const filters: PracticeFilterShape = {};
  const types = (Object.keys(state.pfTypes) as QuestionType[]).filter((t) => state.pfTypes[t]);
  if (types.length > 0) filters.types = types;
  if (state.pfDiff && state.pfDiff !== "all") filters.difficulty = state.pfDiff as Difficulty;
  const tags = Object.keys(state.pfTags).filter((t) => state.pfTags[t]);
  if (tags.length > 0) filters.tags = tags;
  return filters;
}

/**
 * mapErrorToMessage — action error `code` → a user-facing Chinese message for the inline submit
 * error (§B). PAYMENT_REQUIRED keeps the server sub-code (QUOTA_EXCEEDED/…) in the returned message
 * AND is surfaced via pSubmitError.code so a screen can route it to the <Upsell> paywall component.
 */
function mapErrorToMessage(code: string, serverMsg?: string): string {
  switch (code) {
    case "RATE_LIMITED":
      return "操作过于频繁，请稍后再试。";
    case "VALIDATION":
      return "答案格式有误，请检查后重试。";
    case "PAYMENT_REQUIRED":
      return serverMsg === "QUOTA_EXCEEDED"
        ? "今日免费额度已用完，升级 Plus 解锁无限刷题。"
        : "该功能需升级后解锁。";
    default:
      return "提交失败，请重试。";
  }
}

/** Set a library row's fav flag by id (immutable). */
function setFavById(items: LibraryListItem[], id: string, fav: boolean): LibraryListItem[] {
  return items.map((it) => (it.id === id ? { ...it, fav } : it));
}

/** Flip a library row's fav flag by id (immutable) — the optimistic toggle before the server confirms. */
function flipFavById(items: LibraryListItem[], id: string): LibraryListItem[] {
  return items.map((it) => (it.id === id ? { ...it, fav: !it.fav } : it));
}

/** DEMO tag-facet fallback: aggregate the loaded bank's own tags (by frequency, top 12). */
function aggregateBankTags(bank: PracticeQuestion[]): string[] {
  const counts = new Map<string, number>();
  for (const q of bank) for (const t of q.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([t]) => t);
}

// ---------- chip styling for qbank report rows ----------
function issueChip(level: "error" | "warning"): CSSProperties {
  const map = { error: { c: "#D63C31", bg: "rgba(240,68,56,.09)" }, warning: { c: "#B7791F", bg: "rgba(247,144,9,.10)" } };
  const s = map[level];
  return {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid var(--line)",
    background: s.bg,
    color: s.c,
    borderRadius: "6px",
    padding: "2px 8px",
    fontSize: "11.5px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

// ---------- stats derivations (§7.2 real data → home / stats / sidebar) ----------
// These build the numbers the three screens render. When state.stats is present (authed mode) the
// values are real; when absent (demo mode) the screens keep their original hardcoded fallbacks —
// see StatsVals fields, each of which is only consumed when `hasStats` is true.

/** A single trend point mapped for an SVG polyline (accuracy line). */
interface TrendPoint {
  /** x,y in the shared 640×224 viewBox both charts use. */
  x: number;
  y: number;
  /** the day label (M/D) under the point. */
  label: string;
  accuracyPct: number;
}

/**
 * buildAccuracyTrendPoints — map real accuracyTrend rows into viewBox coordinates for the stats
 * screen's "正确率趋势" SVG. y maps accuracyPct 0..100 → [188..18] (the chart's plot band). x spreads
 * the points across [62..620]. Returns [] when there is no trend (screen keeps its demo shape).
 * We take the last `max` points so the chart stays readable.
 */
function buildAccuracyTrendPoints(
  trend: StatsData["accuracyTrend"],
  opts: { x0: number; x1: number; max: number },
): TrendPoint[] {
  if (!trend || trend.length === 0) return [];
  const pts = trend.slice(-opts.max);
  const n = pts.length;
  const yTop = 18;
  const yBot = 188;
  const xFor = (i: number) => (n === 1 ? opts.x1 : opts.x0 + ((opts.x1 - opts.x0) * i) / (n - 1));
  const yFor = (accPct: number) => yBot - (Math.max(0, Math.min(100, accPct)) / 100) * (yBot - yTop);
  return pts.map((p, i) => {
    const [, m, d] = p.day.split("-");
    const label = `${parseInt(m, 10)}/${parseInt(d, 10)}`;
    return { x: Math.round(xFor(i) * 10) / 10, y: Math.round(yFor(p.accuracyPct) * 10) / 10, label, accuracyPct: p.accuracyPct };
  });
}

/** `points` attr for a <polyline>/<polygon> from TrendPoint[]. */
function polyPoints(pts: TrendPoint[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}

/** Area-fill path (line points, then down to the baseline and closed) for the trend chart. */
function areaPath(pts: TrendPoint[], baseline = 188): string {
  if (pts.length === 0) return "";
  const line = pts.map((p) => `${p.x},${p.y}`).join(" L");
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `M${line} L${last.x},${baseline} L${first.x},${baseline} Z`;
}

function computeVals(state: AppState, a: Actions, serverSubmit: boolean) {
  const cur = state.screen;
  const layout = state.layout;
  const sbTheme = state.sbTheme;
  const activeKey =
    cur === "wrongbook" || cur === "favorites"
      ? state.wbTab === "收藏夹"
        ? "favorites"
        : "wrongbook"
      : cur === "session"
        ? // a launched session lives "inside" the hub — keep 题库 lit while answering.
          "qbank"
        : cur;
  const mk = (k: ScreenKey) => ({
    active: activeKey === k,
    inactive: activeKey !== k,
    go: () => a.go(k),
  });
  const nav = {
    home: mk("home"),
    practice: mk("practice"),
    interview: mk("interview"),
    wrongbook: mk("wrongbook"),
    favorites: mk("favorites"),
    stats: mk("stats"),
    qbank: mk("qbank"),
    settings: mk("settings"),
  };
  const meta = (
    {
      home: { n: "01", t: "首页 · 仪表盘" },
      practice: { n: "02", t: "刷题练习" },
      interview: { n: "03", t: "模拟面试 · 考试模式" },
      wrongbook: { n: "04", t: "错题本 · 收藏夹" },
      favorites: { n: "05", t: "错题本 · 收藏夹" },
      stats: { n: "07", t: "数据统计" },
      qbank: { n: "06", t: "题库 · 章节练习" },
      settings: { n: "08", t: "设置" },
      // V2 unified answering screen — the header title is overridden by the session scope label below.
      session: { n: "02", t: "刷题 · 模拟面试" },
    } as Record<ScreenKey, { n: string; t: string }>
  )[cur];

  // ---------- practice (§5.4 dual-mode: demo local grade vs authed server-authoritative) ----------
  // serverSubmit === true → the authed bank is STRIPPED (no answer key/explanation). We MUST NOT
  // call grade()/correctAnswerText()/buildReveal() on such a record; grading + reveal come only
  // from `submitted` (the server submit response, keyed by question id). serverSubmit === false →
  // demo: the full sample bank is present and we grade locally exactly as before.
  const { q, pos } = currentPractice(state, serverSubmit);
  const hasQ = !!q;

  const pAnswer = q ? state.pAnswers[q.id] : undefined;
  const submitted = q ? state.pReveal[q.id] : undefined; // PracticeReveal (result + revealed + attemptId)
  const submittedReveal = submitted?.revealed; // AnswerReveal | undefined (post-submit only)

  // pGrade: prefer the stored submit result. Before a submit: in authed mode surface the neutral
  // "unanswered" placeholder (NEVER grade() a stripped record); in demo mode grade locally so the
  // immediate self-assess / composite feedback keeps working identically.
  const pGrade: GradeResult | undefined = q
    ? submitted?.result ??
      (serverSubmit
        ? UNANSWERED_RESULT
        : pAnswer
          ? grade(q as QuestionRecord, pAnswer) // demo-only branch: q is a full record here
          : undefined)
    : undefined;

  // A grade is "shown" once the user has SUBMITTED (submit result stored). In demo, self/composite
  // answers are shown immediately too (they never round-trip a server submit).
  const pShownGrade: GradeResult | undefined =
    q &&
    (submitted || (!serverSubmit && (pAnswer?.kind === "self" || pAnswer?.kind === "composite")))
      ? pGrade
      : undefined;

  const pAnsRight = pShownGrade?.status === "correct";
  const pAnsWrong = pShownGrade?.status === "incorrect";
  const pPartial = pShownGrade?.status === "partial";

  // Analysis derives from the server reveal in authed mode, from the full record in demo mode.
  const pAna = q ? toAna(q, submittedReveal) : { explain: "", points: [], pitfalls: [], related: [], ai: "" };
  const pFieldProps = q
    ? {
        question: q as QuestionRecord,
        value: pAnswer,
        graded: pShownGrade,
        reveal: submittedReveal,
        onChange: a.pAnswer,
        onSelfGrade: a.pSelfGrade,
      }
    : undefined;

  // ---------- honest practice progress (§B — replaces the fake pNoBase 12 / pTotal 30 / pPct math) ----------
  // pNo is the REAL 1-based position in the loaded queue; pAnsweredCount is this session's submits.
  // The progress bar tracks the real daily goal: (stats.todayCount snapshot + this-session submits)
  // over the goal. In demo stats.todayCount is 0, so it reflects the session's own submits vs the goal.
  const pNo = hasQ ? pos + 1 : 0;
  const pGoal = state.setGoal || 0;
  const pLiveToday = (state.stats?.todayCount ?? 0) + state.pAnsweredCount;
  const pGoalPct = pGoal > 0 ? Math.min(100, Math.round((pLiveToday / pGoal) * 100)) : 0;
  // Queue exhausted (authed): server signalled no more pages AND the pointer has stepped PAST the
  // last loaded question (pNext only allows that once pNoMore is set). `>= length` (not length-1):
  // firing AT the last index would mask the final question forever — and deadlock the whole flow
  // when a filter matches exactly one question.
  const pExhausted =
    serverSubmit && state.pNoMore && state.bank.length > 0 && state.pIndex >= state.bank.length;

  // ---------- exam ----------
  const idx = state.examIndex;
  const examBank = state.examBank;
  const examLen = examBank.length;
  const eq: PracticeQuestion | undefined = examLen > 0 ? examBank[Math.min(idx, examLen - 1)] : undefined;
  const eAnswer = state.examAnswers[idx];
  const examFieldProps = eq
    ? {
        question: eq as QuestionRecord,
        value: eAnswer,
        graded: undefined,
        onChange: a.examAnswer,
      }
    : undefined;
  const examAnsweredCount = Object.keys(state.examAnswers).length;
  // REAL total — no fabricated 30 fallback. Empty (loading / start-failed) → 0 (honest).
  const examTotal = examLen;

  // exam summary. Dual-mode (§5.4):
  //   AUTHED (serverSubmit): the exam bank is STRIPPED and grading is SERVER-authoritative. The
  //     score/correct/wrong come from state.examServer (the submitExam response, adapted). We NEVER
  //     local-grade a stripped record — doing so would fabricate a wrong result from missing keys
  //     (the blocker #2 root cause was that this block was gated `!serverSubmit`, so authed always
  //     showed 0/0/0). Until the server result lands, correct/wrong stay 0 (the screen still shows
  //     the answered/unanswered counts, which are real).
  //   DEMO (!serverSubmit): the full sample bank is present → local grade exactly as before.
  let examCorrect = 0;
  let examWrong = 0;
  let examScoreSum = 0;
  let examMaxSum = 0;
  if (state.examSubmitted && serverSubmit) {
    if (state.examServer) {
      examCorrect = state.examServer.correct;
      examWrong = state.examServer.wrong;
    }
  } else if (state.examSubmitted && !serverSubmit) {
    examBank.forEach((question, i) => {
      const g = grade(question as QuestionRecord, state.examAnswers[i]);
      if (g.status === "correct") examCorrect++;
      else if (g.status === "incorrect") examWrong++;
      if (g.score !== null) {
        examScoreSum += g.score * g.max;
        examMaxSum += g.max;
      }
    });
  }
  const examUnanswered = Math.max(0, examTotal - examAnsweredCount);
  // AUTHED score is the server's authoritative 0..100; DEMO is the local normalized sum.
  const examScore100 =
    serverSubmit
      ? state.examServer?.score100 ?? 0
      : examMaxSum > 0
        ? Math.round((examScoreSum / examMaxSum) * 100)
        : 0;

  // One answer-card bubble for a 1-based question number n (n-1 is the frozen index).
  const oneBubble = (n: number) => ({
    n,
    st: bubbleStyle(state, n - 1, state.examAnswers[n - 1] !== undefined),
    go: () => a.examGo(n - 1),
  });

  // ---------- REAL exam composition (derived from the frozen examBank — replaces the 15/5/5/5 &
  // 30/50/20% & the [1..15]/[16..20]/… bubble号段 fabrications, §D) ----------
  // Type distribution [{type,label,count}] and difficulty distribution [{difficulty,label,count}],
  // both counted off the actual (stripped) exam questions — `type`/`difficulty` survive stripping.
  const examTypeCount = new Map<string, number>();
  const examDiffCount = new Map<string, number>();
  for (const question of examBank) {
    examTypeCount.set(question.type, (examTypeCount.get(question.type) ?? 0) + 1);
    examDiffCount.set(question.difficulty, (examDiffCount.get(question.difficulty) ?? 0) + 1);
  }
  const examTypeDist = [...examTypeCount.entries()]
    .map(([type, count]) => ({ type, label: TYPE_LABEL[type as QuestionType] ?? type, count }))
    .sort((x, y) => y.count - x.count);
  const examDiffDist = (["easy", "medium", "hard"] as Difficulty[])
    .filter((d) => examDiffCount.has(d))
    .map((d) => ({
      difficulty: d,
      label: DIFF_LABEL[d],
      count: examDiffCount.get(d) ?? 0,
      pct: examTotal > 0 ? Math.round(((examDiffCount.get(d) ?? 0) / examTotal) * 100) : 0,
    }));
  // Answer-card grouped by TYPE in the FROZEN order (replaces bubbles1..4's hardcoded号段). Each
  // group is a contiguous run of same-type questions with real numbers/answered state.
  const examBubbleGroups: { label: string; type: string; items: ReturnType<typeof oneBubble>[] }[] = [];
  examBank.forEach((question, i) => {
    const label = TYPE_LABEL[question.type as QuestionType] ?? question.type;
    const last = examBubbleGroups[examBubbleGroups.length - 1];
    if (last && last.type === question.type) last.items.push(oneBubble(i + 1));
    else examBubbleGroups.push({ label, type: question.type, items: [oneBubble(i + 1)] });
  });
  // Real exam duration (server durationSec, authed). "包含大厂真题" only when a question truly has one.
  const examDurationSec = state.examDurationSec ?? (serverSubmit ? 0 : DEMO_EXAM_SEC);
  const examHasCompany = examBank.some((question) => !!question.source?.company);
  const examLoading = state.examStarting || state.examResuming;

  // ---------- wrongbook / favorites / recent ----------
  // AUTHED: real server lists (state.wbItems, cursor-paged via wbHasMore/wbLoadMore) — NEVER the demo
  // arrays and NEVER the bank∩progress projection (that projection + the lib/data.ts fallback arrays
  // stay DEMO-only, so a new authed user with no history sees an honest empty state, not fake rows).
  const prog = state.progress;
  const wrongList: ListItem[] = state.bank
    .filter((qq) => (prog[qq.id]?.wrongCount ?? 0) > 0)
    .map((qq) => toListItem(qq, prog[qq.id]));
  const favList: ListItem[] = state.bank
    .filter((qq) => prog[qq.id]?.fav)
    .map((qq) => toListItem(qq, prog[qq.id]));
  const demoRecentList: ListItem[] = state.bank
    .filter((qq) => prog[qq.id]?.lastAt)
    .sort((x, y) => (prog[y.id]?.lastAt ?? 0) - (prog[x.id]?.lastAt ?? 0))
    .slice(0, 12)
    .map((qq) => {
      const p = prog[qq.id];
      const acc = p?.lastScore != null ? `正确率 ${Math.round(p.lastScore * 100)}%` : "";
      const li = toListItem(qq, p);
      li.last = acc + (p?.lastAt ? ` · ${fmtDate(p.lastAt)}` : "");
      return li;
    });

  // The current wrongbook-tab source, unified to LibraryListItem (fav + optional chapter/section).
  // AUTHED: authoritative server rows (fav + chapter/section joined server-side). DEMO: projection (+
  // demo-array fallback only when empty), with fav from the optimistic local wbFav map (no chapter).
  const wbSource: LibraryListItem[] = serverSubmit
    ? state.wbItems
    : (state.wbTab === "收藏夹"
        ? favList.length
          ? favList
          : favItems
        : state.wbTab === "最近练习"
          ? demoRecentList.length
            ? demoRecentList
            : recentItems
          : wrongList.length
            ? wrongList
            : wrongItems
      ).map((it) => ({ ...it, fav: !!state.wbFav[it.id] }));

  const wbList = wbSource.map((it) => {
    // V2 browse-tree label (章·节). Null columns bucket as 未分类/综合 (mirrors browseStructure).
    const chapter = it.chapter ?? null;
    const section = it.section ?? null;
    const chapterLabel = chapter ?? "未分类";
    const sectionLabel = section ?? "综合";
    return {
      ...it,
      diffS: diffStyle(it.diff),
      diffChip: diffChip(it.diff),
      typeChip: typeChipStyle(),
      fav: it.fav,
      favInv: !it.fav,
      onFav: () => a.toggleFav(it.id),
      // 「标记已掌握」— wrongbook tab only (masterWrong removes the row). No by-id 重做 backend exists,
      // so nothing is exposed for a 重做 button (screens drop it).
      onMaster: () => a.wbMaster(it.id),
      canMaster: state.wbTab === "错题本",
      // V2: expose the row's chapter/section so the screen renders "章 · 节" (§E). raw + combined.
      chapter,
      section,
      chapterLabel,
      sectionLabel,
      chapterSection: `${chapterLabel} · ${sectionLabel}`,
      meta:
        state.wbTab === "错题本"
          ? "错误 " + it.wrong + " 次 · 上次错误 " + it.last
          : it.last,
    };
  });
  const wbEmpty = wbList.length === 0;

  // V2 chapter FILTER (§E) — wrongbook/favorites tabs. Options are pulled from the (fixed) browse tree
  // so every chapter is selectable even when the current page shows only a few; the active option
  // narrows the list refetch AND the review-session scope. Recent tab has no chapter filter.
  const wbChapterOptions = [
    {
      chapter: null as string | null,
      label: "全部章节",
      active: state.wbChapter === null,
      go: () => a.wbSetChapter(null),
    },
    ...(state.browse?.chapters ?? []).map((ch) => ({
      chapter: ch.chapter as string | null,
      label: ch.chapter,
      count: ch.count,
      active: state.wbChapter === ch.chapter,
      go: () => a.wbSetChapter(ch.chapter),
    })),
  ];
  // The 开始复习 launchers honor the active tab + chapter filter (wrong vs favorites scope).
  const wbReviewMode = state.wbTab === "收藏夹" ? "favorites" : "wrong";
  const wbCanReview = (state.wbTab === "错题本" || state.wbTab === "收藏夹") && !wbEmpty;

  // Home 最近练习 card (top-level recentList val, §E). AUTHED: real listRecent rows. DEMO: the
  // bank∩progress projection (demo-array fallback keeps /demo non-empty).
  const recentSource: (ListItem & { fav?: boolean })[] = serverSubmit
    ? state.homeRecent
    : demoRecentList.length
      ? demoRecentList
      : recentItems;
  const recentList = recentSource.slice(0, 6).map((it) => ({
    id: it.id,
    type: it.type,
    diff: it.diff,
    q: it.q,
    tags: it.tags,
    last: it.last,
    diffChip: diffChip(it.diff),
    typeChip: typeChipStyle(),
  }));
  const recentEmpty = recentSource.length === 0;

  const wbTabGo = (t: string) => () => a.wbSetTab(t);
  const pgBase: CSSProperties = {
    minWidth: "34px",
    height: "34px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "13px",
    cursor: "pointer",
    transition: "all .1s",
  };
  // AUTHED uses cursor paging (wbHasMore/wbLoadMore) — the fixed [1..5] page buttons are DEMO-only.
  const pages = serverSubmit
    ? []
    : [1, 2, 3, 4, 5].map((n) => ({
        n,
        active: state.wbPage === n,
        go: () => a.wbGo(n),
        style:
          state.wbPage === n
            ? { ...pgBase, background: "var(--pri)", color: "#fff", border: "1px solid var(--pri)", fontWeight: 700 }
            : { ...pgBase, background: "var(--surface)", color: "var(--ink2)", border: "1px solid var(--line)", fontWeight: 600 },
      }));

  // ---------- qbank screen derivations ----------
  const report = state.qbankReport;
  const reportRows = report
    ? report.records.map((r: RecordReport) => {
        const rec = report.accepted.find((x) => x.id === r.id) ?? undefined;
        const typeKey = (rec?.type ?? undefined) as QuestionType | undefined;
        return {
          index: r.index,
          id: r.id ?? `#${r.index + 1}`,
          ok: r.ok,
          typeLabel: typeKey ? TYPE_LABEL[typeKey] : "—",
          typeChip: typeChipStyle(),
          diffChip: rec ? diffChip(DIFF_LABEL[rec.difficulty]) : null,
          issues: r.issues.map((iss) => ({ ...iss, chip: issueChip(iss.level) })),
        };
      })
    : [];
  const qbankSummary = report
    ? { total: report.counts.total, accepted: report.counts.accepted, rejected: report.counts.rejected, warned: report.counts.warned, fileOk: report.fileOk }
    : null;

  // ---------- real stats derivations (§7.2) ----------
  // hasStats gates the whole block: in demo mode (state.stats === null) every screen keeps its
  // original hardcoded numbers (the `?? <demo>` fallbacks below are never reached because the
  // screens read the demo literals directly when statsReady is false).
  const st = state.stats;
  const statsReady = !!st;
  // Home KPIs (刷题量 / 正确率 / 今日 / 连续打卡). Objective accuracy is correct/objectiveAttempts,
  // already computed server-side as accuracyPct (§7.2 铁律) — we never recompute it as correct/attempts.
  const statTotalAttempts = st?.totalAttempts ?? 0;
  const statAccuracyPct = st?.accuracyPct ?? 0;
  const statTodayCount = st?.todayCount ?? 0;
  // LIVE overlays: state.stats is a page-load snapshot (never refetched in-session), so screens
  // that read the raw snapshot go stale the moment the user practices — home would say 今日 5 while
  // the practice header says 15. Overlay this session's submits so every surface shares one口径.
  const statTodayLive = statTodayCount + state.pAnsweredCount;
  const statTotalLive = statTotalAttempts + state.pAnsweredCount;
  const statStreak = st?.streak ?? 0;
  const statStudyMinutes = st?.studyMinutes ?? 0;
  const statStudyHours = Math.round((statStudyMinutes / 60) * 10) / 10;
  const goal = state.setGoal || 60;
  const todayGoalPct = goal > 0 ? Math.min(100, Math.round((statTodayLive / goal) * 100)) : 0;

  // Stats-screen accuracy-trend SVG points from the real trend (last 10 days). Empty → screen keeps
  // its demo polyline. We expose the polyline/area strings + circle points so the screen can map them.
  const trendPts = buildAccuracyTrendPoints(st?.accuracyTrend, { x0: 62, x1: 620, max: 10 });
  const statTrend = {
    ready: statsReady && trendPts.length > 0,
    points: polyPoints(trendPts),
    area: areaPath(trendPts),
    dots: trendPts.map((p) => ({ x: p.x, y: p.y, acc: p.accuracyPct, label: p.label })),
    last: trendPts.length > 0 ? trendPts[trendPts.length - 1] : null,
  };

  // Category mastery bars (real accuracy per category/tag). Empty → screen keeps its demo bars.
  const statCategoryBars = (st?.categoryMastery ?? []).map((c) => ({
    name: c.category,
    pct: c.accuracyPct,
    count: c.count,
    barStyle: css({
      width: `${c.accuracyPct}%`,
      height: "100%",
      background: "var(--pri)",
      borderRadius: "6px",
      transformOrigin: "left center",
      animation: "boGrowX .9s cubic-bezier(.22,.61,.36,1) both",
    }),
  }));

  // Difficulty performance bars (used on the stats screen "题型/难度表现" region when real).
  const statDifficultyBars = (st?.byDifficulty ?? []).map((d) => ({
    label: DIFF_LABEL[d.difficulty as Difficulty] ?? d.difficulty,
    pct: d.accuracyPct,
    count: d.count,
    barStyle: css({
      width: `${d.accuracyPct}%`,
      height: "100%",
      background: "var(--pri)",
      borderRadius: "6px",
      transformOrigin: "left center",
      animation: "boGrowX .9s cubic-bezier(.22,.61,.36,1) both",
    }),
  }));

  const statWeakest = st?.weakestCategories ?? [];

  // Objective accuracy BY QUESTION TYPE (real typeMastery, §7.2) → the stats-screen 题型表现 bars
  // (replaces the hardcoded 单选82/多选68/…). ASCII type → Chinese via TYPE_LABEL.
  const statTypeBars = (st?.typeMastery ?? []).map((t) => ({
    label: TYPE_LABEL[t.type as QuestionType] ?? t.type,
    pct: t.accuracyPct,
    count: t.count,
    barStyle: css({
      width: `${t.accuracyPct}%`,
      height: "100%",
      background: "var(--pri)",
      borderRadius: "6px",
      transformOrigin: "left center",
      animation: "boGrowX .9s cubic-bezier(.22,.61,.36,1) both",
    }),
  }));

  // Home 分类练习进度 cards: the real category overview (published counts) LEFT-JOINed with this
  // user's category mastery (accuracyPct). accuracyPct is null when the user has no attempts in that
  // category yet (screen shows count without a fake % ). Empty in demo → screen keeps its literals.
  const masteryByCategory = new Map((st?.categoryMastery ?? []).map((c) => [c.category, c.accuracyPct]));
  const categoryCards = state.categories.map((c) => ({
    name: c.name,
    count: c.count,
    accuracyPct: masteryByCategory.has(c.name) ? (masteryByCategory.get(c.name) as number) : null,
  }));

  // Honest 较昨日 deltas (null when unknowable → the screen hides the 较昨日 line rather than
  // fabricate a green +X). The trend array only contains days WITH activity, so "the last two
  // entries" are NOT necessarily today/yesterday — a Thursday visit after a Mon/Tue streak would
  // otherwise show a stale Mon→Tue delta labelled 较昨日 next to a todayCount of 0. Both entries
  // must be the actual calendar today & yesterday (UTC day keys, matching the server's dayKey).
  const trendDays = st?.accuracyTrend ?? [];
  const lastDay = trendDays.length > 0 ? trendDays[trendDays.length - 1] : undefined;
  const prevDay = trendDays.length > 1 ? trendDays[trendDays.length - 2] : undefined;
  const utcDayKey = (d: Date) => d.toISOString().slice(0, 10);
  const todayKey = utcDayKey(new Date());
  const yesterdayKey = utcDayKey(new Date(Date.now() - 24 * 3600 * 1000));
  const deltaValid = !!lastDay && !!prevDay && lastDay.day === todayKey && prevDay.day === yesterdayKey;
  const statTodayDeltaAttempts = deltaValid ? lastDay!.attempts - prevDay!.attempts : null;
  const statAccuracyDelta = deltaValid ? lastDay!.accuracyPct - prevDay!.accuracyPct : null;

  // ============================================================
  //  V2 UNIFIED SESSION (§C) — the answering screen (刷题 practice + 模拟面试 exam share it).
  // ============================================================
  // The session is AUTHED-ONLY (startSession requires the action) so grading is always server-
  // authoritative here — no demo dual-mode branch. When `state.session` is null (on the hub or in
  // demo) every val below is a coherent empty default so the screen renders nothing / an empty shell.
  const sess = state.session;
  const sHasSession = !!sess;
  const sIsPractice = sess?.mode === "practice";
  const sIsExam = sess?.mode === "exam";
  const sTotal = sess ? sess.questions.length : 0;
  const sIndex = sess ? Math.min(Math.max(0, sess.index), Math.max(0, sTotal - 1)) : 0;
  const sQ: PracticeQuestion | undefined = sess && sTotal > 0 ? sess.questions[sIndex] : undefined;
  const sAnswer = sess ? sess.answers[sIndex] : undefined;
  const sReveal = sess && sQ ? sess.reveals[sQ.id] : undefined; // practice per-question reveal
  const sRevealed = sReveal?.revealed;
  const sShownGrade = sReveal?.result; // practice: the grade shown once the question is submitted
  const sLocked = sIsPractice && !!sReveal; // a submitted practice question locks (no re-submit)
  const sAnsRight = sShownGrade?.status === "correct";
  const sAnsWrong = sShownGrade?.status === "incorrect";
  const sPartial = sShownGrade?.status === "partial";

  // Field props (mirror pFieldProps §5.4). PRACTICE surfaces the graded state + reveal once submitted;
  // EXAM renders an ungraded field while answering (the grade lands only in the results after 交卷).
  const sFieldProps = sQ
    ? {
        question: sQ as QuestionRecord,
        value: sAnswer,
        graded: sIsPractice ? sShownGrade : undefined,
        reveal: sIsPractice ? sRevealed : undefined,
        onChange: a.sessionAnswer,
        onSelfGrade: a.sessionSelfGrade,
      }
    : undefined;
  const sAna =
    sQ && sIsPractice ? toAna(sQ, sRevealed) : { explain: "", points: [], pitfalls: [], related: [], ai: "" };

  // FLAT answer card — 1..N in the frozen (server type-clustered) order, NO per-type group boxes (§C).
  const sessionCard = sess
    ? sess.questions.map((_q, i) => ({
        n: i + 1,
        current: i === sIndex,
        answered: sess.answers[i] !== undefined,
        marked: sess.marked.includes(i),
        go: () => a.sessionGoto(i),
      }))
    : [];

  const sAnsweredCount = sess ? Object.keys(sess.answers).length : 0;
  const sUnanswered = Math.max(0, sTotal - sAnsweredCount);
  const sSubmittedCount = sess ? Object.keys(sess.reveals).length : 0; // practice: graded-so-far
  let sCorrectCount = 0;
  if (sess) for (const r of Object.values(sess.reveals)) if (r.result.status === "correct") sCorrectCount++;
  const sProgressPct = sTotal > 0 ? Math.round((sAnsweredCount / sTotal) * 100) : 0;

  // Exam clock + whole-exam results.
  const sRemain = sess?.remainingSec ?? null;
  const sServer = sess?.serverResult ?? null;
  const sResultReady = sIsExam && !!sServer;
  const sServerPending = sIsExam && !!sess?.submitted && sServer === null && !sess?.submitError;
  // Per-question exam results table (scored together, §C) — aligned to the frozen order.
  const sResultRows =
    sess && sIsExam && sServer
      ? sess.questions.map((qq, i) => {
          const per = sServer.perQuestion.find((p) => p.questionId === qq.id);
          const status = per?.result.status;
          return {
            n: i + 1,
            id: qq.id,
            type: TYPE_LABEL[qq.type],
            q: stem(qq),
            diff: DIFF_LABEL[qq.difficulty],
            diffChip: diffChip(DIFF_LABEL[qq.difficulty]),
            typeChip: typeChipStyle(),
            status,
            right: status === "correct",
            wrong: status === "incorrect",
            partial: status === "partial",
            // answered vs graded: a subjective question (essay/short_answer/code_writing) grades to
            // status "ungraded" in exam mode (no self-grade step), so right/wrong/partial are all
            // false even though the user DID answer — the screen must show 待评分, not 未作答.
            answered: sess.answers[i] !== undefined,
            yourAns: userAnswerText(qq, sess.answers[i]),
            correct: correctAnswerText(qq, per?.revealed),
            go: () => a.sessionGoto(i),
          };
        })
      : [];

  // ============================================================
  //  V2 HUB (§D) — the merged 题库 browse tree + per-node scope launchers.
  // ============================================================
  const browse = state.browse ?? { chapters: [], total: 0 };
  // Each node carries PRE-BOUND practice/exam launchers so the hub screen just wires onClick (no need
  // to construct a SessionScope itself). `hubStartPractice/Exam` (scope→launch) are also exposed for
  // callers that build scopes directly.
  const mkLaunch = (scope: SessionScope) => ({
    startPractice: () => a.sessionLaunch(scope, "practice"),
    startExam: () => a.sessionLaunch(scope, "exam"),
  });
  const hubTree = {
    total: browse.total,
    all: { count: browse.total, ...mkLaunch({ kind: "all" }) },
    chapters: browse.chapters.map((ch) => ({
      chapter: ch.chapter,
      count: ch.count,
      ...mkLaunch({ kind: "chapter", chapter: ch.chapter }),
      sections: ch.sections.map((secNode) => ({
        section: secNode.section,
        count: secNode.count,
        ...mkLaunch({ kind: "section", chapter: ch.chapter, section: secNode.section }),
      })),
    })),
  };
  const hubEmpty = browse.total === 0;

  return {
    // ---- 3b-2 passthrough: real identity for the settings/header (no derivation change) ----
    user: state.user,
    entitlement: state.entitlement,
    // AUTHED discriminator (= serverSubmit). Screens branch on this to render honest empty states in
    // authed mode vs the intentional /demo literals in demo mode.
    authed: serverSubmit,
    updateUserName: a.updateUserName,

    showArt: state.showArt,
    nav,
    topNo: meta.n,
    topTitle: meta.t,
    layoutSidebar: layout === "sidebar",
    layoutTop: layout === "top",
    themeDark: sbTheme === "dark",
    themeLight: sbTheme === "light",
    toggleLayout: a.toggleLayout,
    toggleTheme: a.toggleTheme,
    appThemeDark: state.appTheme === "dark",
    appThemeLight: state.appTheme === "light",
    toggleAppTheme: a.toggleAppTheme,
    asideMod:
      layout === "top" ? "bo-aside-hidden" : state.collapsed ? "bo-aside-collapsed" : "",
    toggleCollapse: a.toggleCollapse,
    mobileNav: state.mobileNav,
    openNav: a.openNav,
    closeNav: a.closeNav,
    drawerOpenCls: state.mobileNav ? "bo-drawer open" : "bo-drawer",
    layoutLabel: layout === "sidebar" ? "侧边栏" : "顶部导航",
    sbLabel: sbTheme === "dark" ? "深色" : "浅色",
    appLabel: state.appTheme === "dark" ? "深色" : "浅色",
    // V2 nav MERGE (§B): 6 items — 刷题/模拟面试 are gone (they merge into the 题库 hub → session).
    mobileItems: (
      [
        ["home", "首页"],
        ["qbank", "题库"],
        ["wrongbook", "错题本"],
        ["favorites", "收藏夹"],
        ["stats", "数据统计"],
        ["settings", "设置"],
      ] as [ScreenKey, string][]
    ).map(([k, label]) => {
      const on = activeKey === k;
      return {
        label,
        go: () => {
          a.go(k);
          a.closeNav();
        },
        rowStyle: css({
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "11px 12px",
          borderRadius: "9px",
          cursor: "pointer",
          fontSize: "14.5px",
          fontWeight: on ? 700 : 500,
          color: on ? "var(--pri)" : "var(--ink)",
          background: on ? "var(--pri-w)" : "transparent",
        }),
        bar: css({
          width: "3px",
          height: "16px",
          borderRadius: "2px",
          background: on ? "var(--pri)" : "transparent",
          flex: "none",
        }),
      };
    }),
    isHome: cur === "home",
    isPractice: cur === "practice",
    isExam: cur === "interview",
    isWrong: cur === "wrongbook" || cur === "favorites",
    isStats: cur === "stats",
    isQbank: cur === "qbank",
    isSettings: cur === "settings",
    // V2: the unified answering screen (main-area routes <SessionScreen /> on this, next stage).
    isSession: cur === "session",
    // V2: admin-only avatar-dropdown entry (headers) — true iff the session user is an admin (§G).
    isAdmin: state.isAdmin,

    // practice
    pHasQ: hasQ,
    pQ: q
      ? { id: q.id, type: TYPE_LABEL[q.type], q: stem(q), diff: DIFF_LABEL[q.difficulty] }
      : { id: "", type: "", q: "题库为空，请调整筛选或导入题目。", diff: "" },
    pRecord: q,
    pFieldProps,
    pGrade: pShownGrade,
    pIsMulti: q?.type === "multiple_choice",
    // Honest progress (§B). pNo = real 1-based position; pTotal / pProgress / pBarStyle now track the
    // real DAILY GOAL (setGoal) instead of the fabricated /30. New vals below expose the richer split
    // (pAnsweredCount / pGoal / pGoalPct / pExhausted) for the screens stage.
    pNo,
    pTotal: pGoal,
    pProgress: pGoalPct + "%",
    pBarStyle: css({
      width: pGoalPct + "%",
      height: "100%",
      background: "var(--pri)",
      borderRadius: "6px",
      transition: "width .3s",
    }),
    pAnsweredCount: state.pAnsweredCount,
    pGoal,
    pGoalPct,
    // Queue lifecycle: pExhausted → offer 「重新开始/调整筛选」; pRestart resets cursor+index+queue.
    pExhausted,
    pLoading: state.pLoadingBatch,
    pRestart: a.pRestart,
    pPrev: a.pPrev,
    // Submit robustness: an in-flight flag + an inline error {code,message}. On PAYMENT_REQUIRED the
    // screen routes pSubmitError.code to <Upsell>; other codes render an inline retry.
    pSubmitting: state.pSubmitting,
    pSubmitError: state.pSubmitError,
    pFav: q ? !!state.pFav[q.id] : false,
    pFavInv: q ? !state.pFav[q.id] : true,
    pShowAna: state.pShowAnalysis,
    pShowAnaInv: !state.pShowAnalysis,
    pAnaPoints: pAna.points.map((t, i) => ({ i: i + 1, t })),
    pAna,
    pYourAns: q ? userAnswerText(q, pAnswer) : "未作答",
    // Correct answer: from the server reveal in authed mode (only present post-submit — the correct
    // secure UX), from the full record in demo mode. Blank pre-submit in authed mode. Defense-in-
    // depth (blocker #1): gate the derivation on `submittedReveal` in authed mode so a STRIPPED
    // record (no answer key) is never asked for its key before the server reveal lands. Demo mode
    // (serverSubmit === false) keeps deriving from the full record immediately, as before.
    pCorrect: q && (!serverSubmit || submittedReveal) ? correctAnswerText(q, submittedReveal) : "",
    pDiffS: q ? diffStyle(DIFF_LABEL[q.difficulty]) : diffStyle("中等"),
    pDiffChip: q ? diffChip(DIFF_LABEL[q.difficulty]) : diffChip("中等"),
    pTypeChip: typeChipStyle(),
    pToggleFav: () => q && a.pToggleFav(q.id),
    pNext: a.pNext,
    pSubmit: a.pSubmit,
    pToggleAna: a.pToggleAna,
    pIsMultiInv: q?.type !== "multiple_choice",
    pAnsRight,
    pAnsWrong,
    pPartial,
    pfTypeList: buildTypeList(state, a),
    pfDiffs: [
      { k: "简单", ascii: "easy" as Difficulty, dot: "#12B76A" },
      { k: "中等", ascii: "medium" as Difficulty, dot: "#F79009" },
      { k: "困难", ascii: "hard" as Difficulty, dot: "#F04438" },
    ].map((d) => {
      const on = state.pfDiff === d.ascii;
      return {
        k: d.k,
        dot: d.dot,
        on,
        go: () => a.setDiff(d.ascii),
        dotStyle: css({ width: "8px", height: "8px", borderRadius: "50%", background: d.dot, flex: "none" }),
        style: css({
          display: "flex",
          alignItems: "center",
          gap: "9px",
          padding: "9px 11px",
          borderRadius: "8px",
          cursor: "pointer",
          border: on ? "1.5px solid var(--pri)" : "1.5px solid var(--line)",
          background: on ? "var(--pri-w)" : "var(--surface)",
          transition: "all .1s",
        }),
      };
    }),
    // Real tag facet (§7.3): AUTHED → initialData.tags (slug filter key + display name); DEMO →
    // aggregated from the loaded sample bank. `k` is the display label; `go` toggles by filter KEY
    // (slug in authed, tag text in demo) so buildPracticeFilters/filterBank match the real taxonomy.
    pfTagList: (
      state.tags.length > 0
        ? state.tags.map((t) => ({ label: t.name, key: t.slug }))
        : serverSubmit
          ? []
          : aggregateBankTags(state.bank).map((t) => ({ label: t, key: t }))
    ).map(({ label, key }) => {
      const on = !!state.pfTags[key];
      return {
        k: label,
        on,
        go: () => a.toggleTag(key),
        style: css({
          fontSize: "12.5px",
          fontWeight: 500,
          padding: "6px 12px",
          borderRadius: "7px",
          cursor: "pointer",
          border: on ? "1px solid var(--pri)" : "1px solid var(--line)",
          background: on ? "var(--pri-w)" : "var(--surface)",
          color: on ? "var(--pri)" : "#5A6172",
          transition: "all .1s",
        }),
      };
    }),
    pfCompanyOn: state.pfCompany,
    pfCompanyGo: () => a.toggleCompany(),
    pfCompanyBox: css({
      width: "17px",
      height: "17px",
      borderRadius: "50%",
      flex: "none",
      boxSizing: "border-box",
      border: state.pfCompany ? "5px solid var(--pri)" : "1.6px solid #CAD1DE",
      transition: "all .1s",
    }),
    resetFiltersDo: () => a.resetFilters(),

    // exam
    // Server remainingSec is the baseline; before it lands we show the real durationSec (authed) or
    // the demo local-timer default — NEVER the old fabricated 5316 for an authed session.
    examTime: fmtTime(state.examRemain ?? examDurationSec),
    examLow: state.examRemain != null && state.examRemain < 600,
    examNo: idx + 1,
    examTotal,
    examDurationSec,
    examLoading,
    examCount: state.examCount,
    examCanSetCount: !state.examSessionId,
    examSetCount: (n: number) => a.setExamCount(n),
    // Pre-start panel (authed): no active session to resume → the user picks a count and presses
    // 开始考试 (examStartDo). Auto-starting made the count selector permanently unreachable.
    examAwaitingStart: serverSubmit && state.examAwaitingStart,
    examStartDo: a.examStart,
    // Real composition (from the frozen examBank) — replaces the setup-panel 15/5/5/5 & 30/50/20%.
    examTypeDist,
    examDiffDist,
    examHasCompany,
    // Single real answer-card, grouped by type in frozen order (replaces bubbles1..4's hardcoded号段).
    examBubbleGroups,
    examHasQ: examLen > 0,
    examQ: eq
      ? { id: eq.id, type: TYPE_LABEL[eq.type], q: stem(eq), diff: DIFF_LABEL[eq.difficulty] }
      : { id: "", type: "", q: "考试题库为空。", diff: "" },
    examRecord: eq,
    examFieldProps,
    examDiffS: eq ? diffStyle(DIFF_LABEL[eq.difficulty]) : diffStyle("中等"),
    examDiffChip: eq ? diffChip(DIFF_LABEL[eq.difficulty]) : diffChip("中等"),
    examTypeChip: typeChipStyle(),
    examMarkedCur: state.examMarked.includes(idx),
    examAnsweredCount,
    examSubmitted: state.examSubmitted,
    examSubmittedInv: !state.examSubmitted,
    examMarkedCurInv: !state.examMarked.includes(idx),
    examCorrect,
    examWrong,
    examUnanswered,
    examScore100,
    // Authed exam start failed (no DB / server error) → the screen shows a graceful error instead
    // of a fabricated 0/100. Demo never sets this. `examServerPending` is true in authed mode after
    // submit while the authoritative grade is still resolving (or failed) — the screen can withhold
    // the score badge rather than flash a misleading 0.
    examStartError: state.examStartError,
    // Submit failure (authed): keep examServer null, expose examSubmitError so the screen offers 重试.
    // Pending is withheld while an error is showing (so it never flashes 「评分中…」 over a failure).
    examSubmitError: state.examSubmitError,
    examServerPending:
      serverSubmit && state.examSubmitted && state.examServer === null && !state.examSubmitError,
    examRetryDo: a.examRetrySubmit,
    // DEPRECATED (kept for the un-migrated exam.tsx to typecheck): bubbles1 now holds the FULL real
    // answer card; bubbles2..4 are empty. Screens should switch to examBubbleGroups and drop these.
    bubbles1: examBank.map((_q, i) => oneBubble(i + 1)),
    bubbles2: [] as ReturnType<typeof oneBubble>[],
    bubbles3: [] as ReturnType<typeof oneBubble>[],
    bubbles4: [] as ReturnType<typeof oneBubble>[],
    examMark: a.examMark,
    examPrev: () => a.examStep(-1),
    examNext: () => a.examStep(1),
    examSubmitDo: a.examSubmit,
    examResetDo: a.examReset,

    // wrongbook
    wbTab: state.wbTab,
    wbList,
    wbPage: state.wbPage,
    pages,
    // Cursor paging (authed) — replaces the fake [1..5] pages. wbHasMore gates a 「加载更多」 button.
    wbHasMore: serverSubmit ? !!state.wbCursor : false,
    wbLoadMore: a.wbLoadMore,
    wbLoading: state.wbLoading,
    wbError: state.wbError,
    wbEmpty,
    wbGo错题本: wbTabGo("错题本"),
    wbGo收藏夹: wbTabGo("收藏夹"),
    wbGo最近: wbTabGo("最近练习"),
    wbIsWrong: state.wbTab === "错题本",
    wbIsFav: state.wbTab === "收藏夹",
    wbIsRecent: state.wbTab === "最近练习",
    wbIsWrongInv: state.wbTab !== "错题本",
    wbIsFavInv: state.wbTab !== "收藏夹",
    wbIsRecentInv: state.wbTab !== "最近练习",

    // qbank
    qbankMergeMode: state.qbankMergeMode,
    qbankIsMerge: state.qbankMergeMode === "merge",
    qbankIsReplace: state.qbankMergeMode === "replace",
    qbankSetMerge: () => a.setMergeMode("merge"),
    qbankSetReplace: () => a.setMergeMode("replace"),
    qbankPasteText: state.qbankPasteText,
    qbankOnPaste: (t: string) => a.importPaste(t),
    qbankOnFile: (f: File) => a.importFile(f),
    qbankReport: report,
    qbankSummary,
    qbankReportRows: reportRows,
    qbankConfirm: a.confirmImport,
    qbankConfirmDisabled: !report || !report.fileOk || report.counts.accepted === 0,
    qbankConfirmLabel: report ? `确认导入 ${report.counts.accepted} 题` : "确认导入",
    qbankExport: a.exportBank,
    qbankDownloadSample: a.downloadSample,
    qbankDownloadSchema: a.downloadSchema,
    // AUTHED: the authoritative published total (countPublished); DEMO: the in-memory sample count
    // (meaningful for the demo import feature, which grows this bank).
    qbankBankCount: serverSubmit ? (state.bankTotal ?? 0) : state.bank.length,
    qbankNotice: state.qbankNotice,

    // ---------- real stats (§7.2): home KPIs + stats screen + sidebar streak ----------
    // `statsReady` tells each screen whether to render the real values below or keep its demo
    // literals. Preserves every visual; only the numbers change when real data is present.
    statsReady,
    // Home KPIs (刷题量 / 今日 / 正确率 / 连续打卡 / 累计打卡). accuracyPct is objective (§7.2 铁律).
    statTotalAttempts,
    statAccuracyPct,
    statTodayCount,
    statTodayLive,
    statTotalLive,
    statStreak,
    statStudyMinutes,
    statStudyHours,
    // Sidebar streak card ("<streak> 天 · 今日目标 <today>/<goal>" + progress bar).
    statGoal: goal,
    statTodayGoalPct: todayGoalPct,
    // Stats-screen accuracy-trend SVG (real points) + category / difficulty bars + weakest list.
    statTrend,
    statCategoryBars,
    statDifficultyBars,
    statWeakest,
    // Objective accuracy by question TYPE (real) → stats-screen 题型表现 bars.
    statTypeBars,
    // Honest 较昨日 deltas (null when unknowable → screens hide the line).
    statTodayDeltaAttempts,
    statAccuracyDelta,

    // ---------- home (§E): real 题库总数 / 分类卡 / 最近练习 ----------
    // Authoritative published total (null in demo → screen keeps its literal). Also drives qbank.
    bankTotal: state.bankTotal,
    categoryCards,
    recentList,
    recentEmpty,

    // ---------- settings (§F): real daily-goal stepper + profile name setter ----------
    goalValue: state.setGoal,
    goalInc: () => a.setGoal(state.setGoal + 5),
    goalDec: () => a.setGoal(state.setGoal - 5),

    // ========================================================
    //  V2 UNIFIED SESSION (§C) — consumed by the new <SessionScreen>
    // ========================================================
    sessionActive: sHasSession,
    sessionMode: sess?.mode ?? null,
    sessionIsPractice: sIsPractice,
    sessionIsExam: sIsExam,
    sessionScopeLabel: sess?.scopeLabel ?? "",
    sessionTotal: sTotal,
    sessionIndex: sIndex,
    sessionNo: sTotal > 0 ? sIndex + 1 : 0,
    sessionHasQ: !!sQ,
    sessionQ: sQ
      ? { id: sQ.id, type: TYPE_LABEL[sQ.type], q: stem(sQ), diff: DIFF_LABEL[sQ.difficulty] }
      : { id: "", type: "", q: "本轮暂无题目。", diff: "" },
    sessionRecord: sQ,
    sessionFieldProps: sFieldProps,
    sessionDiffS: sQ ? diffStyle(DIFF_LABEL[sQ.difficulty]) : diffStyle("中等"),
    sessionDiffChip: sQ ? diffChip(DIFF_LABEL[sQ.difficulty]) : diffChip("中等"),
    sessionTypeChip: typeChipStyle(),
    sessionIsMulti: sQ?.type === "multiple_choice",
    // PRACTICE per-question feedback + lock (immediate 判分+解析 from the server reveal).
    sessionShownGrade: sIsPractice ? sShownGrade : undefined,
    sessionAnsRight: sAnsRight,
    sessionAnsWrong: sAnsWrong,
    sessionPartial: sPartial,
    sessionLocked: sLocked,
    sessionAna: sAna,
    sessionAnaPoints: sAna.points.map((t, i) => ({ i: i + 1, t })),
    sessionYourAns: sQ ? userAnswerText(sQ, sAnswer) : "未作答",
    sessionCorrect: sQ && sIsPractice && sRevealed ? correctAnswerText(sQ, sRevealed) : "",
    // Submit state (practice per-question / exam whole-exam) — inline error + retry, never a fake grade.
    sessionSubmitting: !!sess?.submitting,
    sessionSubmitError: sess?.submitError ?? null,
    sessionCanSubmit: sIsPractice && !!sAnswer && !sReveal && !sess?.submitting,
    // Fav — reuse the global pFav map + the existing server toggle on the current session question.
    sessionFav: sQ ? !!state.pFav[sQ.id] : false,
    sessionFavInv: sQ ? !state.pFav[sQ.id] : true,
    sessionToggleFav: () => sQ && a.pToggleFav(sQ.id),
    // Progress within the frozen set (real counts — no fabricated totals).
    sessionAnsweredCount: sAnsweredCount,
    sessionUnanswered: sUnanswered,
    sessionSubmittedCount: sSubmittedCount,
    sessionCorrectCount: sCorrectCount,
    sessionProgressPct: sProgressPct,
    sessionBarStyle: css({
      width: sProgressPct + "%",
      height: "100%",
      background: "var(--pri)",
      borderRadius: "6px",
      transition: "width .3s",
    }),
    // FLAT answer card (1..N, frozen order, no type grouping).
    sessionCard,
    sessionMarkedCur: sess ? sess.marked.includes(sIndex) : false,
    // EXAM clock + results.
    sessionTime: fmtTime(sRemain ?? sess?.durationSec ?? 0),
    sessionLow: sRemain != null && sRemain < 600,
    sessionRemain: sRemain,
    sessionDurationSec: sess?.durationSec ?? null,
    sessionSubmitted: !!sess?.submitted,
    sessionServerResult: sServer,
    sessionScore100: sServer?.score100 ?? 0,
    sessionExamCorrect: sServer?.correct ?? 0,
    sessionExamWrong: sServer?.wrong ?? 0,
    sessionResultReady: sResultReady,
    // True while the authoritative exam grade is still resolving (or failed) — withhold the score badge.
    sessionServerPending: sServerPending,
    sessionResultRows: sResultRows,
    // Handlers.
    sessionSubmitDo: a.sessionSubmit,
    sessionSelfGradeDo: a.sessionSelfGrade,
    sessionNext: a.sessionNext,
    sessionPrev: a.sessionPrev,
    sessionGoto: a.sessionGoto,
    sessionMark: a.sessionMark,
    sessionFinishDo: a.sessionFinish,
    sessionSubmitExamDo: a.sessionSubmitExam,
    sessionRetryDo: a.sessionRetrySubmit,
    sessionExitDo: a.sessionExit,

    // ========================================================
    //  V2 HUB (§D) — consumed by the rewritten 题库 (hub) screen
    // ========================================================
    browseTree: browse,
    hubTree,
    hubEmpty,
    hubTotal: browse.total,
    hubLaunching: state.sessionLaunching,
    hubLaunchError: state.sessionLaunchError,
    hubStartPractice: (scope: SessionScope) => a.sessionLaunch(scope, "practice"),
    hubStartExam: (scope: SessionScope) => a.sessionLaunch(scope, "exam"),

    // ========================================================
    //  V2 wrongbook/favorites chapter filter + review launch (§E)
    // ========================================================
    wbChapter: state.wbChapter,
    wbChapterOptions,
    wbCanReview,
    wbReviewMode,
    wbStartReview: (mode: "practice" | "exam") => a.wbStartReview(mode),
    wbReviewPractice: () => a.wbStartReview("practice"),
    wbReviewExam: () => a.wbStartReview("exam"),
  };
}

// Two-group filter list (§7.3): objective (8) + subjective (5; cloze disabled/greyed).
function buildTypeList(state: AppState, a: Actions) {
  const OBJECTIVE: QuestionType[] = [
    "single_choice",
    "multiple_choice",
    "true_false",
    "fill_blank",
    "numeric",
    "code_output",
    "ordering",
    "matching",
  ];
  const SUBJECTIVE: QuestionType[] = ["short_answer", "essay", "code_writing", "scenario", "cloze"];
  const boxSty = (on: boolean): CSSProperties => ({
    width: "17px",
    height: "17px",
    borderRadius: "5px",
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: on ? "none" : "1.6px solid #CAD1DE",
    background: on ? "var(--pri)" : "var(--surface)",
    transition: "all .1s",
  });
  const row = (k: QuestionType, group: string) => {
    const disabled = k === "cloze";
    const on = !disabled && !!state.pfTypes[k];
    return {
      k, // ASCII key
      label: TYPE_LABEL[k],
      group,
      on,
      disabled,
      go: () => !disabled && a.toggleType(k),
      box: boxSty(on),
    };
  };
  return [...OBJECTIVE.map((k) => row(k, "客观题")), ...SUBJECTIVE.map((k) => row(k, "主观题"))];
}

export type Vals = ReturnType<typeof computeVals>;

const Ctx = createContext<Vals | null>(null);

export function AppProvider({
  children,
  initialData,
  onSubmitAttempt,
  actions: serverActions,
}: {
  children: ReactNode;
  initialData?: InitialData;
  onSubmitAttempt?: SubmitAttemptFn;
  /** 3b-2: the authenticated Server Actions. When absent, all interactions grade/behave locally. */
  actions?: AppActionsBundle;
}) {
  const [state, setState] = useState<AppState>(() => {
    // AUTHED iff a submit action is wired. In authed mode NOTHING is fabricated: no sample bank, no
    // synthProgress, and an EMPTY exam bank (the server exam flow fills it — no ghost exam). DEMO
    // keeps the built-in sample envelope + synthProgress + local grading, exactly as the prototype.
    const authedInit = !!serverActions?.submitAttempt;
    const bank = initialData?.bank ?? (authedInit ? [] : sampleEnvelope.questions);
    const examBank = authedInit ? [] : initialData?.examBank ?? bank;
    const progress = initialData?.progress ?? (authedInit ? {} : synthProgress(bank));
    // Seed the fav state from the injected progress so stars are correct on first paint (§C fav回填).
    const pFav: Record<string, boolean> = {};
    for (const [id, p] of Object.entries(progress)) if (p?.fav) pFav[id] = true;
    // §F: seed the UI prefs from the persisted server row (authed). Absent (demo / no DB) → the
    // INITIAL defaults, which mirror prefsService.DEFAULT_PREFS so an un-persisted client agrees.
    const prefs = initialData?.preferences ?? null;
    return {
      ...INITIAL,
      user: initialData?.user ?? null,
      entitlement: initialData?.entitlement ?? null,
      stats: initialData?.stats ?? null,
      bank,
      examBank,
      progress,
      pFav,
      bankTotal: initialData?.bankTotal ?? null,
      categories: initialData?.categories ?? [],
      tags: initialData?.tags ?? [],
      homeRecent: initialData?.recentItems ?? [],
      // §G: admin-only avatar-dropdown entry gate (role comes from the session, injected by the RSC).
      isAdmin: initialData?.user?.role === "admin",
      // §D: the data-driven browse tree for the hub (null in demo → the hub shows an empty tree).
      browse: initialData?.browse ?? null,
      // §F: persisted layout / themes / daily goal (fall back to the INITIAL defaults in demo).
      layout: prefs?.layout ?? INITIAL.layout,
      sbTheme: prefs?.sbTheme ?? INITIAL.sbTheme,
      appTheme: prefs?.appTheme ?? INITIAL.appTheme,
      setGoal: prefs?.dailyGoal ?? INITIAL.setGoal,
      // AUTHED default: "all" difficulties (the entry reset-fetch spans the whole published bank);
      // DEMO keeps "medium" so /demo is byte-for-byte unchanged.
      pfDiff: authedInit ? "all" : "medium",
    };
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  // Latest actions (assigned just after the actions useMemo) so timer/keyboard effects call fresh
  // handlers without stale closures.
  const actionsRef = useRef<Actions | null>(null);
  // When the current practice question became visible → the real durationMs at submit (studyMs fix).
  const questionStartRef = useRef<number>(Date.now());

  // AUTHED mode iff a real submit Server Action is wired. Drives §5.4 dual-mode grading AND the whole
  // server-fetch / queue-paging machinery below (demo short-circuits every server effect).
  const serverSubmit = !!serverActions?.submitAttempt;

  const patch = useCallback(
    (p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) =>
      setState((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) })),
    [],
  );

  // Patch the ACTIVE session substate (§C). A no-op when no session is running (guards every session
  // action against a race where the session was exited between an async submit's start and landing).
  const patchSession = useCallback(
    (p: Partial<SessionState> | ((sess: SessionState) => Partial<SessionState>)) =>
      setState((s) =>
        s.session ? { ...s, session: { ...s.session, ...(typeof p === "function" ? p(s.session) : p) } } : s,
      ),
    [],
  );

  // §F prefs persistence: fire-and-forget PATCH to the server (best-effort). No-op in demo (no action).
  const savePrefs = useCallback(
    (p: PreferencesPatch) => {
      const act = serverActions?.savePreferences;
      if (!act) return;
      act(p).catch(() => undefined);
    },
    [serverActions],
  );
  // Debounce the daily-goal save (the stepper fires rapidly) so we don't PATCH on every click.
  const goalSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGoalDebounced = useCallback(
    (goal: number) => {
      if (goalSaveTimer.current) clearTimeout(goalSaveTimer.current);
      goalSaveTimer.current = setTimeout(() => savePrefs({ dailyGoal: goal }), 500);
    },
    [savePrefs],
  );

  // Local (standalone/demo) grade — used only when NO server submit is wired. The demo bank carries
  // answer keys, so grading + reveal are fully functional offline. Always resolves ok:true.
  const localSubmit = useCallback<SubmitAttemptFn>(async (questionId, userAnswer) => {
    const rec = stateRef.current.bank.find((x) => x.id === questionId);
    if (!rec) return { ok: true, result: grade({} as QuestionRecord, userAnswer) };
    const result = grade(rec as QuestionRecord, userAnswer);
    return { ok: true, result, revealed: buildReveal(rec as QuestionRecord) };
  }, []);

  // Submit resolution (§8.1): explicit onSubmitAttempt DI hook → actions.submitAttempt (server-
  // authoritative) → local grade (demo). §B robustness: a server failure returns a DISCRIMINATED
  // {ok:false,error}; we NEVER fabricate a graded/ungraded reveal from a STRIPPED record. pSubmit
  // then withholds pReveal and surfaces pSubmitError. Carries sessionId + measured durationMs.
  const submitFn = useMemo<SubmitAttemptFn>(() => {
    if (onSubmitAttempt) return onSubmitAttempt;
    const serverSubmitAction = serverActions?.submitAttempt;
    if (serverSubmitAction) {
      return async (questionId, userAnswer, opts) => {
        try {
          const res = await serverSubmitAction({
            questionId,
            userAnswer,
            ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
            ...(opts?.durationMs != null ? { durationMs: opts.durationMs } : {}),
          });
          if (res.ok) {
            // Adapt the server RAW-field reveal → the client FRIENDLY AnswerReveal keyed by q.type.
            // Resolve the record's type across EVERY authed bank: a V2 launched session's frozen
            // questions live in state.session.questions (NOT state.bank, which stays the first-paint
            // batch), so a session-scoped question id would otherwise miss → qType undefined →
            // adaptServerReveal's default case drops the answer field → the practice 正确答案 never
            // shows. Mirror runSessionSubmitExam's session-first lookup.
            const rec =
              stateRef.current.session?.questions.find((x) => x.id === questionId) ??
              stateRef.current.bank.find((x) => x.id === questionId) ??
              stateRef.current.examBank.find((x) => x.id === questionId);
            const qType = rec?.type;
            const partTypes =
              qType === "scenario"
                ? Object.fromEntries((rec as ScenarioQ).parts.map((p) => [p.id, p.type]))
                : undefined;
            return {
              ok: true,
              result: res.data.result,
              revealed: adaptServerReveal(res.data.revealed, qType, partTypes),
              attemptId: res.data.attemptId,
            };
          }
          return { ok: false, error: res.error };
        } catch {
          // Network/unknown failure → generic error; NEVER local-grade a stripped record.
          return { ok: false, error: { code: "INTERNAL" } };
        }
      };
    }
    return localSubmit;
  }, [onSubmitAttempt, serverActions, localSubmit]);

  // ---------- practice: server-driven queue (§B) ----------
  // Fetch a batch with the CURRENT filters. reset:true replaces the queue from scratch (cursor null,
  // pIndex 0, drop reveals); reset:false APPENDS the next cursor page (dedup by id). migrate() each
  // question through the version chain (a no-op passthrough for current-version stripped records).
  //
  // EPOCH GUARD: a reset (filter change / restart / screen entry) SUPERSEDES anything in flight —
  // it bumps the epoch and always issues its own fetch, and every response is discarded on landing
  // if a newer epoch exists. Without this, a reset arriving while an append (or older reset) is in
  // flight was silently dropped by the pLoadingBatch guard (queue stuck on the OLD filters), and a
  // stale in-flight page could later be appended into the NEW filter's queue. Only appends keep the
  // in-flight early-return (concurrent appends are genuinely redundant).
  const practiceEpochRef = useRef(0);
  const loadPracticeBatch = useCallback(
    (opts: { reset: boolean }) => {
      const getQ = serverActions?.getQuestionForPractice;
      if (!getQ) return;
      const s = stateRef.current;
      if (opts.reset) {
        practiceEpochRef.current++;
      } else {
        if (s.pLoadingBatch) return;
        if (s.pNoMore || !s.pCursor) return;
      }
      const epoch = practiceEpochRef.current;
      const cursor = opts.reset ? undefined : s.pCursor ?? undefined;
      const filters = buildPracticeFilters(s);
      setState((p) => ({ ...p, pLoadingBatch: true, ...(opts.reset ? { pSubmitError: null } : {}) }));
      getQ({ filters, ...(cursor ? { cursor } : {}), take: PRACTICE_BATCH })
        .then((r) => {
          if (practiceEpochRef.current !== epoch) return; // superseded by a newer reset — drop stale page
          if (!r.ok) {
            setState((p) => ({ ...p, pLoadingBatch: false }));
            return;
          }
          const migrated = r.data.questions.map((qq) => migrate(qq) as PracticeQuestion);
          setState((p) => {
            if (opts.reset) {
              return {
                ...p,
                bank: migrated,
                pCursor: r.data.nextCursor,
                pNoMore: r.data.nextCursor === null,
                pIndex: 0,
                pReveal: {},
                // Cleared with pReveal: stale answers on reloaded ids would re-arm the submit
                // button (the double-submit lock keys off pReveal) → duplicate Attempts.
                pAnswers: {},
                pShowAnalysis: false,
                pLoadingBatch: false,
              };
            }
            const seen = new Set(p.bank.map((x) => x.id));
            const add = migrated.filter((qq) => !seen.has(qq.id));
            return {
              ...p,
              bank: [...p.bank, ...add],
              pCursor: r.data.nextCursor,
              // A page that added nothing new (all dupes) with no cursor → treat as exhausted.
              pNoMore: r.data.nextCursor === null,
              pLoadingBatch: false,
            };
          });
        })
        .catch(() => {
          if (practiceEpochRef.current !== epoch) return; // stale failure must not clear the newer fetch's flag
          setState((p) => ({ ...p, pLoadingBatch: false }));
        });
    },
    [serverActions],
  );

  // ---------- wrongbook / favorites / recent: server lists (§C) ----------
  const wbLoad = useCallback(
    (tab: string, opts: { reset: boolean }) => {
      if (!serverSubmit) return;
      const s = stateRef.current;
      if (s.wbLoading) return;
      const cursor = opts.reset ? undefined : s.wbCursor ?? undefined;
      if (!opts.reset && !cursor) return;
      let req:
        | Promise<ActionResult<{ items: LibraryListItem[]; nextCursor: string | null }>>
        | undefined;
      const cursorArg = cursor ? { cursor } : {};
      // V2 (§E): narrow wrongbook/favorites to the active chapter filter (recent has no chapter arg).
      const chapter = s.wbChapter ?? undefined;
      const chArg = chapter ? { chapter } : {};
      if (tab === "收藏夹" && serverActions?.listFavorites)
        req = serverActions.listFavorites({ ...cursorArg, ...chArg });
      else if (tab === "最近练习" && serverActions?.listRecent) req = serverActions.listRecent(cursorArg);
      else if (serverActions?.listWrongbook) req = serverActions.listWrongbook({ ...cursorArg, ...chArg });
      if (!req) return;
      setState((p) => ({
        ...p,
        wbLoading: true,
        wbError: false,
        ...(opts.reset ? { wbItems: [], wbCursor: null } : {}),
      }));
      req
        .then((r) => {
          if (r.ok) {
            setState((p) => ({
              ...p,
              wbLoading: false,
              wbLoadedTab: tab,
              wbItems: opts.reset ? r.data.items : [...p.wbItems, ...r.data.items],
              wbCursor: r.data.nextCursor,
            }));
          } else {
            setState((p) => ({ ...p, wbLoading: false, wbError: true }));
          }
        })
        .catch(() => setState((p) => ({ ...p, wbLoading: false, wbError: true })));
    },
    [serverActions, serverSubmit],
  );

  const homeRecentLoad = useCallback(() => {
    const act = serverActions?.listRecent;
    if (!act) return;
    act({})
      .then((r) => {
        if (r.ok) setState((p) => ({ ...p, homeRecent: r.data.items }));
      })
      .catch(() => undefined);
  }, [serverActions]);

  // ---------- exam: server session (§D) ----------
  const doStartExam = useCallback(() => {
    const startExam = serverActions?.startExam;
    if (!startExam) return;
    setState((p) => ({ ...p, examStarting: true, examStartError: false }));
    startExam({ count: stateRef.current.examCount })
      .then((r) => {
        if (r.ok) {
          const migrated = r.data.questions.map((qq) => migrate(qq) as PracticeQuestion);
          setState((p) => ({
            ...p,
            examStarting: false,
            examStartError: false,
            examSessionId: r.data.sessionId,
            examBank: migrated,
            examRemain: r.data.remainingSec ?? r.data.durationSec,
            examDurationSec: r.data.durationSec,
            examIndex: 0,
            examAnswers: {},
            examMarked: [],
            examSubmitted: false,
            examServer: null,
            examSubmitError: false,
            examAutoSubmitted: false,
          }));
        } else {
          setState((p) => ({ ...p, examStarting: false, examStartError: true }));
        }
      })
      .catch(() => setState((p) => ({ ...p, examStarting: false, examStartError: true })));
  }, [serverActions]);

  // submitExam → adapt the authoritative whole-exam grade into examServer (§D). On failure keep
  // examServer null + flag examSubmitError so the result screen offers 重试 (examRetrySubmit reuses this).
  const runSubmitExam = useCallback(
    (sid: string) => {
      const submitAct = serverActions?.submitExam;
      if (!submitAct) return;
      submitAct({ sessionId: sid })
        .then((r) => {
          if (r.ok) {
            const typeById = (qid: string) => stateRef.current.examBank.find((x) => x.id === qid)?.type;
            const partTypesById = (qid: string) => {
              const rec = stateRef.current.examBank.find((x) => x.id === qid);
              return rec?.type === "scenario"
                ? Object.fromEntries((rec as ScenarioQ).parts.map((p) => [p.id, p.type]))
                : undefined;
            };
            const adapted = adaptExamSubmit(r.data, typeById, partTypesById);
            setState((prev) => ({ ...prev, examServer: adapted, examSubmitError: false }));
          } else {
            setState((prev) => ({ ...prev, examSubmitError: true }));
          }
        })
        .catch(() => setState((prev) => ({ ...prev, examSubmitError: true })));
    },
    [serverActions],
  );

  // V2 (§C): submitExam for the UNIFIED session → adapt the authoritative whole-exam grade into
  // session.serverResult (mirrors runSubmitExam but writes the session substate). On success the
  // stored exam-resume id is cleared (the session is graded/done); on failure session.submitError is
  // set (the result screen offers 重试 via sessionRetrySubmit). submitting is cleared either way.
  const runSessionSubmitExam = useCallback(
    (sid: string) => {
      const submitAct = serverActions?.submitExam;
      if (!submitAct) return;
      submitAct({ sessionId: sid })
        .then((r) => {
          if (r.ok) {
            const typeById = (qid: string) => stateRef.current.session?.questions.find((x) => x.id === qid)?.type;
            const partTypesById = (qid: string) => {
              const rec = stateRef.current.session?.questions.find((x) => x.id === qid);
              return rec?.type === "scenario"
                ? Object.fromEntries((rec as ScenarioQ).parts.map((p) => [p.id, p.type]))
                : undefined;
            };
            const adapted = adaptExamSubmit(r.data, typeById, partTypesById);
            try {
              localStorage.removeItem("bo_session_exam");
            } catch {}
            setState((prev) =>
              prev.session
                ? {
                    ...prev,
                    session: {
                      ...prev.session,
                      serverResult: adapted,
                      submitError: null,
                      submitting: false,
                      status: "submitted",
                    },
                  }
                : prev,
            );
          } else {
            setState((prev) =>
              prev.session
                ? {
                    ...prev,
                    session: {
                      ...prev.session,
                      submitting: false,
                      submitError: {
                        code: r.error.code,
                        message: mapErrorToMessage(r.error.code, r.error.message),
                      },
                    },
                  }
                : prev,
            );
          }
        })
        .catch(() =>
          setState((prev) =>
            prev.session
              ? {
                  ...prev,
                  session: {
                    ...prev.session,
                    submitting: false,
                    submitError: { code: "INTERNAL", message: mapErrorToMessage("INTERNAL") },
                  },
                }
              : prev,
          ),
        );
    },
    [serverActions],
  );

  // Hydrate the persisted daily goal on mount — DEMO ONLY (§F). In AUTHED mode the goal is seeded from
  // the server UserPreference row (initialData.preferences) and persisted via savePreferences, so the
  // localStorage value is NOT authoritative there (a stale local value must never override the DB).
  useEffect(() => {
    if (serverSubmit) return;
    try {
      const v = localStorage.getItem("bo_daily_goal");
      if (v != null) {
        const n = parseInt(v, 10);
        if (Number.isFinite(n) && n > 0) setState((p) => ({ ...p, setGoal: n }));
      }
    } catch {}
  }, [serverSubmit]);

  // DEMO exam: seed the local countdown from localStorage (authed seeds from the server session).
  useEffect(() => {
    if (serverSubmit) return;
    let r = DEMO_EXAM_SEC;
    try {
      const v = localStorage.getItem("fe_exam_remain");
      if (v != null) r = Math.max(0, parseInt(v, 10) || 0);
    } catch {}
    setState((st) => ({ ...st, examRemain: r }));
  }, [serverSubmit]);

  // V2 EXAM REFRESH-RESUME (§C). A refresh drops the in-memory session, so on mount (authed) we look
  // for a persisted exam session id (bo_session_exam) and rehydrate it via getSessionState — the SAME
  // frozen questions + saved answers + server-authoritative monotonic clock — then land on the session
  // screen. Runs ONCE (guarded) so it never yanks the user back after they deliberately navigate away.
  // Practice needs NO cross-refresh resume (a fresh session is legitimate), so only exam ids are stored.
  const resumeAttemptedRef = useRef(false);
  useEffect(() => {
    if (!serverSubmit || resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;
    const getState = serverActions?.getSessionState;
    if (!getState) return;
    let storedId: string | null = null;
    try {
      storedId = localStorage.getItem("bo_session_exam");
    } catch {}
    if (!storedId) return;
    setState((p) => ({ ...p, sessionResuming: true }));
    getState({ sessionId: storedId })
      .then((r) => {
        if (r.ok && r.data && r.data.mode === "exam" && r.data.status === "active") {
          const data = r.data;
          const migrated = data.questions.map((qq) => migrate(qq) as PracticeQuestion);
          // Rebuild the POSITION-keyed answer sheet from the server's questionId-keyed answers.
          const answersByIdx: Record<number, UserAnswer> = {};
          migrated.forEach((qq, i) => {
            const saved = data.answers[qq.id];
            if (saved) answersByIdx[i] = saved;
          });
          setState((p) => ({
            ...p,
            sessionResuming: false,
            screen: "session",
            session: {
              sessionId: data.sessionId,
              mode: "exam",
              scopeLabel: data.scopeLabel,
              questions: migrated,
              questionIds: data.questionIds,
              index: 0,
              answers: answersByIdx,
              reveals: {},
              marked: [],
              remainingSec: data.remainingSec,
              durationSec: data.durationSec,
              submitted: false,
              serverResult: null,
              submitError: null,
              submitting: false,
              autoSubmitted: false,
              status: "active",
            },
          }));
        } else {
          // Nothing to resume (submitted / expired / not an exam) → drop the stale id, stay on home.
          try {
            localStorage.removeItem("bo_session_exam");
          } catch {}
          setState((p) => ({ ...p, sessionResuming: false }));
        }
      })
      .catch(() => setState((p) => ({ ...p, sessionResuming: false })));
  }, [serverSubmit, serverActions]);

  // Reset the per-question timer whenever the current practice question changes (or on entry) so the
  // measured durationMs reflects only the time THIS question was on screen (§B studyMs fix).
  const curPracticeId = currentPractice(state, serverSubmit).q?.id;
  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [curPracticeId, state.screen]);

  // Start ONE practice StudySession on entry (authed) — its id groups submits + books studyMs.
  useEffect(() => {
    if (!serverSubmit) return;
    const startP = serverActions?.startPractice;
    if (!startP) return;
    if (state.screen !== "practice") return;
    if (state.pSessionId || state.pSessionStarting) return;
    setState((p) => ({ ...p, pSessionStarting: true }));
    startP({ filters: buildPracticeFilters(stateRef.current) })
      .then((r) =>
        setState((p) => ({
          ...p,
          pSessionStarting: false,
          pSessionId: r.ok ? r.data.sessionId : p.pSessionId,
        })),
      )
      .catch(() => setState((p) => ({ ...p, pSessionStarting: false })));
  }, [serverSubmit, serverActions, state.screen, state.pSessionId, state.pSessionStarting]);

  // Refetch the practice queue from scratch on entry AND on any filter change (§B: filters drive the
  // server). The injected batch is only a first paint; this makes the queue match the live filters.
  useEffect(() => {
    if (!serverSubmit) return;
    if (state.screen !== "practice") return;
    loadPracticeBatch({ reset: true });
  }, [serverSubmit, state.screen, state.pfTypes, state.pfDiff, state.pfTags, loadPracticeBatch]);

  // Prefetch the next cursor page as the user approaches the end of the loaded queue (§B).
  useEffect(() => {
    if (!serverSubmit) return;
    if (state.screen !== "practice") return;
    if (state.pLoadingBatch || state.pNoMore || !state.pCursor) return;
    if (state.pIndex >= state.bank.length - 2) loadPracticeBatch({ reset: false });
  }, [
    serverSubmit,
    state.screen,
    state.pIndex,
    state.bank.length,
    state.pLoadingBatch,
    state.pNoMore,
    state.pCursor,
    loadPracticeBatch,
  ]);

  // On entering 模拟面试 (authed) FIRST resume the latest ACTIVE exam (getExamState no-arg) — a refresh
  // restores the SAME session/questions/answers/clock. Only when there is none do we start a fresh
  // exam. Guarded to fire once per session. Demo keeps the local sample exam + local grade.
  useEffect(() => {
    if (!serverSubmit) return;
    if (state.screen !== "interview") return;
    if (state.examSessionId || state.examStarting || state.examResuming || state.examSubmitted) return;
    if (state.examAwaitingStart) return; // pre-start panel is up — the user presses 开始考试
    const getStateAct = serverActions?.getExamState;
    if (!getStateAct) {
      // No resume capability wired → still let the user pick a count before starting.
      setState((p) => ({ ...p, examAwaitingStart: true }));
      return;
    }
    setState((p) => ({ ...p, examResuming: true, examStartError: false }));
    getStateAct({})
      .then((r) => {
        if (r.ok && r.data && r.data.status === "active") {
          const data = r.data;
          const migrated = data.questions.map((qq) => migrate(qq) as PracticeQuestion);
          // Rebuild the index-keyed answer sheet from the server's questionId-keyed answers, in the
          // FROZEN question order.
          const answersByIdx: Record<number, UserAnswer> = {};
          migrated.forEach((qq, i) => {
            const saved = data.answers[qq.id];
            if (saved) answersByIdx[i] = saved;
          });
          setState((p) => ({
            ...p,
            examResuming: false,
            examSessionId: data.sessionId,
            examBank: migrated,
            examAnswers: answersByIdx,
            examRemain: data.remainingSec,
            examDurationSec: data.durationSec,
            examIndex: 0,
            examMarked: [],
            examSubmitted: false,
            examServer: null,
            examSubmitError: false,
            examAutoSubmitted: false,
          }));
        } else {
          // Nothing to resume → hold in the pre-start state so the 题目数量 selector is actually
          // usable; examStart (the 开始考试 button) is what creates the session.
          setState((p) => ({ ...p, examResuming: false, examAwaitingStart: true }));
        }
      })
      .catch(() => {
        setState((p) => ({ ...p, examResuming: false, examAwaitingStart: true }));
      });
  }, [
    serverSubmit,
    serverActions,
    state.screen,
    state.examSessionId,
    state.examStarting,
    state.examResuming,
    state.examSubmitted,
    state.examAwaitingStart,
    doStartExam,
  ]);

  // Countdown. AUTHED: server remainingSec is the baseline; ticks locally; at 0 with a live session →
  // AUTO-SUBMIT exactly once (examAutoSubmitted guard). DEMO: the local timer persisted to
  // localStorage exactly as the prototype (never auto-submits).
  useEffect(() => {
    const timer = setInterval(() => {
      const s = stateRef.current;
      // V2 unified session exam countdown (§C): tick session.remainingSec locally; AUTO-SUBMIT once at
      // 0 (autoSubmitted guard). The clock is UX-only (the server clamps monotonically on save + on
      // getSessionState resume), so it is NOT persisted to localStorage. Runs only on the session screen.
      const sess = s.session;
      if (s.screen === "session" && sess && sess.mode === "exam" && !sess.submitted) {
        if (sess.remainingSec == null) return;
        const nr = Math.max(0, sess.remainingSec - 1);
        setState((p) => (p.session ? { ...p, session: { ...p.session, remainingSec: nr } } : p));
        if (nr === 0 && !sess.autoSubmitted) {
          setState((p) => (p.session ? { ...p, session: { ...p.session, autoSubmitted: true } } : p));
          actionsRef.current?.sessionSubmitExam();
        }
        return;
      }
      if (s.screen !== "interview" || s.examSubmitted) return;
      if (serverSubmit) {
        if (s.examRemain == null) return; // not yet seeded from the server
        const nr = Math.max(0, s.examRemain - 1);
        setState((p) => ({ ...p, examRemain: nr }));
        if (nr === 0 && s.examSessionId && !s.examAutoSubmitted) {
          setState((p) => ({ ...p, examAutoSubmitted: true }));
          actionsRef.current?.examSubmit();
        }
      } else {
        const nr = Math.max(0, (s.examRemain == null ? DEMO_EXAM_SEC : s.examRemain) - 1);
        try {
          localStorage.setItem("fe_exam_remain", String(nr));
        } catch {}
        setState((p) => ({ ...p, examRemain: nr }));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [serverSubmit]);

  // Fetch the current wrongbook/favorites/recent tab on entry + on tab change (authed). wbLoadedTab
  // (set only on SUCCESS) guards against redundant refetches; a failed fetch leaves it null, so the
  // fetch retries on the next entry/tab-change rather than looping (wbError is NOT a refetch trigger).
  useEffect(() => {
    if (!serverSubmit) return;
    if (state.screen !== "wrongbook" && state.screen !== "favorites") return;
    if (state.wbLoadedTab === state.wbTab) return;
    wbLoad(state.wbTab, { reset: true });
  }, [serverSubmit, state.screen, state.wbTab, state.wbLoadedTab, wbLoad]);

  // Refresh the home 最近练习 card whenever navigating to home (authed). Seeded from initialData.
  useEffect(() => {
    if (!serverSubmit) return;
    if (state.screen !== "home") return;
    homeRecentLoad();
  }, [serverSubmit, state.screen, homeRecentLoad]);

  // Global shortcuts (§B/§G): Cmd/Ctrl+1..6 → the V2 6 nav screens; on the answering screen (or the
  // legacy practice screen) Enter=submit, →=next, ←=prev. Skipped while focus is in an input/textarea/
  // contentEditable. The nav map is the 6-item V2 set (刷题/模拟面试 merged into the 题库 hub).
  useEffect(() => {
    const NAV: ScreenKey[] = ["home", "qbank", "wrongbook", "favorites", "stats", "settings"];
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const inField = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !inField) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= NAV.length) {
          e.preventDefault();
          actionsRef.current?.go(NAV[n - 1]);
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || inField) return;
      const screen = stateRef.current.screen;
      // V2 unified session screen: Enter submits the current PRACTICE question; arrows navigate.
      if (screen === "session") {
        const s = stateRef.current;
        const sess = s.session;
        if (!sess) return;
        if (e.key === "Enter") {
          const q = sess.questions[sess.index];
          if (
            sess.mode === "practice" &&
            q &&
            sess.answers[sess.index] &&
            !sess.reveals[q.id] &&
            !sess.submitting
          ) {
            e.preventDefault();
            actionsRef.current?.sessionSubmit();
          }
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          actionsRef.current?.sessionNext();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          actionsRef.current?.sessionPrev();
        }
        return;
      }
      // Legacy practice screen (no nav routes here in V2, kept working for the un-migrated screen).
      if (screen !== "practice") return;
      if (e.key === "Enter") {
        const s = stateRef.current;
        const { q } = currentPractice(s, serverSubmit);
        if (q && s.pAnswers[q.id] && !s.pReveal[q.id] && !s.pSubmitting) {
          e.preventDefault();
          actionsRef.current?.pSubmit();
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        actionsRef.current?.pNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        actionsRef.current?.pPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [serverSubmit]);

  const actions = useMemo<Actions>(
    () => ({
      go: (k) =>
        patch(() => {
          const st: Partial<AppState> = { screen: k };
          if (k === "wrongbook") st.wbTab = "错题本";
          if (k === "favorites") st.wbTab = "收藏夹";
          return st;
        }),
      // §F: the appearance toggles ALSO persist to the server row (fire-and-forget; no-op in demo).
      // Compute the next value off stateRef (not inside the setState updater) so savePrefs is called
      // exactly once with the new value — no side effect inside the reducer (StrictMode-safe).
      toggleLayout: () => {
        const next: "sidebar" | "top" = stateRef.current.layout === "sidebar" ? "top" : "sidebar";
        patch({ layout: next });
        savePrefs({ layout: next });
      },
      toggleTheme: () => {
        const next: ThemeMode = stateRef.current.sbTheme === "dark" ? "light" : "dark";
        patch({ sbTheme: next });
        savePrefs({ sbTheme: next });
      },
      toggleAppTheme: () => {
        const next: ThemeMode = stateRef.current.appTheme === "dark" ? "light" : "dark";
        patch({ appTheme: next });
        savePrefs({ appTheme: next });
      },
      toggleCollapse: () => patch((s) => ({ collapsed: !s.collapsed })),
      openNav: () => patch({ mobileNav: true }),
      closeNav: () => patch({ mobileNav: false }),

      // practice
      pAnswer: (ans) =>
        patch((s) => {
          const { q } = currentPractice(s, serverSubmit);
          if (!q) return {};
          // Clear any inline submit error — the answer changed, so a retry starts clean.
          return { pAnswers: { ...s.pAnswers, [q.id]: ans }, pSubmitError: null };
        }),
      pSubmit: () => {
        const s = stateRef.current;
        const { q } = currentPractice(s, serverSubmit);
        if (!q) return;
        const ans = s.pAnswers[q.id];
        if (!ans) return;
        if (s.pReveal[q.id]) return; // already submitted → no re-submit (no double quota / no overwrite)
        if (s.pSubmitting) return; // a submit is in flight
        patch({ pSubmitting: true, pSubmitError: null });
        // Measured time on this question → real durationMs (books studyMs server-side, §B).
        const durationMs = Math.max(0, Date.now() - questionStartRef.current);
        submitFn(q.id, ans, { sessionId: s.pSessionId ?? undefined, durationMs })
          .then((outcome) => {
            if (outcome.ok) {
              const { result, revealed, attemptId } = outcome;
              setState((prev) => {
                const prevP = prev.progress[q.id] ?? {};
                const isCorrect = result.status === "correct";
                const isWrong = result.status === "incorrect";
                const nextP: ProgressLite = {
                  ...prevP,
                  attempts: (prevP.attempts ?? 0) + 1,
                  correctCount: (prevP.correctCount ?? 0) + (isCorrect ? 1 : 0),
                  wrongCount: (prevP.wrongCount ?? 0) + (isWrong ? 1 : 0),
                  lastScore: result.score,
                  lastStatus: result.status,
                  lastAt: Date.now(),
                  lastAnswer: ans,
                };
                return {
                  ...prev,
                  progress: { ...prev.progress, [q.id]: nextP },
                  pReveal: { ...prev.pReveal, [q.id]: { result, revealed, attemptId } },
                  pShowAnalysis: true,
                  pSubmitting: false,
                  pSubmitError: null,
                  pAnsweredCount: prev.pAnsweredCount + 1,
                };
              });
            } else {
              // FAILURE (§B): do NOT write pReveal, do NOT open analysis; the answer stays editable and
              // an inline error + retry is surfaced (PAYMENT_REQUIRED routes to the paywall via .code).
              setState((prev) => ({
                ...prev,
                pSubmitting: false,
                pSubmitError: {
                  code: outcome.error.code,
                  message: mapErrorToMessage(outcome.error.code, outcome.error.message),
                },
              }));
            }
          })
          .catch(() =>
            setState((prev) => ({
              ...prev,
              pSubmitting: false,
              pSubmitError: { code: "INTERNAL", message: mapErrorToMessage("INTERNAL") },
            })),
          );
      },
      pSelfGrade: (score, ticks) => {
        const s = stateRef.current;
        const { q } = currentPractice(s, serverSubmit);
        if (!q) return;
        const attemptId = s.pReveal[q.id]?.attemptId;
        const selfAct = serverActions?.selfGradeAttempt;

        // AUTHED (§5.4 / invariant #4): a subjective attempt already exists (submitted → attemptId).
        // Persist the self score server-side (independent selfScore column) and fold the returned
        // result back into pReveal. Optimistically record the self answer for the active button state.
        if (serverSubmit && selfAct && attemptId) {
          selfAct({ attemptId, selfScore: score, ...(ticks ? { rubricTicks: ticks } : {}) })
            .then((r) => {
              if (r.ok) {
                setState((prev) => {
                  const cur = prev.pReveal[q.id];
                  if (!cur) return prev;
                  return {
                    ...prev,
                    pReveal: { ...prev.pReveal, [q.id]: { ...cur, result: r.data.result } },
                  };
                });
              }
            })
            .catch(() => undefined);
        }

        const ans: UserAnswer = { kind: "self", selfScore: score, ...(ticks ? { rubricTicks: ticks } : {}) };
        setState((prev) => ({ ...prev, pAnswers: { ...prev.pAnswers, [q.id]: ans } }));
      },
      pMove: (id, dir) =>
        patch((s) => {
          const { q } = currentPractice(s, serverSubmit);
          if (!q || q.type !== "ordering") return {};
          const items = (q as OrderingQ).items;
          const prev = s.pAnswers[q.id];
          const cur =
            prev?.kind === "order" && prev.order.length === items.length
              ? prev.order.slice()
              : items.map((it) => it.id);
          const i = cur.indexOf(id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= cur.length) return {};
          [cur[i], cur[j]] = [cur[j], cur[i]];
          return { pAnswers: { ...s.pAnswers, [q.id]: { kind: "order", order: cur } } };
        }),
      pToggleFav: (id) => {
        const toggle = serverActions?.toggleFavorite;
        if (serverSubmit && toggle) {
          // Optimistic flip; the server's authoritative {fav} wins; revert on error (§C).
          patch((s) => ({ pFav: { ...s.pFav, [id]: !s.pFav[id] }, wbItems: flipFavById(s.wbItems, id) }));
          toggle({ questionId: id })
            .then((r) => {
              if (r.ok) {
                setState((s) => {
                  let wbItems = setFavById(s.wbItems, id, r.data.fav);
                  if (s.wbTab === "收藏夹" && !r.data.fav) wbItems = wbItems.filter((x) => x.id !== id);
                  return { ...s, pFav: { ...s.pFav, [id]: r.data.fav }, wbItems };
                });
              } else {
                patch((s) => ({ pFav: { ...s.pFav, [id]: !s.pFav[id] }, wbItems: flipFavById(s.wbItems, id) }));
              }
            })
            .catch(() =>
              patch((s) => ({ pFav: { ...s.pFav, [id]: !s.pFav[id] }, wbItems: flipFavById(s.wbItems, id) })),
            );
          return;
        }
        // Demo: local optimistic toggle (no server).
        patch((s) => ({
          pFav: { ...s.pFav, [id]: !s.pFav[id] },
          progress: { ...s.progress, [id]: { ...(s.progress[id] ?? {}), fav: !(s.progress[id]?.fav) } },
        }));
      },
      pNext: () =>
        patch((s) => {
          const { q } = currentPractice(s, serverSubmit);
          const next: Partial<AppState> = { pShowAnalysis: false, pSubmitError: null };
          if (serverSubmit) {
            // Advance within the loaded queue. While more pages may exist (!pNoMore) clamp at the
            // last item (the paging effect fetches more); once the server said no-more, allow ONE
            // step past the end (pIndex === bank.length) — that past-the-end position is what flips
            // pExhausted, so the final question itself stays answerable (firing at length-1 masked
            // it and deadlocked single-question filters). KEEP pReveal so a submitted question
            // stays graded/locked (no re-submit / re-quota on return).
            next.pIndex = Math.min(s.pIndex + 1, Math.max(0, s.bank.length - (s.pNoMore ? 0 : 1)));
          } else {
            // Demo: modulo wrap (handled in currentPractice); clear the current reveal so a cycled-back
            // sample question re-practices ungraded (prototype parity).
            next.pIndex = s.pIndex + 1;
            if (q && s.pReveal[q.id]) {
              const { [q.id]: _drop, ...rest } = s.pReveal;
              next.pReveal = rest;
            }
          }
          return next;
        }),
      pPrev: () =>
        patch((s) => ({ pIndex: Math.max(0, s.pIndex - 1), pShowAnalysis: false, pSubmitError: null })),
      pRestart: () => {
        if (!serverSubmit) {
          patch({ pIndex: 0, pShowAnalysis: false, pSubmitError: null });
          return;
        }
        // pAnswers is cleared WITH pReveal: pSubmit's double-submit lock keys off pReveal, so a
        // restart that kept the old answers would render them pre-filled and re-submittable
        // (duplicate Attempt rows + double-counted stats) once the same question ids reload.
        patch({ pIndex: 0, pCursor: null, pNoMore: false, pReveal: {}, pAnswers: {}, pShowAnalysis: false, pSubmitError: null });
        loadPracticeBatch({ reset: true });
      },
      pToggleAna: () => patch((s) => ({ pShowAnalysis: !s.pShowAnalysis })),

      // exam
      examAnswer: (ans) => {
        // AUTHED (blocker #2): persist each answer server-side best-effort (survives refresh, and
        // is the row submitExam grades). Fire-and-forget so the UI stays responsive; a save failure
        // (incl. a post-deadline EXAM_EXPIRED rejection) never blocks local answering. Demo skips.
        const s0 = stateRef.current;
        const saveAct = serverActions?.saveExamAnswer;
        if (saveAct && s0.examSessionId) {
          const eq = s0.examBank[Math.min(s0.examIndex, Math.max(0, s0.examBank.length - 1))];
          if (eq) {
            saveAct({
              sessionId: s0.examSessionId,
              questionId: eq.id,
              userAnswer: ans,
              remainingSec: Math.max(0, s0.examRemain ?? 0),
            }).catch(() => undefined);
          }
        }
        patch((s) => ({ examAnswers: { ...s.examAnswers, [s.examIndex]: ans } }));
      },
      examGo: (i) => patch({ examIndex: i }),
      examStep: (d) =>
        patch((s) => ({
          examIndex: Math.min(Math.max(0, s.examBank.length - 1), Math.max(0, s.examIndex + d)),
        })),
      examMark: () =>
        patch((s) => {
          const i2 = s.examIndex;
          const m = s.examMarked.slice();
          const i = m.indexOf(i2);
          if (i >= 0) m.splice(i, 1);
          else m.push(i2);
          return { examMarked: m };
        }),
      examSubmit: () => {
        // §D dual-mode.
        //   AUTHED: submitExam is the AUTHORITATIVE grader. We mark submitted, then adapt the server
        //     result into examServer (runSubmitExam). On failure → examSubmitError (screen offers
        //     重试), NEVER a fabricated 0/100. A start-failed session (no sid) does NOT flip submitted
        //     — it just flags the error so the screen doesn't dead-end in a永远「评分中」 (audit P2).
        //   DEMO: no server session → computeVals local-grades the full sample bank as before.
        const s = stateRef.current;
        const sid = s.examSessionId;
        if (serverSubmit) {
          if (!sid || !serverActions?.submitExam) {
            patch({ examSubmitError: true });
            return;
          }
          patch({ examSubmitted: true, examServer: null, examSubmitError: false });
          runSubmitExam(sid);
          return;
        }
        patch({ examSubmitted: true });
      },
      examRetrySubmit: () => {
        const s = stateRef.current;
        const sid = s.examSessionId;
        if (!(serverSubmit && sid && serverActions?.submitExam)) return;
        patch({ examServer: null, examSubmitError: false });
        runSubmitExam(sid);
      },
      examStart: () => {
        // The 开始考试 button on the pre-start panel: leaves awaiting mode and creates the session
        // with the user-chosen examCount.
        if (stateRef.current.examSessionId || stateRef.current.examStarting) return;
        patch({ examAwaitingStart: false });
        doStartExam();
      },
      examReset: () => {
        if (serverSubmit) {
          // Clear the whole server lifecycle; the entry effect then resumes an active session if
          // one exists, or lands back on the pre-start panel (count selector + 开始考试). Empty the
          // bank so no ghost exam shows in the gap. The clock reseeds from the next session.
          patch({
            examSubmitted: false,
            examRemain: null,
            examDurationSec: null,
            examIndex: 0,
            examAnswers: {},
            examMarked: [],
            examBank: [],
            examSessionId: null,
            examStarting: false,
            examResuming: false,
            examAwaitingStart: false,
            examStartError: false,
            examServer: null,
            examSubmitError: false,
            examAutoSubmitted: false,
          });
          return;
        }
        const r = DEMO_EXAM_SEC;
        try {
          localStorage.setItem("fe_exam_remain", String(r));
        } catch {}
        patch({ examSubmitted: false, examRemain: r, examIndex: 0, examAnswers: {}, examMarked: [] });
      },
      setExamCount: (n) => {
        if (stateRef.current.examSessionId) return; // only before a session exists (server clamps to bank)
        patch({ examCount: Math.max(1, Math.min(200, Math.round(n))) });
      },

      // ---------- V2 unified session (§C) ----------
      // Launch a practice/exam session over a data-driven scope. AUTHED-ONLY (no startSession action in
      // demo → no-op, so the demo 题库/刷题/面试 keep their current behavior). Migrates the frozen
      // questions, seeds the session substate, and navigates to the answering screen. Exam persists its
      // sessionId to localStorage for refresh-resume; any launch first clears a stale stored exam id.
      sessionLaunch: (scope, mode) => {
        const startAct = serverActions?.startSession;
        if (!startAct) return;
        if (stateRef.current.sessionLaunching) return; // guard a double-launch
        try {
          localStorage.removeItem("bo_session_exam");
        } catch {}
        patch({ sessionLaunching: true, sessionLaunchError: null });
        startAct({ mode, scope })
          .then((r) => {
            if (r.ok) {
              const migrated = r.data.questions.map((qq) => migrate(qq) as PracticeQuestion);
              if (r.data.mode === "exam") {
                try {
                  localStorage.setItem("bo_session_exam", r.data.sessionId);
                } catch {}
              }
              setState((p) => ({
                ...p,
                sessionLaunching: false,
                sessionLaunchError: null,
                screen: "session",
                session: {
                  sessionId: r.data.sessionId,
                  mode: r.data.mode,
                  scopeLabel: r.data.scopeLabel,
                  questions: migrated,
                  questionIds: r.data.questionIds,
                  index: 0,
                  answers: {},
                  reveals: {},
                  marked: [],
                  remainingSec: r.data.remainingSec,
                  durationSec: r.data.durationSec,
                  submitted: false,
                  serverResult: null,
                  submitError: null,
                  submitting: false,
                  autoSubmitted: false,
                  status: "active",
                },
              }));
            } else {
              // Empty scope (VALIDATION) surfaces the precise server message; other codes map friendly.
              const message =
                r.error.code === "VALIDATION"
                  ? r.error.message || "该范围暂无可用题目。"
                  : mapErrorToMessage(r.error.code, r.error.message);
              patch({ sessionLaunching: false, sessionLaunchError: { code: r.error.code, message } });
            }
          })
          .catch(() =>
            patch({
              sessionLaunching: false,
              sessionLaunchError: { code: "INTERNAL", message: mapErrorToMessage("INTERNAL") },
            }),
          );
      },
      sessionAnswer: (ans) => {
        const s = stateRef.current;
        const sess = s.session;
        if (!sess) return;
        const q = sess.questions[sess.index];
        if (!q) return;
        // A submitted practice question is locked — ignore further edits (no re-submit / re-quota).
        if (sess.mode === "practice" && sess.reveals[q.id]) return;
        // EXAM: persist each answer server-side best-effort (survives refresh; the row submitExam
        // grades). Fire-and-forget so a save failure (incl. post-deadline EXAM_EXPIRED) never blocks
        // local answering. Practice grades per-question on submit, so nothing is saved here.
        if (sess.mode === "exam") {
          const saveAct = serverActions?.saveExamAnswer;
          if (saveAct) {
            saveAct({
              sessionId: sess.sessionId,
              questionId: q.id,
              userAnswer: ans,
              remainingSec: Math.max(0, sess.remainingSec ?? 0),
            }).catch(() => undefined);
          }
        }
        patchSession((cur) => ({ answers: { ...cur.answers, [cur.index]: ans }, submitError: null }));
      },
      sessionSubmit: () => {
        // PRACTICE per-question submit (server-authoritative grade + reveal). Locks the question,
        // opens the analysis, counts one toward today's goal. On failure → inline submitError (no fake
        // grade, answer stays editable). A no-op for exam (exam submits all at once via 交卷).
        const s = stateRef.current;
        const sess = s.session;
        if (!sess || sess.mode !== "practice") return;
        const q = sess.questions[sess.index];
        if (!q) return;
        const ans = sess.answers[sess.index];
        if (!ans) return;
        if (sess.reveals[q.id]) return; // already submitted → locked
        if (sess.submitting) return;
        patchSession({ submitting: true, submitError: null });
        const durationMs = Math.max(0, Date.now() - questionStartRef.current);
        submitFn(q.id, ans, { sessionId: sess.sessionId, durationMs })
          .then((outcome) => {
            if (outcome.ok) {
              const { result, revealed, attemptId } = outcome;
              setState((prev) => {
                if (!prev.session) return prev;
                return {
                  ...prev,
                  // Overlay this session's submits so the daily-goal口径 matches practice/home/stats.
                  pAnsweredCount: prev.pAnsweredCount + 1,
                  session: {
                    ...prev.session,
                    reveals: { ...prev.session.reveals, [q.id]: { result, revealed, attemptId } },
                    submitting: false,
                    submitError: null,
                  },
                };
              });
            } else {
              patchSession({
                submitting: false,
                submitError: {
                  code: outcome.error.code,
                  message: mapErrorToMessage(outcome.error.code, outcome.error.message),
                },
              });
            }
          })
          .catch(() =>
            patchSession({
              submitting: false,
              submitError: { code: "INTERNAL", message: mapErrorToMessage("INTERNAL") },
            }),
          );
      },
      sessionSelfGrade: (score, ticks) => {
        // Subjective self-assessment for the current practice question (mirrors pSelfGrade, §5.4 /
        // invariant #4): persist the self score server-side (independent selfScore column) via the
        // already-created attempt, fold the returned result back into the session reveal, and record
        // the self answer for the active button state.
        const s = stateRef.current;
        const sess = s.session;
        if (!sess) return;
        const q = sess.questions[sess.index];
        if (!q) return;
        const attemptId = sess.reveals[q.id]?.attemptId;
        const selfAct = serverActions?.selfGradeAttempt;
        if (selfAct && attemptId) {
          selfAct({ attemptId, selfScore: score, ...(ticks ? { rubricTicks: ticks } : {}) })
            .then((r) => {
              if (r.ok) {
                setState((prev) => {
                  if (!prev.session) return prev;
                  const cur = prev.session.reveals[q.id];
                  if (!cur) return prev;
                  return {
                    ...prev,
                    session: {
                      ...prev.session,
                      reveals: { ...prev.session.reveals, [q.id]: { ...cur, result: r.data.result } },
                    },
                  };
                });
              }
            })
            .catch(() => undefined);
        }
        const ans: UserAnswer = { kind: "self", selfScore: score, ...(ticks ? { rubricTicks: ticks } : {}) };
        patchSession((cur) => ({ answers: { ...cur.answers, [cur.index]: ans } }));
      },
      sessionNext: () =>
        patchSession((cur) => ({
          index: Math.min(cur.index + 1, Math.max(0, cur.questions.length - 1)),
        })),
      sessionPrev: () => patchSession((cur) => ({ index: Math.max(0, cur.index - 1) })),
      sessionGoto: (i) =>
        patchSession((cur) => ({ index: Math.min(Math.max(0, i), Math.max(0, cur.questions.length - 1)) })),
      sessionMark: () =>
        patchSession((cur) => {
          const m = cur.marked.slice();
          const at = m.indexOf(cur.index);
          if (at >= 0) m.splice(at, 1);
          else m.push(cur.index);
          return { marked: m };
        }),
      sessionFinish: () => patchSession({ submitted: true }), // practice: show the 本轮完成 summary
      sessionSubmitExam: () => {
        // EXAM 交卷 (submit-all). submitExam is the AUTHORITATIVE grader; the whole-exam result lands in
        // session.serverResult (runSessionSubmitExam). On failure → session.submitError (retry offered),
        // NEVER a fabricated 0/100.
        const s = stateRef.current;
        const sess = s.session;
        if (!sess || sess.mode !== "exam") return;
        if (!serverActions?.submitExam) {
          patchSession({ submitError: { code: "INTERNAL", message: mapErrorToMessage("INTERNAL") } });
          return;
        }
        patchSession({ submitted: true, submitting: true, serverResult: null, submitError: null });
        runSessionSubmitExam(sess.sessionId);
      },
      sessionRetrySubmit: () => {
        const s = stateRef.current;
        const sess = s.session;
        if (!sess || sess.mode !== "exam" || !serverActions?.submitExam) return;
        patchSession({ submitting: true, serverResult: null, submitError: null });
        runSessionSubmitExam(sess.sessionId);
      },
      sessionExit: () => {
        // Leave the session → back to the hub. Clear the stored exam-resume id (the run is abandoned or
        // finished) so a later refresh doesn't rehydrate it.
        try {
          localStorage.removeItem("bo_session_exam");
        } catch {}
        patch({ session: null, sessionLaunchError: null, screen: "qbank" });
      },

      // wrongbook / favorites / recent
      // A tab switch resets the chapter filter too (chapters differ per tab; a stale filter would hide rows).
      wbSetTab: (t) =>
        patch({ wbTab: t, wbPage: 1, wbItems: [], wbCursor: null, wbLoadedTab: null, wbChapter: null }),
      wbGo: (n) => patch({ wbPage: n }),
      wbLoadMore: () => {
        const s = stateRef.current;
        if (!serverSubmit || !s.wbCursor || s.wbLoading) return;
        wbLoad(s.wbTab, { reset: false });
      },
      // V2 (§E): set the chapter filter and refetch. Clearing wbLoadedTab re-arms the entry/refetch
      // effect (which reads the new wbChapter from stateRef), so the list reloads narrowed to `chapter`.
      wbSetChapter: (chapter) => patch({ wbChapter: chapter, wbItems: [], wbCursor: null, wbLoadedTab: null }),
      // V2 (§E): launch a review SESSION over the active tab's scope (wrong/favorites), honoring the
      // chapter filter. AUTHED-ONLY (sessionLaunch is a no-op in demo).
      wbStartReview: (mode) => {
        const s = stateRef.current;
        const chapter = s.wbChapter ?? undefined;
        const scope: SessionScope =
          s.wbTab === "收藏夹"
            ? { kind: "favorites", ...(chapter ? { chapter } : {}) }
            : { kind: "wrong", ...(chapter ? { chapter } : {}) };
        actionsRef.current?.sessionLaunch(scope, mode);
      },
      toggleFav: (id) => {
        const toggle = serverActions?.toggleFavorite;
        if (serverSubmit && toggle) {
          // Optimistic flip; the server's authoritative {fav} wins; on the 收藏夹 tab an un-faved row
          // is removed; revert on error (§C).
          patch((s) => ({ wbItems: flipFavById(s.wbItems, id), pFav: { ...s.pFav, [id]: !s.pFav[id] } }));
          toggle({ questionId: id })
            .then((r) => {
              if (r.ok) {
                setState((s) => {
                  let wbItems = setFavById(s.wbItems, id, r.data.fav);
                  if (s.wbTab === "收藏夹" && !r.data.fav) wbItems = wbItems.filter((x) => x.id !== id);
                  return { ...s, wbItems, pFav: { ...s.pFav, [id]: r.data.fav } };
                });
              } else {
                patch((s) => ({ wbItems: flipFavById(s.wbItems, id), pFav: { ...s.pFav, [id]: !s.pFav[id] } }));
              }
            })
            .catch(() =>
              patch((s) => ({ wbItems: flipFavById(s.wbItems, id), pFav: { ...s.pFav, [id]: !s.pFav[id] } })),
            );
          return;
        }
        // Demo: local optimistic star.
        patch((s) => ({ wbFav: { ...s.wbFav, [id]: !s.wbFav[id] } }));
      },
      wbMaster: (id) => {
        // 「标记已掌握」 (wrongbook tab only). masterWrong → remove the row on success (§C).
        const master = serverActions?.masterWrong;
        if (!(serverSubmit && master)) return;
        master({ questionId: id })
          .then((r) => {
            if (r.ok) setState((s) => ({ ...s, wbItems: s.wbItems.filter((x) => x.id !== id) }));
          })
          .catch(() => undefined);
      },

      // filters (a change refetches the practice queue from scratch via the reset-fetch effect, §B)
      toggleType: (t) => patch((s) => ({ pfTypes: { ...s.pfTypes, [t]: !s.pfTypes[t] } })),
      setDiff: (d) => patch({ pfDiff: d }),
      toggleTag: (t) => patch((s) => ({ pfTags: { ...s.pfTags, [t]: !s.pfTags[t] } })),
      toggleCompany: () => patch((s) => ({ pfCompany: !s.pfCompany })),
      resetFilters: () =>
        patch({
          pfTypes: { ...INITIAL_PF_TYPES },
          pfDiff: serverSubmit ? "all" : "medium",
          pfTags: {},
          pfCompany: false,
        }),

      // settings — §F: AUTHED persists to the server row (debounced; the stepper fires fast); DEMO keeps
      // the localStorage default. localStorage is NOT written in authed mode (the DB is authoritative).
      setGoal: (n) => {
        const val = Math.max(5, Math.min(500, Math.round(n)));
        patch({ setGoal: val });
        if (serverSubmit) {
          saveGoalDebounced(val);
        } else {
          try {
            localStorage.setItem("bo_daily_goal", String(val));
          } catch {}
        }
      },
      updateUserName: (name) => patch((s) => ({ user: { ...(s.user ?? {}), name } })),

      // qbank
      importPaste: (text) => {
        let report: ImportReport | null = null;
        let notice = "";
        try {
          report = validateEnvelope(JSON.parse(text));
        } catch {
          notice = "无法解析 JSON，请检查格式。";
        }
        patch({ qbankPasteText: text, qbankReport: report, qbankNotice: notice });
      },
      importFile: (file) => {
        file
          .text()
          .then((txt) => {
            let report: ImportReport | null = null;
            let notice = "";
            try {
              report = validateEnvelope(JSON.parse(txt));
            } catch {
              notice = "无法解析文件为 JSON。";
            }
            patch({ qbankPasteText: txt, qbankReport: report, qbankNotice: notice });
          })
          .catch(() => patch({ qbankNotice: "读取文件失败。" }));
      },
      confirmImport: () =>
        patch((s) => {
          const rep = s.qbankReport;
          if (!rep || !rep.fileOk || rep.accepted.length === 0) return {};
          // The qbank import screen is a demo/standalone feature (authed admin import goes through
          // server actions). rep.accepted are full QuestionRecords; merge them into the bank.
          let nextBank: PracticeQuestion[];
          if (s.qbankMergeMode === "replace") {
            nextBank = rep.accepted.slice();
          } else {
            const byId = new Map<string, PracticeQuestion>(s.bank.map((q) => [q.id, q]));
            for (const q of rep.accepted) byId.set(q.id, q);
            nextBank = [...byId.values()];
          }
          return {
            bank: nextBank,
            qbankReport: null,
            qbankPasteText: "",
            qbankNotice: `已${s.qbankMergeMode === "replace" ? "替换" : "合并"}导入 ${rep.accepted.length} 题，题库共 ${nextBank.length} 题。`,
          };
        }),
      exportBank: () => {
        // Demo/standalone export (authed export is an admin server route). The demo bank holds full
        // records; cast for the envelope builder. (A stripped bank would never reach this button in
        // a meaningful admin flow.)
        const s = stateRef.current;
        const env = buildEnvelope(
          s.bank as QuestionRecord[],
          { title: "ByteOffer 题库导出", locale: "zh-CN" },
          new Date().toISOString(),
        );
        downloadJson(envelopeToJson(env), `byteoffer-qbank-${ymd()}.json`);
      },
      downloadSample: () => {
        downloadJson(envelopeToJson(sampleEnvelope), "byteoffer-qbank-sample.json");
      },
      downloadSchema: () => {
        // Fetch the static schema and stream it down (client component owns the DOM download).
        fetch("/qbank.schema.json")
          .then((r) => r.text())
          .then((txt) => downloadJson(txt, "qbank.schema.json"))
          .catch(() => patch({ qbankNotice: "下载 Schema 失败。" }));
      },
      setMergeMode: (m) => patch({ qbankMergeMode: m }),
    }),
    [patch, submitFn, serverActions, serverSubmit, loadPracticeBatch, wbLoad, runSubmitExam, doStartExam],
  );
  // Latest actions for the timer/keyboard effects (which call handlers from a long-lived closure).
  actionsRef.current = actions;

  const vals = useMemo(() => computeVals(state, actions, serverSubmit), [state, actions, serverSubmit]);

  const themeVars = useMemo(
    () => computeThemeVars(state.primaryColor, state.sbTheme, state.appTheme),
    [state.primaryColor, state.sbTheme, state.appTheme],
  );

  return (
    <Ctx.Provider value={vals}>
      <div
        className="bo-th"
        style={{
          ...(themeVars as unknown as CSSProperties),
          display: "flex",
          height: "100vh",
          width: "100%",
          overflow: "hidden",
          color: "var(--ink)",
          fontSize: "14px",
        }}
      >
        {children}
      </div>
    </Ctx.Provider>
  );
}

// ---------- reveal projection (standalone: expose the answer key after local grading) ----------
function buildReveal(q: QuestionRecord): AnswerReveal {
  const r: AnswerReveal = {};
  switch (q.type) {
    case "single_choice":
      r.answer = q.answer;
      break;
    case "multiple_choice":
      r.answers = q.answer;
      break;
    case "true_false":
      r.boolean = q.answer;
      break;
    case "fill_blank":
      r.blanks = q.blanks.map((b) => b.accept);
      break;
    case "numeric":
      r.numericValue = q.value;
      r.numericUnit = q.unit;
      break;
    case "code_output":
      r.expected = q.expected;
      break;
    case "ordering":
      r.order = (q as OrderingQ).order;
      break;
    case "matching":
      r.pairs = (q as MatchingQ).pairs;
      break;
    case "short_answer":
    case "essay":
    case "code_writing":
      r.reference = resolveLocale(q.reference);
      break;
    case "scenario": {
      const parts: Record<string, AnswerReveal> = {};
      for (const p of (q as ScenarioQ).parts) parts[p.id] = buildReveal(p as QuestionRecord);
      r.parts = parts;
      break;
    }
    default:
      break;
  }
  return r;
}

// ---------- browser download (client-only DOM) ----------
function downloadJson(text: string, filename: string): void {
  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch {
    /* no-op in non-browser env */
  }
}

function ymd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function useApp(): Vals {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}

// re-export migrate so 3b-2 / callers can hydrate injected banks through the version chain
export { migrate };

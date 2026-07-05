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

// Dependency-injected submit (3b-2 passes the server action; standalone grades locally).
export type SubmitAttemptFn = (
  questionId: string,
  userAnswer: UserAnswer,
) => Promise<{ result: GradeResult; revealed?: AnswerReveal; attemptId?: string }>;

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
  listWrongbook?: (input: { cursor?: string; mastered?: boolean }) => Promise<
    ActionResult<{ items: ListItem[]; nextCursor: string | null }>
  >;
  listFavorites?: (input: { cursor?: string }) => Promise<
    ActionResult<{ items: ListItem[]; nextCursor: string | null }>
  >;
  listRecent?: (input: { cursor?: string }) => Promise<
    ActionResult<{ items: ListItem[]; nextCursor: string | null }>
  >;
  masterWrong?: (input: { questionId: string }) => Promise<ActionResult<{ ok: true }>>;
  getQuestionForPractice?: (input: {
    sessionId?: string;
    filters?: unknown;
    cursor?: string;
  }) => Promise<
    ActionResult<{ question: unknown; questionMeta: unknown; nextCursor: string | null }>
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
  getExamState?: (input: { sessionId: string }) => Promise<ActionResult<unknown>>;
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
  categoryMastery?: { category: string; count: number; accuracyPct: number }[];
  weakestCategories?: string[];
}

export interface InitialData {
  user?: { name?: string; email?: string } | null;
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
   * computeVals which mode it is in, so it never calls grade() on a stripped record.
   */
  bank?: PracticeQuestion[];
  progress?: Record<string, ProgressLite>;
  examBank?: PracticeQuestion[];
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
  | "settings";

export interface AppState {
  screen: ScreenKey;
  // data model
  user: { name?: string; email?: string } | null;
  entitlement: { tier?: string } | null;
  /** Real stats (§7.2) in authed mode; null in demo mode (→ computeVals uses the demo fallbacks). */
  stats: StatsData | null;
  bank: PracticeQuestion[];
  progress: Record<string, ProgressLite>;
  // practice
  pIndex: number;
  pNoBase: number;
  pAnswers: Record<string, UserAnswer>;
  /**
   * Per-question submit outcome (§5.4). AUTHED: filled from the server submit response (result +
   * revealed key/explanation + attemptId). DEMO: filled from a local grade() + buildReveal() on the
   * full record. Absence of an entry means "not yet submitted" → the question renders ungraded.
   */
  pReveal: Record<string, PracticeReveal>;
  pFav: Record<string, boolean>;
  pShowAnalysis: boolean;
  // exam
  examBank: PracticeQuestion[];
  examSessionId: string | null; // set only when a real server exam session is started (3b-2+)
  examAnswers: Record<number, UserAnswer>;
  examRemain: number | null;
  examIndex: number;
  examMarked: number[];
  examSubmitted: boolean;
  /**
   * Server exam lifecycle (authed mode only; demo leaves these null). `examStarting` guards the
   * start-once effect; `examStartError` surfaces a start failure (never a fake 0/100); `examServer`
   * holds the AUTHORITATIVE submit result the result screen renders in authed mode (score/correct/
   * wrong from the server, per-question reveals for the wrongbook). Demo keeps the local grade path.
   */
  examStarting: boolean;
  examStartError: boolean;
  examServer: ExamServerResult | null;
  // wrongbook
  wbTab: string;
  wbPage: number;
  wbFav: Record<string, boolean>;
  // settings
  setGoal: number;
  remind: boolean;
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

const INITIAL: AppState = {
  screen: "home",
  user: null,
  entitlement: null,
  stats: null,
  bank: [],
  progress: {},
  pIndex: 0,
  pNoBase: 12,
  pAnswers: {},
  pReveal: {},
  pFav: {},
  pShowAnalysis: false,
  examBank: [],
  examSessionId: null,
  examAnswers: {},
  examRemain: null,
  examIndex: 0,
  examMarked: [],
  examSubmitted: false,
  examStarting: false,
  examStartError: false,
  examServer: null,
  wbTab: "错题本",
  wbPage: 1,
  wbFav: {},
  setGoal: 30,
  remind: true,
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
  pToggleAna(): void;
  // exam
  examAnswer(a: UserAnswer): void;
  examGo(i: number): void;
  examStep(d: number): void;
  examMark(): void;
  examSubmit(): void;
  examReset(): void;
  // wrongbook
  wbSetTab(t: string): void;
  wbGo(n: number): void;
  toggleFav(id: string): void;
  // filters (ASCII)
  toggleType(t: QuestionType): void;
  setDiff(d: string): void;
  toggleTag(t: string): void;
  toggleCompany(): void;
  resetFilters(): void;
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
      qbank: { n: "06", t: "题库 · 导入导出" },
      settings: { n: "08", t: "设置" },
    } as Record<ScreenKey, { n: string; t: string }>
  )[cur];

  // ---------- practice (§5.4 dual-mode: demo local grade vs authed server-authoritative) ----------
  // serverSubmit === true → the authed bank is STRIPPED (no answer key/explanation). We MUST NOT
  // call grade()/correctAnswerText()/buildReveal() on such a record; grading + reveal come only
  // from `submitted` (the server submit response, keyed by question id). serverSubmit === false →
  // demo: the full sample bank is present and we grade locally exactly as before.
  const filteredBank = filterBank(state.bank, state);
  const hasQ = filteredBank.length > 0;
  const q: PracticeQuestion | undefined = hasQ
    ? filteredBank[((state.pIndex % filteredBank.length) + filteredBank.length) % filteredBank.length]
    : undefined;

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

  const pPct = Math.round(((state.pNoBase + state.pIndex) / 30) * 100);

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
  const examTotal = examLen || 30;

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

  const bub = (arr: number[]) =>
    arr
      .filter((n) => n <= examTotal)
      .map((n) => ({
        n,
        st: bubbleStyle(state, n - 1, state.examAnswers[n - 1] !== undefined),
        go: () => a.examGo(n - 1),
      }));

  // ---------- wrongbook / favorites / recent (from bank + progress) ----------
  const prog = state.progress;
  const wrongList: ListItem[] = state.bank
    .filter((qq) => (prog[qq.id]?.wrongCount ?? 0) > 0)
    .map((qq) => toListItem(qq, prog[qq.id]));
  const favList: ListItem[] = state.bank
    .filter((qq) => prog[qq.id]?.fav)
    .map((qq) => toListItem(qq, prog[qq.id]));
  const recentList: ListItem[] = state.bank
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

  // fallback to demo arrays only if bank produced empty projections (keeps screens non-empty)
  const sourceList =
    state.wbTab === "收藏夹"
      ? favList.length
        ? favList
        : favItems
      : state.wbTab === "最近练习"
        ? recentList.length
          ? recentList
          : recentItems
        : wrongList.length
          ? wrongList
          : wrongItems;

  const wbList = sourceList.map((it) => ({
    ...it,
    diffS: diffStyle(it.diff),
    diffChip: diffChip(it.diff),
    typeChip: typeChipStyle(),
    fav: !!state.wbFav[it.id],
    favInv: !state.wbFav[it.id],
    onFav: () => a.toggleFav(it.id),
    meta:
      state.wbTab === "错题本"
        ? "错误 " + it.wrong + " 次 · 上次错误 " + it.last
        : it.last,
  }));
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
  const pages = [1, 2, 3, 4, 5].map((n) => ({
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
  const statStreak = st?.streak ?? 0;
  const statStudyMinutes = st?.studyMinutes ?? 0;
  const statStudyHours = Math.round((statStudyMinutes / 60) * 10) / 10;
  const goal = state.setGoal || 60;
  const todayGoalPct = goal > 0 ? Math.min(100, Math.round((statTodayCount / goal) * 100)) : 0;

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

  return {
    // ---- 3b-2 passthrough: real identity for the settings/header (no derivation change) ----
    user: state.user,
    entitlement: state.entitlement,

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
    mobileItems: (
      [
        ["home", "首页"],
        ["practice", "刷题"],
        ["interview", "模拟面试"],
        ["wrongbook", "错题本"],
        ["favorites", "收藏夹"],
        ["qbank", "题库"],
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

    // practice
    pHasQ: hasQ,
    pQ: q
      ? { id: q.id, type: TYPE_LABEL[q.type], q: stem(q), diff: DIFF_LABEL[q.difficulty] }
      : { id: "", type: "", q: "题库为空，请调整筛选或导入题目。", diff: "" },
    pRecord: q,
    pFieldProps,
    pGrade: pShownGrade,
    pIsMulti: q?.type === "multiple_choice",
    pNo: state.pNoBase + state.pIndex,
    pTotal: 30,
    pProgress: pPct + "%",
    pBarStyle: css({
      width: pPct + "%",
      height: "100%",
      background: "var(--pri)",
      borderRadius: "6px",
      transition: "width .3s",
    }),
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
    pfTagList: ["作用域", "闭包", "原型链", "事件循环", "异步", "CSS", "HTTP"].map((t) => {
      const on = !!state.pfTags[t];
      return {
        k: t,
        on,
        go: () => a.toggleTag(t),
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
    examTime: fmtTime(state.examRemain == null ? 5316 : state.examRemain),
    examLow: state.examRemain != null && state.examRemain < 600,
    examNo: idx + 1,
    examTotal,
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
    examServerPending: serverSubmit && state.examSubmitted && state.examServer === null,
    bubbles1: bub([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    bubbles2: bub([16, 17, 18, 19, 20]),
    bubbles3: bub([21, 22, 23, 24, 25]),
    bubbles4: bub([26, 27, 28, 29, 30]),
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
    qbankBankCount: state.bank.length,
    qbankNotice: state.qbankNotice,

    // ---------- real stats (§7.2): home KPIs + stats screen + sidebar streak ----------
    // `statsReady` tells each screen whether to render the real values below or keep its demo
    // literals. Preserves every visual; only the numbers change when real data is present.
    statsReady,
    // Home KPIs (刷题量 / 今日 / 正确率 / 连续打卡 / 累计打卡). accuracyPct is objective (§7.2 铁律).
    statTotalAttempts,
    statAccuracyPct,
    statTodayCount,
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
    // Fallback: no bank injected → the built-in 13-type sample envelope (standalone mode).
    const bank = initialData?.bank ?? sampleEnvelope.questions;
    const examBank = initialData?.examBank ?? bank;
    const progress = initialData?.progress ?? synthProgress(bank);
    return {
      ...INITIAL,
      user: initialData?.user ?? null,
      entitlement: initialData?.entitlement ?? null,
      stats: initialData?.stats ?? null,
      bank,
      examBank,
      progress,
    };
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  // Server-side practice cursor (advanced by pNext when the getQuestionForPractice action is wired).
  const practiceCursorRef = useRef<string | null>(null);

  // AUTHED mode iff a real submit Server Action is wired. Drives the §5.4 dual-mode grading: when
  // true the practice bank is STRIPPED, so computeVals/pSubmit source grade + reveal from the
  // server response and NEVER call grade() on a bank record. Demo (no action) → false → local grade.
  const serverSubmit = !!serverActions?.submitAttempt;

  const patch = useCallback(
    (p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) =>
      setState((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) })),
    [],
  );

  // Local (standalone/demo) grade — used only when NO server submit is wired. The demo bank carries
  // answer keys, so grading + reveal are fully functional offline. Never runs in authed mode.
  const localSubmit = useCallback<SubmitAttemptFn>(async (questionId, userAnswer) => {
    const rec = stateRef.current.bank.find((x) => x.id === questionId);
    if (!rec) return { result: grade({} as QuestionRecord, userAnswer) };
    const result = grade(rec as QuestionRecord, userAnswer);
    return { result, revealed: buildReveal(rec as QuestionRecord) };
  }, []);

  // Default submit resolution order (§8.1): explicit onSubmitAttempt DI hook →
  // actions.submitAttempt (server-authoritative) → local grade (demo only). computeVals is unaware
  // of this indirection. CRITICAL (§5.4): in the authed path the bank is STRIPPED — on a server
  // failure we must NOT local-grade the stripped record (its keys are gone → wrong result). We
  // instead surface a neutral unanswered result so the UI never dead-ends AND never fabricates a
  // grade from missing keys. Local grade is reserved for the true demo path (no action wired).
  const submitFn = useMemo<SubmitAttemptFn>(() => {
    if (onSubmitAttempt) return onSubmitAttempt;
    const serverSubmitAction = serverActions?.submitAttempt;
    if (serverSubmitAction) {
      return async (questionId, userAnswer) => {
        try {
          const res = await serverSubmitAction({ questionId, userAnswer });
          if (res.ok) {
            // Adapt the server's RAW-field reveal → the client's FRIENDLY AnswerReveal, keyed by the
            // question's type (the stripped bank record still carries `type`). A blind cast here was
            // a runtime lie: multiple_choice/true_false/numeric read friendly fields the raw payload
            // never had, so their correct-answer displayed blank post-submit.
            const rec = stateRef.current.bank.find((x) => x.id === questionId);
            const qType = rec?.type;
            const partTypes =
              qType === "scenario"
                ? Object.fromEntries((rec as ScenarioQ).parts.map((p) => [p.id, p.type]))
                : undefined;
            return {
              result: res.data.result,
              revealed: adaptServerReveal(res.data.revealed, qType, partTypes),
              attemptId: res.data.attemptId,
            };
          }
        } catch {
          /* fall through to the neutral result below — do NOT local-grade a stripped record */
        }
        return { result: UNANSWERED_RESULT };
      };
    }
    return localSubmit;
  }, [onSubmitAttempt, serverActions, localSubmit]);

  // AUTHED exam start (blocker #2). When the user opens 模拟面试 in authed mode we start ONE server
  // exam session (startExam), store its id + the returned STRIPPED questions as the exam bank, and
  // seed the server-authoritative countdown. Guarded so it fires exactly once per session: the
  // `examStarting` flag + `examSessionId` guard prevent a re-start on every render, and examReset
  // clears both so "再考一次" starts a fresh session. Demo mode (no startExam action) skips this
  // entirely and keeps the local sample examBank + local grade. Failure degrades gracefully
  // (examStartError) — never a crash, never a fake exam.
  useEffect(() => {
    const startExam = serverActions?.startExam;
    if (!startExam) return; // demo mode → keep the local injected examBank
    const st = stateRef.current;
    if (st.screen !== "interview") return;
    if (st.examSessionId || st.examStarting || st.examSubmitted) return; // start once

    setState((s) => ({ ...s, examStarting: true, examStartError: false }));
    startExam({ count: 30 })
      .then((r) => {
        if (r.ok) {
          setState((s) => ({
            ...s,
            examSessionId: r.data.sessionId,
            // Server-stripped questions become the exam bank (structurally a PublicQuestion[]).
            examBank: (r.data.questions as PracticeQuestion[]) ?? s.examBank,
            examRemain: r.data.remainingSec ?? r.data.durationSec ?? s.examRemain,
            examStarting: false,
            examStartError: false,
          }));
          try {
            localStorage.setItem("fe_exam_remain", String(r.data.remainingSec ?? r.data.durationSec ?? 0));
          } catch {}
        } else {
          setState((s) => ({ ...s, examStarting: false, examStartError: true }));
        }
      })
      .catch(() => setState((s) => ({ ...s, examStarting: false, examStartError: true })));
    // Re-check when the screen changes or after a reset (examSessionId/examSubmitted flip).
  }, [state.screen, state.examSessionId, state.examStarting, state.examSubmitted, serverActions]);

  // exam countdown timer (ports the original interval + localStorage persistence).
  useEffect(() => {
    let r = 5316;
    try {
      const s = localStorage.getItem("fe_exam_remain");
      if (s != null) r = Math.max(0, parseInt(s, 10) || 0);
    } catch {}
    setState((st) => ({ ...st, examRemain: r }));
    const timer = setInterval(() => {
      const st = stateRef.current;
      if (st.screen === "interview" && !st.examSubmitted) {
        setState((s) => {
          const nr = Math.max(0, (s.examRemain == null ? 5316 : s.examRemain) - 1);
          try {
            localStorage.setItem("fe_exam_remain", String(nr));
          } catch {}
          return { ...s, examRemain: nr };
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const actions = useMemo<Actions>(
    () => ({
      go: (k) =>
        patch(() => {
          const st: Partial<AppState> = { screen: k };
          if (k === "wrongbook") st.wbTab = "错题本";
          if (k === "favorites") st.wbTab = "收藏夹";
          return st;
        }),
      toggleLayout: () => patch((s) => ({ layout: s.layout === "sidebar" ? "top" : "sidebar" })),
      toggleTheme: () => patch((s) => ({ sbTheme: s.sbTheme === "dark" ? "light" : "dark" })),
      toggleAppTheme: () => patch((s) => ({ appTheme: s.appTheme === "dark" ? "light" : "dark" })),
      toggleCollapse: () => patch((s) => ({ collapsed: !s.collapsed })),
      openNav: () => patch({ mobileNav: true }),
      closeNav: () => patch({ mobileNav: false }),

      // practice
      pAnswer: (ans) =>
        patch((s) => {
          const filtered = filterBank(s.bank, s);
          if (filtered.length === 0) return {};
          const cq = filtered[((s.pIndex % filtered.length) + filtered.length) % filtered.length];
          return { pAnswers: { ...s.pAnswers, [cq.id]: ans } };
        }),
      pSubmit: () => {
        const s = stateRef.current;
        const filtered = filterBank(s.bank, s);
        if (filtered.length === 0) return;
        const cq = filtered[((s.pIndex % filtered.length) + filtered.length) % filtered.length];
        const ans = s.pAnswers[cq.id];
        if (!ans) return;
        // §5.4: authed → server-authoritative grade + reveal + attemptId; demo → local grade +
        // buildReveal (resolved inside submitFn). We ALWAYS store a PracticeReveal entry keyed by
        // question id — its presence is what flips the question into the graded/analysis state.
        submitFn(cq.id, ans).then(({ result, revealed, attemptId }) => {
          setState((prev) => {
            // fold the graded result into progress; store the submit outcome for reveal + self-grade.
            const prevP = prev.progress[cq.id] ?? {};
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
            const entry: PracticeReveal = { result, revealed, attemptId };
            return {
              ...prev,
              progress: { ...prev.progress, [cq.id]: nextP },
              pReveal: { ...prev.pReveal, [cq.id]: entry },
              pShowAnalysis: true,
            };
          });
        });
      },
      pSelfGrade: (score, ticks) => {
        const s = stateRef.current;
        const filtered = filterBank(s.bank, s);
        if (filtered.length === 0) return;
        const cq = filtered[((s.pIndex % filtered.length) + filtered.length) % filtered.length];
        const attemptId = s.pReveal[cq.id]?.attemptId;
        const selfAct = serverActions?.selfGradeAttempt;

        // AUTHED (§5.4 / invariant #4): a subjective attempt already exists (submitted → attemptId).
        // Persist the self score server-side (writes the independent selfScore column) and fold the
        // returned result back into pReveal so the badge/analysis reflect it. Optimistically also
        // record the self answer so the buttons show the active selection immediately.
        if (serverSubmit && selfAct && attemptId) {
          selfAct({ attemptId, selfScore: score, ...(ticks ? { rubricTicks: ticks } : {}) })
            .then((r) => {
              if (r.ok) {
                setState((prev) => {
                  const cur = prev.pReveal[cq.id];
                  if (!cur) return prev;
                  return {
                    ...prev,
                    pReveal: { ...prev.pReveal, [cq.id]: { ...cur, result: r.data.result } },
                  };
                });
              }
            })
            .catch(() => undefined);
        }

        // Both modes: record the self answer (drives the button active state + demo local grade).
        const ans: UserAnswer = { kind: "self", selfScore: score, ...(ticks ? { rubricTicks: ticks } : {}) };
        setState((prev) => ({ ...prev, pAnswers: { ...prev.pAnswers, [cq.id]: ans } }));
      },
      pMove: (id, dir) =>
        patch((s) => {
          const filtered = filterBank(s.bank, s);
          if (filtered.length === 0) return {};
          const cq = filtered[((s.pIndex % filtered.length) + filtered.length) % filtered.length];
          if (cq.type !== "ordering") return {};
          const items = (cq as OrderingQ).items;
          const prev = s.pAnswers[cq.id];
          const cur =
            prev?.kind === "order" && prev.order.length === items.length
              ? prev.order.slice()
              : items.map((it) => it.id);
          const i = cur.indexOf(id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= cur.length) return {};
          [cur[i], cur[j]] = [cur[j], cur[i]];
          return { pAnswers: { ...s.pAnswers, [cq.id]: { kind: "order", order: cur } } };
        }),
      pToggleFav: (id) => {
        // Optimistic local toggle (authoritative for the immediate UI); persist best-effort when
        // the server action is wired (demo mode → no-op). Errors never disrupt the optimistic UI.
        serverActions?.toggleFavorite?.({ questionId: id }).catch(() => undefined);
        patch((s) => ({
          pFav: { ...s.pFav, [id]: !s.pFav[id] },
          progress: { ...s.progress, [id]: { ...(s.progress[id] ?? {}), fav: !(s.progress[id]?.fav) } },
        }));
      },
      pNext: () => {
        // Local paging (modulo over the injected first batch) is authoritative for the UI and can
        // never dead-end. When wired, also advance the server cursor best-effort so the backend can
        // serve fresh questions in future flows.
        const g = serverActions?.getQuestionForPractice;
        if (g) {
          g({ cursor: practiceCursorRef.current ?? undefined })
            .then((r) => {
              if (r.ok && r.data.nextCursor) practiceCursorRef.current = r.data.nextCursor;
            })
            .catch(() => undefined);
        }
        // Advance the index and leave analysis mode. Reset the CURRENT question's submit outcome so
        // that if the user cycles back to it, it renders ungraded again (fresh attempt) — matching
        // the "moving on shows it ungraded" UX. pAnswers are preserved (demo parity).
        patch((s) => {
          const filtered = filterBank(s.bank, s);
          const next: Partial<AppState> = { pIndex: s.pIndex + 1, pShowAnalysis: false };
          if (filtered.length > 0) {
            const cq = filtered[((s.pIndex % filtered.length) + filtered.length) % filtered.length];
            if (s.pReveal[cq.id]) {
              const { [cq.id]: _drop, ...rest } = s.pReveal;
              next.pReveal = rest;
            }
          }
          return next;
        });
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
        // Dual-mode submit (blocker #2).
        //   AUTHED: submitExam is the AUTHORITATIVE grader (§5.4). We await it and drive the result
        //     screen's score/correct/wrong + per-question reveals from state.examServer. On error we
        //     still mark submitted but leave examServer null → the screen shows a graceful pending/
        //     error state, NEVER a fabricated 0/100 presented as real.
        //   DEMO: no server session → computeVals local-grades the full sample bank as before.
        const s = stateRef.current;
        const sid = s.examSessionId;
        const submitAct = serverActions?.submitExam;
        if (serverSubmit && submitAct && sid) {
          patch({ examSubmitted: true, examServer: null });
          submitAct({ sessionId: sid })
            .then((r) => {
              if (r.ok) {
                const typeById = (qid: string) =>
                  stateRef.current.examBank.find((x) => x.id === qid)?.type;
                const partTypesById = (qid: string) => {
                  const rec = stateRef.current.examBank.find((x) => x.id === qid);
                  return rec?.type === "scenario"
                    ? Object.fromEntries((rec as ScenarioQ).parts.map((p) => [p.id, p.type]))
                    : undefined;
                };
                const adapted = adaptExamSubmit(r.data, typeById, partTypesById);
                setState((prev) => ({ ...prev, examServer: adapted }));
              }
              // r.ok === false → leave examServer null (screen shows pending/error, not a fake score)
            })
            .catch(() => undefined);
          return;
        }
        // Demo (or authed with no live session — degrade to the local screen without a fake grade).
        patch({ examSubmitted: true });
      },
      examReset: () => {
        const r = 5316;
        try {
          localStorage.setItem("fe_exam_remain", String(r));
        } catch {}
        // Clear the server exam lifecycle too (blocker #2) so the start-once effect fires again and
        // "再考一次" gets a FRESH server session + newly-stripped bank. Demo just resets the local
        // exam. examBank is left as-is; the start effect overwrites it when the new session lands.
        patch({
          examSubmitted: false,
          examRemain: r,
          examIndex: 0,
          examAnswers: {},
          examMarked: [],
          examSessionId: null,
          examStarting: false,
          examStartError: false,
          examServer: null,
        });
      },

      // wrongbook
      wbSetTab: (t) => patch({ wbTab: t, wbPage: 1 }),
      wbGo: (n) => patch({ wbPage: n }),
      toggleFav: (id) => {
        // Persist best-effort when wired; optimistic local toggle drives the list-row star.
        serverActions?.toggleFavorite?.({ questionId: id }).catch(() => undefined);
        patch((s) => ({ wbFav: { ...s.wbFav, [id]: !s.wbFav[id] } }));
      },

      // filters
      toggleType: (t) => patch((s) => ({ pfTypes: { ...s.pfTypes, [t]: !s.pfTypes[t] } })),
      setDiff: (d) => patch({ pfDiff: d }),
      toggleTag: (t) => patch((s) => ({ pfTags: { ...s.pfTags, [t]: !s.pfTags[t] } })),
      toggleCompany: () => patch((s) => ({ pfCompany: !s.pfCompany })),
      resetFilters: () =>
        patch({ pfTypes: { ...INITIAL_PF_TYPES }, pfDiff: "medium", pfTags: {}, pfCompany: false }),

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
    [patch, submitFn, serverActions, serverSubmit],
  );

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

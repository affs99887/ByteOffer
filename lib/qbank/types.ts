// lib/qbank/types.ts
// Pure, dependency-free domain types for the ByteOffer question bank (§4 of the spec).

export const SCHEMA_VERSION = 1 as const;
export const FORMAT_ID = "byteoffer.qbank" as const;

export type Difficulty = "easy" | "medium" | "hard";
export type OptionKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type QuestionType =
  | "single_choice" | "multiple_choice" | "true_false"
  | "fill_blank" | "numeric" | "code_output"
  | "ordering" | "matching"
  | "short_answer" | "essay" | "code_writing"
  | "scenario" | "cloze";

export type GradingClass =
  | "auto_exact" | "auto_set" | "auto_normalized"
  | "auto_partial" | "self_assess" | "manual_reference" | "composite";

export type LocalizedString = string | Record<string, string>;

export interface Opt { k: OptionKey; t: LocalizedString }
export interface Media { kind: "image" | "code"; src: string; alt?: string }
export interface Explanation {
  explain?: string; points?: string[]; pitfalls?: string[]; related?: string[]; ai?: string;
}
export interface Source { company?: string; year?: number; position?: string }

export interface NormalizeOpts {
  trim?: boolean; collapseWhitespace?: boolean; caseInsensitive?: boolean;
  fullwidthToHalfwidth?: boolean; ignoreChinesePunctVariant?: boolean;
  stripPunctuation?: boolean; trimTrailingWhitespace?: boolean;
  collapseBlankLines?: boolean; synonyms?: string[][];
}
export interface AcceptText { text: string }
export interface AcceptRegex { regex: string; flags?: string }
export type Accept = AcceptText | AcceptRegex;
export interface BlankSpec { accept: Accept[]; label?: string }
export interface RubricItem { point: LocalizedString; weight: number }
export interface OrderItem { id: string; t: LocalizedString }
export interface MatchSide { id: string; t: LocalizedString }

export interface BaseRecord {
  id: string;
  difficulty: Difficulty;
  tags: string[];
  stem: LocalizedString;
  source?: Source;
  explanation?: Explanation;
  media?: Media[];
  grading?: { partial?: boolean };
  x?: Record<string, unknown>;
}

export interface SingleChoiceQ extends BaseRecord {
  type: "single_choice"; options: Opt[]; answer: OptionKey;
}
export interface MultipleChoiceQ extends BaseRecord {
  type: "multiple_choice"; options: Opt[]; answer: OptionKey[];
}
export interface TrueFalseQ extends BaseRecord {
  type: "true_false"; answer: boolean;
}
export interface FillBlankQ extends BaseRecord {
  type: "fill_blank"; mode: "ordered" | "unordered"; blanks: BlankSpec[]; normalize?: NormalizeOpts;
}
export interface NumericQ extends BaseRecord {
  type: "numeric"; value: number; unit?: string; tolerance?: { abs?: number; rel?: number };
}
export interface CodeOutputQ extends BaseRecord {
  type: "code_output"; expected: string; accept?: Accept[]; normalize?: NormalizeOpts;
}
export interface OrderingQ extends BaseRecord {
  type: "ordering"; items: OrderItem[]; order: string[]; orderScoring?: "position" | "kendall";
}
export interface MatchingQ extends BaseRecord {
  type: "matching"; left: MatchSide[]; right: MatchSide[]; pairs: [string, string][]; manyToOne?: boolean;
}
export interface ShortAnswerQ extends BaseRecord {
  type: "short_answer"; reference: LocalizedString; keywords?: string[]; selfAssess?: boolean;
}
export interface EssayQ extends BaseRecord {
  type: "essay"; reference: LocalizedString; rubric?: RubricItem[]; selfAssess?: boolean;
}
export interface CodeWritingQ extends BaseRecord {
  type: "code_writing"; reference: string; lang?: string; tests?: { desc: string }[]; selfAssess?: boolean;
}
export interface ClozeQ extends BaseRecord { // v1 reserved: no grader
  type: "cloze"; template: LocalizedString; blanks: BlankSpec[]; mode?: "ordered" | "unordered"; normalize?: NormalizeOpts;
}

export type LeafRecord =
  | SingleChoiceQ | MultipleChoiceQ | TrueFalseQ
  | FillBlankQ | NumericQ | CodeOutputQ
  | OrderingQ | MatchingQ
  | ShortAnswerQ | EssayQ | CodeWritingQ | ClozeQ;

export interface ScenarioQ extends BaseRecord {
  type: "scenario"; parts: (LeafRecord & { points?: number })[];
}

export type QuestionRecord = LeafRecord | ScenarioQ;

export interface QBankEnvelope {
  format: typeof FORMAT_ID;
  schemaVersion: number;
  exportedAt: string;
  source?: { app?: string; appVersion?: string; author?: string };
  meta?: { title?: string; locale?: string };
  counts?: { total: number; byType?: Partial<Record<QuestionType, number>> };
  questions: QuestionRecord[];
}

// ---------- user answer (UI-produced) ----------
export type UserAnswer =
  | { kind: "choice"; value: OptionKey }
  | { kind: "multi"; value: OptionKey[] }
  | { kind: "boolean"; value: boolean }
  | { kind: "blanks"; values: string[] }
  | { kind: "numeric"; raw: string }
  | { kind: "text"; value: string }
  | { kind: "order"; order: string[] }
  | { kind: "pairs"; pairs: [string, string][] }
  | { kind: "self"; selfScore: 0 | 0.5 | 1; rubricTicks?: number[] }
  | { kind: "composite"; parts: Record<string, UserAnswer> };

// ---------- grade result ----------
export type GradeStatus = "correct" | "incorrect" | "partial" | "ungraded";
export interface GradeResult {
  gradingClass: GradingClass;
  status: GradeStatus;
  score: number | null;      // [0,1]; null = manual_reference / unrated subjective
  max: number;               // usually 1; scenario = Σ objective weights
  answered: boolean;
  needsSelfGrade?: boolean;
  advisory?: { score: number; note: string }; // short_answer keyword hint (never in objective stats)
  detail?: { blanks?: boolean[]; pairs?: boolean[]; order?: boolean[]; parts?: Record<string, GradeResult> };
}

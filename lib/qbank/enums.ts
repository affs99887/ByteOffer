// lib/qbank/enums.ts
// Grading-class lookup, display labels, and the derived-class resolver (§2.1).

import type { Difficulty, GradingClass, QuestionRecord, QuestionType } from "./types";

// §2.1 — grading class is derived by lookup, never stored per record.
export const GRADING_CLASS_OF: Record<QuestionType, GradingClass> = {
  single_choice: "auto_exact",
  true_false: "auto_exact",
  multiple_choice: "auto_set",     // upgraded to auto_partial at grade-time if grading.partial
  fill_blank: "auto_normalized",   // upgraded to auto_partial when multi-blank / grading.partial
  numeric: "auto_normalized",
  code_output: "auto_normalized",
  ordering: "auto_set",            // upgraded to auto_partial if grading.partial
  matching: "auto_set",            // upgraded to auto_partial if grading.partial
  short_answer: "self_assess",
  essay: "self_assess",            // manual_reference if selfAssess:false
  code_writing: "self_assess",     // manual_reference if selfAssess:false
  scenario: "composite",
  cloze: "manual_reference",       // v1 reserved: no grader
};

// §1 table — Chinese display names (display-only).
export const TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  true_false: "判断题",
  fill_blank: "填空题",
  numeric: "数值题",
  code_output: "输出预测题",
  ordering: "排序题",
  matching: "匹配题",
  short_answer: "简答题",
  essay: "问答题",
  code_writing: "编程题",
  scenario: "情景多问题",
  cloze: "完形填空",
};

// §3.4 — difficulty display mapping (aligns with diffStyle's Chinese keys).
export const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

/**
 * effectiveClass — the runtime grading class for a record (§2.1 author knob).
 * Base = GRADING_CLASS_OF[type], then:
 *  - multiple_choice / ordering / matching → auto_partial iff grading.partial === true.
 *  - fill_blank → auto_partial when it has >1 blank OR grading.partial === true.
 *  - essay / code_writing → manual_reference when selfAssess === false.
 */
export function effectiveClass(q: QuestionRecord): GradingClass {
  const base = GRADING_CLASS_OF[q.type];

  switch (q.type) {
    case "multiple_choice":
    case "ordering":
    case "matching":
      return q.grading?.partial === true ? "auto_partial" : base;

    case "fill_blank":
      return q.blanks.length > 1 || q.grading?.partial === true ? "auto_partial" : base;

    case "essay":
    case "code_writing":
      return q.selfAssess === false ? "manual_reference" : base;

    default:
      return base;
  }
}

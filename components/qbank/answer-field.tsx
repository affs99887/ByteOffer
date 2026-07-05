"use client";

// components/qbank/answer-field.tsx
// AnswerFieldByType — a presentational, controlled answer control dispatched by `type`.
// Renders the right input for a PublicQuestion / QuestionRecord and calls back with a
// UserAnswer. Once `graded` is set, controls become read-only and show correctness
// (✓/✗ per item, partial %). Visuals reuse the app's inline-style patterns (selRow / markSty)
// and CSS vars (--pri / --surface / --line / --ink). Mobile-friendly inputs
// (width:100%, min-height:44px, font-size:16px). No drag library; ordering uses ↑/↓ buttons.
//
// This component NEVER imports react/next-only server code and does not fetch — the app
// context feeds it the record + current answer + grade. Grading itself lives in lib/qbank/grade.

import type { CSSProperties, ReactNode } from "react";
import { effectiveClass, TYPE_LABEL } from "@/lib/qbank/enums";
import { resolveLocale } from "@/lib/qbank/format";
import type {
  Accept,
  CodeOutputQ,
  CodeWritingQ,
  EssayQ,
  Explanation,
  FillBlankQ,
  GradeResult,
  LocalizedString,
  MatchingQ,
  MultipleChoiceQ,
  NumericQ,
  Opt,
  OptionKey,
  OrderingQ,
  QuestionRecord,
  RubricItem,
  ScenarioQ,
  ShortAnswerQ,
  SingleChoiceQ,
  TrueFalseQ,
  UserAnswer,
} from "@/lib/qbank/types";

/**
 * AnswerReveal — the answer-key + explanation projection surfaced AFTER grading.
 * (Not part of lib/qbank/types since that layer is frozen; 3b-2 can shape the server
 * `revealed` payload to this contract.) All fields optional; the component degrades gracefully.
 */
export interface AnswerReveal {
  answer?: OptionKey;
  answers?: OptionKey[];
  boolean?: boolean;
  blanks?: Accept[][];
  numericValue?: number;
  numericUnit?: string;
  expected?: string;
  order?: string[];
  pairs?: [string, string][];
  reference?: string;
  /** Essay scoring rubric, surfaced post-submit so the self-assess checklist works when the
   *  record has been server-stripped (authed mode). Demo reads it off the record directly. */
  rubric?: RubricItem[];
  /** The full explanation (points/pitfalls/related/ai), surfaced post-submit for the analysis block. */
  explanation?: Explanation;
  /** Per-part reveal keyed by scenario part id, so each sub-question shows ITS OWN answer key. */
  parts?: Record<string, AnswerReveal>;
}

export interface AnswerFieldProps {
  question: QuestionRecord;
  value: UserAnswer | undefined;
  graded?: GradeResult;
  reveal?: AnswerReveal;
  onChange(a: UserAnswer): void;
  onSelfGrade?(score: 0 | 0.5 | 1, ticks?: number[]): void;
}

// ---------- shared style atoms (mirror app-context's selRow / markSty look) ----------
const OK = "#0E9F6E";
const BAD = "#F04438";
const WARN = "#F79009";

const str = (s: LocalizedString): string => resolveLocale(s);

function rowStyle(selected: boolean, tint?: string): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "13px",
    padding: "15px 17px",
    borderRadius: "10px",
    cursor: tint ? "default" : "pointer",
    minHeight: "44px",
    boxSizing: "border-box",
    border: `1.5px solid ${tint ?? (selected ? "var(--pri)" : "var(--line)")}`,
    background: tint
      ? tintWash(tint)
      : selected
        ? "var(--pri-w)"
        : "var(--surface)",
    transition: "all .12s",
  };
}

function tintWash(tint: string): string {
  if (tint === OK) return "rgba(14,159,110,.08)";
  if (tint === BAD) return "rgba(240,68,56,.07)";
  if (tint === WARN) return "rgba(247,144,9,.08)";
  return "var(--surface)";
}

function markStyle(selected: boolean, kind: "radio" | "check", tint?: string): CSSProperties {
  const on = tint === OK || (!tint && selected);
  const color = tint === OK ? OK : tint === BAD ? BAD : "var(--pri)";
  if (kind === "check") {
    return {
      width: "20px",
      height: "20px",
      borderRadius: "6px",
      flex: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: on || (tint === BAD && selected) ? "none" : "2px solid #C7CEDA",
      background: on ? color : tint === BAD && selected ? BAD : "var(--surface)",
      transition: "all .1s",
    };
  }
  return {
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    flex: "none",
    boxSizing: "border-box",
    border:
      on || (tint === BAD && selected)
        ? `6px solid ${on ? OK : BAD}`
        : "2px solid #C7CEDA",
    transition: "all .1s",
  };
}

const keyStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontWeight: 700,
  fontSize: "13px",
  color: "var(--ink2)",
  flex: "none",
};
const optTextStyle: CSSProperties = { fontSize: "14.5px", color: "var(--ink)", lineHeight: 1.5 };

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: "44px",
  fontSize: "16px",
  padding: "10px 12px",
  borderRadius: "9px",
  border: "1.5px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};
const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: "'JetBrains Mono',ui-monospace,monospace",
  lineHeight: 1.6,
};

const labelStyle: CSSProperties = {
  fontSize: "12.5px",
  fontWeight: 600,
  color: "var(--ink2)",
  marginBottom: "6px",
  display: "block",
};

const CheckIcon = ({ c = "#fff" }: { c?: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4 4 10-10" />
  </svg>
);

function statusBadge(g?: GradeResult): ReactNode {
  if (!g) return null;
  if (g.status === "correct")
    return <Badge tint={OK} text="✓ 正确" />;
  if (g.status === "incorrect")
    return <Badge tint={BAD} text="✗ 错误" />;
  if (g.status === "partial")
    return <Badge tint={WARN} text={`部分正确 ${Math.round((g.score ?? 0) * 100)}%`} />;
  return <Badge tint="var(--ink3)" text="待自评" />;
}

function Badge({ tint, text }: { tint: string; text: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "12.5px",
        fontWeight: 700,
        color: tint,
        border: `1px solid ${tint}`,
        borderRadius: "7px",
        padding: "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

const mark = (ok: boolean): ReactNode =>
  ok ? (
    <span style={{ color: OK, fontWeight: 700, fontSize: "14px", flex: "none" }}>✓</span>
  ) : (
    <span style={{ color: BAD, fontWeight: 700, fontSize: "14px", flex: "none" }}>✗</span>
  );

// =====================================================================================
//  Per-type controls
// =====================================================================================

// ---- single_choice / true_false → radio rows ----
function ChoiceField({ question, value, graded, reveal, onChange }: AnswerFieldProps) {
  const q = question as SingleChoiceQ | TrueFalseQ;
  const locked = !!graded;

  const rows: { key: string; text: string; opt?: OptionKey }[] =
    q.type === "true_false"
      ? [
          { key: "true", text: "对（正确）" },
          { key: "false", text: "错（错误）" },
        ]
      : (q as SingleChoiceQ).options.map((o) => ({ key: o.k, text: str(o.t), opt: o.k }));

  const selectedKey =
    q.type === "true_false"
      ? value?.kind === "boolean"
        ? value.value
          ? "true"
          : "false"
        : ""
      : value?.kind === "choice"
        ? value.value
        : "";

  const correctKey =
    q.type === "true_false"
      ? reveal?.boolean !== undefined
        ? reveal.boolean
          ? "true"
          : "false"
        : (q as TrueFalseQ).answer
          ? "true"
          : "false"
      : reveal?.answer ?? (q as SingleChoiceQ).answer;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {rows.map((r) => {
        const selected = selectedKey === r.key;
        let tint: string | undefined;
        if (locked) {
          if (r.key === correctKey) tint = OK;
          else if (selected) tint = BAD;
        }
        const onClick = () => {
          if (locked) return;
          if (q.type === "true_false") onChange({ kind: "boolean", value: r.key === "true" });
          else onChange({ kind: "choice", value: r.opt as OptionKey });
        };
        return (
          <div key={r.key} style={rowStyle(selected, tint)} onClick={onClick}>
            <span style={markStyle(selected, "radio", tint)} />
            {r.opt && <span style={keyStyle}>{r.opt}</span>}
            <span style={optTextStyle}>{r.text}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---- multiple_choice → checkbox rows ----
function MultiField({ question, value, graded, reveal, onChange }: AnswerFieldProps) {
  const q = question as MultipleChoiceQ;
  const locked = !!graded;
  const sel = value?.kind === "multi" ? value.value : [];
  const correct = new Set<OptionKey>(reveal?.answers ?? q.answer);

  const toggle = (k: OptionKey) => {
    if (locked) return;
    const next = sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k];
    onChange({ kind: "multi", value: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {q.options.map((o: Opt) => {
        const selected = sel.includes(o.k);
        let tint: string | undefined;
        if (locked) {
          if (correct.has(o.k)) tint = OK; // all correct options highlighted
          else if (selected) tint = BAD; // wrong pick
        }
        return (
          <div key={o.k} style={rowStyle(selected, tint)} onClick={() => toggle(o.k)}>
            <span style={markStyle(selected, "check", tint)}>
              {(selected || tint === OK) && <CheckIcon />}
            </span>
            <span style={keyStyle}>{o.k}</span>
            <span style={optTextStyle}>{str(o.t)}</span>
            {locked && (correct.has(o.k) || selected) && (
              <span style={{ marginLeft: "auto", flex: "none" }}>{mark(correct.has(o.k))}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- fill_blank → one <input> per blank ----
function FillBlankField({ question, value, graded, reveal, onChange }: AnswerFieldProps) {
  const q = question as FillBlankQ;
  const locked = !!graded;
  const values = value?.kind === "blanks" ? value.values : [];
  const flags = graded?.detail?.blanks;
  // Accept lists source: AUTHED reads reveal.blanks (Accept[][], post-submit only); DEMO reads the
  // full record's blanks[].accept. In authed mode pre-reveal the shells have no accept → we skip
  // the hint (guarded below), so we never call acceptSummary on undefined.
  const acceptOf = (i: number): Accept[] | undefined => reveal?.blanks?.[i] ?? q.blanks[i]?.accept;

  const setAt = (i: number, v: string) => {
    if (locked) return;
    const next = q.blanks.map((_, bi) => (bi === i ? v : values[bi] ?? ""));
    onChange({ kind: "blanks", values: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {q.blanks.map((b, i) => {
        const ok = flags?.[i];
        const accepts = acceptOf(i);
        return (
          <div key={i}>
            <label style={labelStyle}>
              {b.label ?? `第 ${i + 1} 空`}
              {locked && ok !== undefined && (
                <span style={{ marginLeft: "8px" }}>{mark(ok)}</span>
              )}
            </label>
            <input
              value={values[i] ?? ""}
              readOnly={locked}
              placeholder="输入答案…"
              onChange={(e) => setAt(i, e.target.value)}
              style={{
                ...inputStyle,
                borderColor: locked && ok !== undefined ? (ok ? OK : BAD) : "var(--line)",
              }}
            />
            {locked && ok === false && accepts && accepts.length > 0 && (
              <div style={acceptHintStyle}>可接受：{acceptSummary(accepts)}</div>
            )}
          </div>
        );
      })}
      {locked && graded?.status === "partial" && (
        <div style={{ fontSize: "12.5px", color: WARN, fontWeight: 600 }}>
          命中 {flags?.filter(Boolean).length ?? 0}/{q.blanks.length}
        </div>
      )}
    </div>
  );
}

const acceptHintStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--ink3)",
  marginTop: "5px",
  fontFamily: "'JetBrains Mono',monospace",
};

function acceptSummary(accepts: Accept[] | undefined): string {
  if (!accepts || accepts.length === 0) return "";
  return accepts
    .map((a) => ("text" in a ? a.text : `/${a.regex}/`))
    .join(" · ");
}

// ---- numeric → single <input> + unit suffix ----
function NumericField({ question, value, graded, reveal, onChange }: AnswerFieldProps) {
  const q = question as NumericQ;
  const locked = !!graded;
  const raw = value?.kind === "numeric" ? value.raw : "";
  const unit = reveal?.numericUnit ?? q.unit;
  const ok = graded?.status === "correct";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <input
          value={raw}
          readOnly={locked}
          inputMode="decimal"
          placeholder="输入数值…"
          onChange={(e) => !locked && onChange({ kind: "numeric", raw: e.target.value })}
          style={{
            ...monoInputStyle,
            maxWidth: "240px",
            borderColor: locked ? (ok ? OK : BAD) : "var(--line)",
          }}
        />
        {unit && <span style={{ fontSize: "14px", color: "var(--ink2)", flex: "none" }}>{unit}</span>}
      </div>
      {locked && (
        <div style={acceptHintStyle}>
          正确值：{reveal?.numericValue ?? q.value}
          {q.tolerance?.abs !== undefined ? ` ±${q.tolerance.abs}` : ""}
          {q.tolerance?.rel !== undefined ? ` (±${q.tolerance.rel * 100}%)` : ""}
        </div>
      )}
    </div>
  );
}

// ---- code_output → <textarea> (monospace) ----
function CodeOutputField({ question, value, graded, reveal, onChange }: AnswerFieldProps) {
  const q = question as CodeOutputQ;
  const locked = !!graded;
  const text = value?.kind === "text" ? value.value : "";
  const ok = graded?.status === "correct";
  return (
    <div>
      <textarea
        value={text}
        readOnly={locked}
        rows={4}
        placeholder="输入程序输出…"
        onChange={(e) => !locked && onChange({ kind: "text", value: e.target.value })}
        style={{
          ...monoInputStyle,
          resize: "vertical",
          borderColor: locked ? (ok ? OK : BAD) : "var(--line)",
          whiteSpace: "pre",
        }}
      />
      {locked && (
        <pre style={{ ...acceptHintStyle, whiteSpace: "pre-wrap", marginTop: "6px" }}>
          期望输出：{reveal?.expected ?? q.expected}
        </pre>
      )}
    </div>
  );
}

// ---- ordering → each item with ↑/↓ buttons ----
function OrderingField({ question, value, graded, onChange }: AnswerFieldProps) {
  const q = question as OrderingQ;
  const locked = !!graded;
  // Current order: from answer, else item declaration order (stable initial).
  const current: string[] =
    value?.kind === "order" && value.order.length === q.items.length
      ? value.order
      : q.items.map((it) => it.id);
  const flags = graded?.detail?.order;
  const byId = new Map(q.items.map((it) => [it.id, str(it.t)]));

  const move = (i: number, dir: -1 | 1) => {
    if (locked) return;
    const j = i + dir;
    if (j < 0 || j >= current.length) return;
    const next = current.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ kind: "order", order: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {current.map((id, i) => {
        const ok = flags?.[i];
        const tint = locked ? (ok ? OK : BAD) : undefined;
        return (
          <div
            key={id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 14px",
              minHeight: "44px",
              boxSizing: "border-box",
              borderRadius: "10px",
              border: `1.5px solid ${tint ?? "var(--line)"}`,
              background: tint ? tintWash(tint) : "var(--surface)",
            }}
          >
            <span style={{ ...keyStyle, width: "20px" }}>{i + 1}</span>
            <span style={{ ...optTextStyle, flex: 1 }}>{byId.get(id) ?? id}</span>
            {locked && ok !== undefined && <span style={{ flex: "none" }}>{mark(ok)}</span>}
            {!locked && (
              <span style={{ display: "flex", gap: "6px", flex: "none" }}>
                <StepBtn dir="up" disabled={i === 0} onClick={() => move(i, -1)} />
                <StepBtn dir="down" disabled={i === current.length - 1} onClick={() => move(i, 1)} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepBtn({ dir, disabled, onClick }: { dir: "up" | "down"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={dir === "up" ? "上移" : "下移"}
      style={{
        width: "34px",
        height: "34px",
        minHeight: "34px",
        borderRadius: "8px",
        border: "1px solid var(--line)",
        background: "var(--surface)",
        color: disabled ? "var(--ink3)" : "var(--ink2)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "inherit",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {dir === "up" ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
      </svg>
    </button>
  );
}

// ---- matching → left items fixed, each row a right-side <select> ----
function MatchingField({ question, value, graded, onChange }: AnswerFieldProps) {
  const q = question as MatchingQ;
  const locked = !!graded;
  const pairs = value?.kind === "pairs" ? value.pairs : [];
  const rightOf = new Map(pairs.map(([l, r]) => [l, r]));
  const flags = graded?.detail?.pairs;

  const setRight = (leftId: string, rightId: string) => {
    if (locked) return;
    const others = pairs.filter(([l]) => l !== leftId);
    const next: [string, string][] = rightId ? [...others, [leftId, rightId]] : others;
    onChange({ kind: "pairs", pairs: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {q.left.map((l, i) => {
        const ok = flags?.[i];
        const tint = locked ? (ok ? OK : BAD) : undefined;
        return (
          <div
            key={l.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 14px",
              minHeight: "44px",
              boxSizing: "border-box",
              borderRadius: "10px",
              border: `1.5px solid ${tint ?? "var(--line)"}`,
              background: tint ? tintWash(tint) : "var(--surface)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ ...optTextStyle, flex: "1 1 120px", minWidth: 0 }}>{str(l.t)}</span>
            <span style={{ color: "var(--ink3)", flex: "none" }}>→</span>
            <select
              value={rightOf.get(l.id) ?? ""}
              disabled={locked}
              onChange={(e) => setRight(l.id, e.target.value)}
              style={{
                flex: "1 1 160px",
                minHeight: "44px",
                fontSize: "16px",
                padding: "8px 10px",
                borderRadius: "9px",
                border: "1.5px solid var(--line)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontFamily: "inherit",
              }}
            >
              <option value="">— 选择 —</option>
              {q.right.map((r) => (
                <option key={r.id} value={r.id}>
                  {str(r.t)}
                </option>
              ))}
            </select>
            {locked && ok !== undefined && <span style={{ flex: "none" }}>{mark(ok)}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ---- self-assess (short_answer / essay / code_writing) ----
function SelfAssessField(props: AnswerFieldProps & { reveal?: AnswerReveal }) {
  const { question, value, graded, reveal, onChange, onSelfGrade } = props;
  const q = question as ShortAnswerQ | EssayQ | CodeWritingQ;
  const cls = effectiveClass(q);
  const manual = cls === "manual_reference"; // essay/code_writing with selfAssess:false

  const text = value?.kind === "text" ? value.value : value?.kind === "self" ? "" : "";
  const selfScore = value?.kind === "self" ? value.selfScore : undefined;
  const ticks = value?.kind === "self" ? value.rubricTicks ?? [] : [];
  const revealed = !!graded || value?.kind === "self";
  const reference = reveal?.reference ?? str((q as ShortAnswerQ).reference ?? "");
  // AUTHED reads reveal.rubric (the record is stripped, §5.4); DEMO reads it off the record.
  const rubric = q.type === "essay" ? reveal?.rubric ?? (q as EssayQ).rubric : undefined;

  const mono = q.type === "code_writing";

  const doSelf = (s: 0 | 0.5 | 1) => {
    if (onSelfGrade) onSelfGrade(s);
    else onChange({ kind: "self", selfScore: s });
  };
  const toggleTick = (i: number) => {
    const next = ticks.includes(i) ? ticks.filter((x) => x !== i) : [...ticks, i];
    if (onSelfGrade) onSelfGrade(rubricScoreToLevel(rubric!, next), next);
    else onChange({ kind: "self", selfScore: rubricScoreToLevel(rubric!, next), rubricTicks: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <textarea
        value={value?.kind === "self" ? text : text}
        rows={mono ? 6 : 4}
        placeholder={mono ? "在此作答（编写代码）…" : "在此作答…"}
        onChange={(e) => onChange({ kind: "text", value: e.target.value })}
        style={{ ...(mono ? monoInputStyle : inputStyle), resize: "vertical", minHeight: "88px" }}
      />

      {(q as ShortAnswerQ).keywords && graded?.advisory && (
        <div style={{ fontSize: "12.5px", color: "var(--ink3)" }}>
          提示：{graded.advisory.note}
        </div>
      )}

      {!revealed && (
        <RevealButton onClick={() => onChange({ kind: "self", selfScore: 0 })} label="查看参考答案" />
      )}

      {revealed && (
        <div style={referenceBoxStyle}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink2)", marginBottom: "8px" }}>
            参考答案
          </div>
          <pre style={{ ...(mono ? { fontFamily: "'JetBrains Mono',monospace" } : {}), fontSize: "13.5px", color: "var(--ink)", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>
            {reference || "（无参考答案）"}
          </pre>
          {(q as ShortAnswerQ).keywords && (q as ShortAnswerQ).keywords!.length > 0 && (
            <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {(q as ShortAnswerQ).keywords!.map((kw, i) => (
                <span key={i} style={kwChipStyle}>{kw}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {revealed && !manual && rubric && rubric.length > 0 && (
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink2)", marginBottom: "8px" }}>
            评分量规 · 勾选达成项
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {rubric.map((r, i) => {
              const on = ticks.includes(i);
              return (
                <div
                  key={i}
                  onClick={() => toggleTick(i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px",
                    minHeight: "44px",
                    boxSizing: "border-box",
                    borderRadius: "9px",
                    cursor: "pointer",
                    border: on ? "1.5px solid var(--pri)" : "1.5px solid var(--line)",
                    background: on ? "var(--pri-w)" : "var(--surface)",
                  }}
                >
                  <span style={markStyle(on, "check")}>{on && <CheckIcon />}</span>
                  <span style={{ ...optTextStyle, flex: 1 }}>{str(r.point)}</span>
                  <span style={{ ...keyStyle, flex: "none" }}>{r.weight} 分</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {revealed && !manual && !(rubric && rubric.length > 0) && (
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink2)", marginBottom: "8px" }}>
            对照参考，自我评分
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <SelfBtn label="对" sub="1.0" active={selfScore === 1} tint={OK} onClick={() => doSelf(1)} />
            <SelfBtn label="半对" sub="0.5" active={selfScore === 0.5} tint={WARN} onClick={() => doSelf(0.5)} />
            <SelfBtn label="错" sub="0" active={selfScore === 0} tint={BAD} onClick={() => doSelf(0)} />
          </div>
        </div>
      )}

      {revealed && manual && (
        <div style={{ fontSize: "12.5px", color: "var(--ink3)" }}>
          本题仅展示参考答案，不计入正确率。
        </div>
      )}
    </div>
  );
}

function rubricScoreToLevel(rubric: EssayQ["rubric"], ticks: number[]): 0 | 0.5 | 1 {
  // The context recomputes the exact rubric fraction via grade(); this coarse level only
  // drives the self-answer payload. Report the closest 3-level bucket for standalone display.
  if (!rubric || rubric.length === 0) return 0;
  const total = rubric.reduce((s, r) => s + r.weight, 0);
  const got = rubric.reduce((s, r, i) => (ticks.includes(i) ? s + r.weight : s), 0);
  const frac = total === 0 ? 0 : got / total;
  return frac >= 1 ? 1 : frac <= 0 ? 0 : 0.5;
}

const referenceBoxStyle: CSSProperties = {
  border: "1px solid var(--line)",
  background: "var(--surface-2)",
  borderRadius: "10px",
  padding: "14px 16px",
};
const kwChipStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "11px",
  color: "var(--ink3)",
  background: "var(--chip)",
  borderRadius: "6px",
  padding: "4px 9px",
};

function RevealButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        alignSelf: "flex-start",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        color: "var(--ink)",
        borderRadius: "8px",
        padding: "9px 16px",
        fontSize: "13.5px",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function SelfBtn({ label, sub, active, tint, onClick }: { label: string; sub: string; active: boolean; tint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minHeight: "44px",
        padding: "10px 18px",
        borderRadius: "9px",
        border: active ? `1.5px solid ${tint}` : "1.5px solid var(--line)",
        background: active ? tintWash(tint) : "var(--surface)",
        color: active ? tint : "var(--ink)",
        fontWeight: 700,
        fontSize: "14px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", opacity: 0.8 }}>{sub}</span>
    </button>
  );
}

// ---- cloze (v1): read-only stem + "查看参考" (no input) ----
function ClozeField({ question }: AnswerFieldProps) {
  const q = question as Extract<QuestionRecord, { type: "cloze" }>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ ...referenceBoxStyle }}>
        <pre style={{ fontSize: "14px", color: "var(--ink)", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>
          {str(q.template ?? q.stem)}
        </pre>
      </div>
      <div style={{ fontSize: "12.5px", color: WARN, fontWeight: 600 }}>
        完形填空 v1 暂不判分，仅展示参考。
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {q.blanks.map((b, i) => (
          <div key={i} style={{ fontSize: "13px", color: "var(--ink2)" }}>
            <span style={keyStyle}>[[{i + 1}]]</span> {acceptSummary(b.accept)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- scenario → stack each part's control (recurse) ----
function ScenarioField({ question, value, graded, reveal, onChange, onSelfGrade }: AnswerFieldProps) {
  const q = question as ScenarioQ;
  const partAnswers = value?.kind === "composite" ? value.parts : {};

  const setPart = (partId: string, a: UserAnswer) => {
    onChange({ kind: "composite", parts: { ...partAnswers, [partId]: a } });
  };
  const selfPart = (partId: string) => (score: 0 | 0.5 | 1, ticks?: number[]) => {
    setPart(partId, { kind: "self", selfScore: score, ...(ticks ? { rubricTicks: ticks } : {}) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {q.parts.map((part, i) => {
        const pg = graded?.detail?.parts?.[part.id];
        return (
          <div key={part.id} style={{ borderLeft: "2px solid var(--pri-w2)", paddingLeft: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
              <span style={{ ...keyStyle, color: "var(--pri)" }}>{`问 ${i + 1}`}</span>
              <span style={{ fontSize: "12px", color: "var(--ink3)" }}>{TYPE_LABEL[part.type]}</span>
              <span style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink)", flexBasis: "100%" }}>
                {str(part.stem)}
              </span>
            </div>
            <AnswerFieldByType
              question={part as QuestionRecord}
              value={partAnswers[part.id]}
              graded={pg}
              reveal={reveal?.parts?.[part.id]}
              onChange={(a) => setPart(part.id, a)}
              onSelfGrade={onSelfGrade ? selfPart(part.id) : undefined}
            />
          </div>
        );
      })}
      {graded && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {statusBadge(graded)}
          <span style={{ fontSize: "12px", color: "var(--ink3)" }}>客观 part 聚合分</span>
          {q.parts.some((p) => effectiveClass(p as QuestionRecord) === "self_assess") && (
            <Badge tint="var(--pri)" text="混合" />
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================================
//  Dispatcher
// =====================================================================================
export function AnswerFieldByType(props: AnswerFieldProps): ReactNode {
  const { question, graded } = props;

  const body = (() => {
    switch (question.type) {
      case "single_choice":
      case "true_false":
        return <ChoiceField {...props} />;
      case "multiple_choice":
        return <MultiField {...props} />;
      case "fill_blank":
        return <FillBlankField {...props} />;
      case "numeric":
        return <NumericField {...props} />;
      case "code_output":
        return <CodeOutputField {...props} />;
      case "ordering":
        return <OrderingField {...props} />;
      case "matching":
        return <MatchingField {...props} />;
      case "short_answer":
      case "essay":
      case "code_writing":
        return <SelfAssessField {...props} />;
      case "scenario":
        return <ScenarioField {...props} />;
      case "cloze":
        return <ClozeField {...props} />;
      default: {
        const _never: never = question;
        return _never;
      }
    }
  })();

  // Objective types show a status badge above the control when graded; scenario/self show inline.
  const showTopBadge =
    graded &&
    question.type !== "scenario" &&
    question.type !== "short_answer" &&
    question.type !== "essay" &&
    question.type !== "code_writing" &&
    question.type !== "cloze";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {showTopBadge && <div>{statusBadge(graded)}</div>}
      {body}
    </div>
  );
}

export default AnswerFieldByType;

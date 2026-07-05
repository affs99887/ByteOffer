// components/admin/ui.tsx
// Small, shared presentational primitives for the admin console — card, section title, mono
// label, table shell, buttons, chips, status pill, and a banner. All inline-style + CSS-var to
// match the app's visual language (var(--surface)/var(--line)/--pri, JetBrains Mono labels).
// Server-safe (no "use client"): usable directly from server-component pages; the interactive
// admin components import from here too.

import type { CSSProperties, ReactNode } from "react";
import { DIFF_LABEL, TYPE_LABEL } from "@/lib/qbank/enums";
import { diffChip, typeChipStyle } from "@/lib/data";
import type { Difficulty, QuestionStatus, QuestionType } from "@prisma/client";

// ---- Style tokens ----

export const cardStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "12px",
  padding: "22px 24px",
  marginBottom: "16px",
};

export const sectionTitleStyle: CSSProperties = {
  fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif",
  fontSize: "15px",
  fontWeight: 700,
  color: "var(--ink)",
  marginBottom: "4px",
};

export const monoLabelStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "10.5px",
  letterSpacing: ".13em",
  color: "var(--ink3)",
  fontWeight: 600,
  marginBottom: "5px",
};

export const priBtnStyle: CSSProperties = {
  background: "var(--pri)",
  border: "1px solid var(--pri)",
  color: "#fff",
  borderRadius: "8px",
  padding: "9px 16px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const ghostBtnStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  borderRadius: "8px",
  padding: "9px 16px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const dangerBtnStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid rgba(240,68,56,.35)",
  color: "#D63C31",
  borderRadius: "8px",
  padding: "9px 16px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  borderRadius: "9px",
  padding: "9px 12px",
  fontSize: "13px",
  color: "var(--ink)",
  outline: "none",
  fontFamily: "inherit",
};

export const monoTextareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: "12.5px",
  fontFamily: "'JetBrains Mono',ui-monospace,monospace",
  lineHeight: 1.6,
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1.5px solid var(--line)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  outline: "none",
  resize: "vertical",
};

// ---- Components ----

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...cardStyle, ...style }}>{children}</div>;
}

export function SectionHeader({ label, title, desc }: { label: string; title: string; desc?: ReactNode }) {
  return (
    <div style={{ marginBottom: desc ? "16px" : "12px" }}>
      <div style={monoLabelStyle}>{label}</div>
      <div style={sectionTitleStyle}>{title}</div>
      {desc && <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "6px", lineHeight: 1.55 }}>{desc}</div>}
    </div>
  );
}

/** A metric card for the dashboard grid. */
export function StatCard({ label, value, hint, tint }: { label: string; value: ReactNode; hint?: string; tint?: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "12px",
        padding: "18px 20px",
      }}
    >
      <div style={monoLabelStyle}>{label}</div>
      <div
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: "30px",
          fontWeight: 700,
          color: tint ?? "var(--ink)",
          lineHeight: 1.1,
          marginTop: "4px",
        }}
      >
        {value}
      </div>
      {hint && <div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "6px" }}>{hint}</div>}
    </div>
  );
}

/** Table shell: a scroll container + <table> with the admin look. */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "10px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "640px" }}>
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "10px 14px",
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: "10.5px",
        letterSpacing: ".1em",
        color: "var(--ink3)",
        fontWeight: 600,
        borderBottom: "1px solid var(--line)",
        background: "var(--surface-2)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

export function Td({ children, style, colSpan }: { children?: ReactNode; style?: CSSProperties; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ padding: "11px 14px", borderBottom: "1px solid var(--line)", color: "var(--ink)", verticalAlign: "middle", ...style }}>
      {children}
    </td>
  );
}

const STATUS_META: Record<QuestionStatus, { label: string; c: string; bg: string }> = {
  draft: { label: "草稿", c: "#5A6172", bg: "rgba(138,146,162,.12)" },
  in_review: { label: "待审核", c: "#B7791F", bg: "rgba(247,144,9,.12)" },
  published: { label: "已发布", c: "#0A7D4E", bg: "rgba(18,183,106,.12)" },
  archived: { label: "已下架", c: "#D63C31", bg: "rgba(240,68,56,.10)" },
};

export function StatusPill({ status }: { status: QuestionStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "6px",
        padding: "3px 9px",
        fontSize: "12px",
        fontWeight: 600,
        color: m.c,
        background: m.bg,
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

/** The Chinese type chip (reuses typeChipStyle from lib/data + TYPE_LABEL from enums). */
export function TypeChip({ type }: { type: QuestionType }) {
  return <span style={typeChipStyle()}>{TYPE_LABEL[type]}</span>;
}

/** The difficulty chip (reuses diffChip built on the Chinese DIFF_LABEL). */
export function DiffChip({ difficulty }: { difficulty: Difficulty }) {
  const chip = diffChip(DIFF_LABEL[difficulty]);
  return (
    <span style={chip.style}>
      <span style={chip.dot} />
      {chip.label}
    </span>
  );
}

export function Banner({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const map = {
    error: { c: "#D63C31", bg: "rgba(240,68,56,.09)", bd: "#F3D0CE" },
    success: { c: "#0A7D4E", bg: "rgba(18,183,106,.10)", bd: "#BEE9D2" },
    info: { c: "var(--ink2)", bg: "var(--surface-2)", bd: "var(--line)" },
  }[kind];
  return (
    <div
      style={{
        border: `1px solid ${map.bd}`,
        background: map.bg,
        color: map.c,
        borderRadius: "9px",
        padding: "10px 13px",
        fontSize: "13px",
        fontWeight: 500,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

/** Truncate helper for stem text in table cells. */
export function truncate(s: string, n = 64): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

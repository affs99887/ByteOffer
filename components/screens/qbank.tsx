"use client";
// components/screens/qbank.tsx — 题库 browse hub.
// Presentational: reads useApp(); the 章节→小节 tree (v.hubTree) and all launch state come from
// computeVals. Each node carries pre-bound 刷题/模拟面试 launchers; the 出题模板 downloads are real.
import { useState } from "react";
import { useApp } from "@/lib/app-context";
import type { CSSProperties } from "react";

const card = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "12px",
  padding: "22px 24px",
  marginBottom: "16px",
} as const;

const sectionTitle = {
  fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif",
  fontSize: "15px",
  fontWeight: 700,
  color: "var(--ink)",
  marginBottom: "4px",
} as const;

const monoLabel = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "10.5px",
  letterSpacing: ".13em",
  color: "var(--ink3)",
  fontWeight: 600,
  marginBottom: "5px",
} as const;

const ghostBtn = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  borderRadius: "8px",
  padding: "10px 18px",
  fontSize: "13.5px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
} as const;

export function QbankScreen() {
  const v = useApp();

  // ── 题库 = data-driven BROWSE HUB ────────────────────────────────────────────
  // A logged-in user browses the real 章节(chapter)→小节(section) tree (v.hubTree, from the server's
  // browseStructure) and launches a FROZEN 刷题(practice)/模拟面试(exam) session from any scope
  // (全部 / 某章 / 某小节). Each node carries pre-bound launchers — we only wire onClick + disable while
  // a launch is in flight.
  return (
    <div data-screen-label="题库" className="bo-enter" style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, marginBottom: "14px" }}>
        // QBANK · 章节练习
      </div>

      {/* header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "18px", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "22px", fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em" }}>题库 · 章节练习</span>
        <span style={{ fontSize: "13px", color: "var(--ink3)" }}>共 <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--ink)", fontWeight: 700 }}>{v.hubTotal}</span> 题</span>
      </div>

      {/* launch-in-flight + error banners */}
      {v.hubLaunching && (
        <div style={{ background: "var(--pri-w)", border: "1px solid var(--pri)", borderRadius: "10px", padding: "11px 16px", marginBottom: "16px", fontSize: "13px", color: "var(--pri)", fontWeight: 600 }}>
          正在生成题目…
        </div>
      )}
      {v.hubLaunchError && (
        <div style={{ background: "rgba(240,68,56,.05)", border: "1px solid rgba(240,68,56,.4)", borderRadius: "10px", padding: "11px 16px", marginBottom: "16px", fontSize: "13px", color: "#D63C31", fontWeight: 600 }}>
          {v.hubLaunchError.message || "启动失败，请稍后重试"}
        </div>
      )}

      {v.hubEmpty ? (
        <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: "14px", color: "var(--ink2)", fontWeight: 600, marginBottom: "6px" }}>题库整理中，敬请期待</div>
          <div style={{ fontSize: "12.5px", color: "var(--ink3)" }}>官方正在录入题目，稍后再来看看。</div>
        </div>
      ) : (
        <>
          {/* 全部题目 — prominent scope */}
          <div style={{ ...card, background: "var(--pri-w)", border: "1px solid var(--pri)", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "170px" }}>
              <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>全部题目</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--ink3)", marginTop: "4px" }}>{v.hubTree.all.count} 题 · 覆盖全部章节</div>
            </div>
            <LaunchPair startPractice={v.hubTree.all.startPractice} startExam={v.hubTree.all.startExam} launching={v.hubLaunching} />
          </div>

          {/* one card per chapter (expandable → sections) */}
          {v.hubTree.chapters.map((ch) => (
            <ChapterBlock key={ch.chapter} ch={ch} launching={v.hubLaunching} />
          ))}
        </>
      )}

      {/* ---------- TEMPLATES (real downloads) ---------- */}
      <div style={{ ...card, marginTop: "8px" }}>
        <div style={monoLabel}>// TEMPLATES</div>
        <div style={sectionTitle}>出题模板</div>
        <div style={{ fontSize: "13px", color: "var(--ink2)", marginBottom: "16px" }}>
          下载样例题库或 JSON Schema，作为按 JSON 信封格式出题的模板。
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <button onClick={v.qbankDownloadSample} style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h4" /></svg>
            下载样例题库
          </button>
          <button onClick={v.qbankDownloadSchema} style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v10l8 4 8-4V7" /></svg>
            下载 JSON Schema
          </button>
        </div>
      </div>
    </div>
  );
}

// ── hub helpers ─────────────────────────────────────────────────────────────
// Structural mirrors of v.hubTree nodes (each carries pre-bound practice/exam launchers).
type HubSection = { section: string; count: number; startPractice: () => void; startExam: () => void };
type HubChapter = {
  chapter: string;
  count: number;
  startPractice: () => void;
  startExam: () => void;
  sections: HubSection[];
};

// The 刷题 / 模拟面试 launcher pair for a scope. Disabled (and dimmed) while any launch is in flight;
// `small` renders the compact section-row variant (面试 label). All onClicks are the pre-bound
// node launchers from computeVals — no scope construction here.
function LaunchPair({
  startPractice,
  startExam,
  launching,
  small,
}: {
  startPractice: () => void;
  startExam: () => void;
  launching: boolean;
  small?: boolean;
}) {
  const base: CSSProperties = {
    borderRadius: small ? "7px" : "8px",
    padding: small ? "6px 13px" : "9px 17px",
    fontSize: small ? "12.5px" : "13.5px",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: launching ? "not-allowed" : "pointer",
    opacity: launching ? 0.5 : 1,
    whiteSpace: "nowrap",
    transition: "opacity .1s",
  };
  return (
    <div style={{ display: "flex", gap: "8px", flex: "none" }}>
      <button
        disabled={launching}
        onClick={startPractice}
        style={{ ...base, background: "var(--pri)", border: "1px solid var(--pri)", color: "#fff" }}
      >
        刷题
      </button>
      <button
        disabled={launching}
        onClick={startExam}
        style={{ ...base, background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)" }}
      >
        {small ? "面试" : "模拟面试"}
      </button>
    </div>
  );
}

// One chapter card: header (name + count + chapter-scope launchers) with a local expand toggle that
// reveals its sections, each a row with its own section-scope launchers.
function ChapterBlock({ ch, launching }: { ch: HubChapter; launching: boolean }) {
  const [open, setOpen] = useState(false);
  const hasSections = ch.sections.length > 0;
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <div
          onClick={() => hasSections && setOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flex: 1,
            minWidth: "170px",
            cursor: hasSections ? "pointer" : "default",
          }}
        >
          {hasSections && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--ink3)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flex: "none", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          )}
          <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>{ch.chapter}</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--ink3)" }}>{ch.count} 题</span>
        </div>
        <LaunchPair startPractice={ch.startPractice} startExam={ch.startExam} launching={launching} />
      </div>

      {open && hasSections && (
        <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "12px" }}>
          {ch.sections.map((sec) => (
            <div key={sec.section} style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: "140px", fontSize: "13.5px", color: "var(--ink)", fontWeight: 500 }}>{sec.section}</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11.5px", color: "var(--ink3)" }}>{sec.count} 题</span>
              <LaunchPair startPractice={sec.startPractice} startExam={sec.startExam} launching={launching} small />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";
// components/screens/qbank.tsx — 题库 import/export/preview screen.
// Presentational: reads useApp(); all derived report rows / counts / button state come from
// computeVals. This is where the browser file <input> lives (client component). Actual JSON
// parse / validate / merge / Blob-download live in the context actions.
import { useApp } from "@/lib/app-context";
import type { ChangeEvent } from "react";

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

const priBtn = {
  background: "var(--pri)",
  border: "1px solid var(--pri)",
  color: "#fff",
  borderRadius: "8px",
  padding: "10px 18px",
  fontSize: "13.5px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
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

  // AUTHED honesty gate: the paste / upload / validate / confirm-import / merge / export controls
  // below are client-memory-only in the real app — confirmImport never persists to the DB and the
  // export dumps only the ≤30 key-stripped practice batch. So for a logged-in user we show the real
  // bank overview (authoritative countPublished), the two genuinely-working template downloads, and
  // an admin pointer. DEMO (/demo, no server actions) keeps the full import/export showcase, unchanged.
  if (v.authed) {
    return (
      <div data-screen-label="题库" className="bo-enter" style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, marginBottom: "16px" }}>
          // QBANK · 题库总览
        </div>

        {/* ---------- OVERVIEW ---------- */}
        <div style={card}>
          <div style={monoLabel}>// OVERVIEW</div>
          <div style={sectionTitle}>题库总览</div>
          <div style={{ fontSize: "13px", color: "var(--ink2)", marginBottom: "18px" }}>
            ByteOffer 官方题库，覆盖 13 种题型，由官方统一维护与更新。
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "34px", fontWeight: 700, color: "var(--ink)" }}>{v.qbankBankCount}</span>
            <span style={{ fontSize: "13.5px", color: "var(--ink3)" }}>道已发布题目</span>
          </div>
        </div>

        {/* ---------- TEMPLATES ---------- */}
        <div style={card}>
          <div style={monoLabel}>// TEMPLATES</div>
          <div style={sectionTitle}>出题模板</div>
          <div style={{ fontSize: "13px", color: "var(--ink2)", marginBottom: "16px" }}>
            下载 13 类型样例题库或 JSON Schema，作为按 JSON 信封格式出题的模板。
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

        {/* ---------- ADMIN ---------- */}
        <div style={card}>
          <div style={monoLabel}>// ADMIN</div>
          <div style={sectionTitle}>题库维护</div>
          <div style={{ fontSize: "13px", color: "var(--ink2)", lineHeight: 1.7, marginBottom: "16px" }}>
            题库由官方维护。管理员可在 <span style={{ color: "var(--ink)", fontWeight: 600 }}>管理后台 → 批量导入</span> 中导入题库（支持 JSON 信封，详见 <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12.5px", color: "var(--ink)" }}>docs/CONTENT-FORMAT.md</span>）。
          </div>
          <a href="/admin/import" style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            管理员入口
          </a>
        </div>
      </div>
    );
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) v.qbankOnFile(f);
  };

  return (
    <div data-screen-label="题库" className="bo-enter" style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, marginBottom: "16px" }}>
        // QBANK · 题库导入导出
      </div>

      {/* ---------- IMPORT ---------- */}
      <div style={card}>
        <div style={monoLabel}>// IMPORT</div>
        <div style={sectionTitle}>导入题库</div>
        <div style={{ fontSize: "13px", color: "var(--ink2)", marginBottom: "16px" }}>
          上传 <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>.json</span> 文件或粘贴题库 JSON，校验通过后确认落库。当前题库共{" "}
          <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--ink)", fontWeight: 700 }}>{v.qbankBankCount}</span> 题。
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
          <label style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
            选择文件
            <input type="file" accept=".json,application/json" onChange={onFileChange} style={{ display: "none" }} />
          </label>

          {/* merge / replace */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div onClick={v.qbankSetMerge} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <span style={radioSty(v.qbankIsMerge)} />
              <span style={{ fontSize: "13.5px", color: "var(--ink)", fontWeight: 500 }}>合并 (merge)</span>
            </div>
            <div onClick={v.qbankSetReplace} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <span style={radioSty(v.qbankIsReplace)} />
              <span style={{ fontSize: "13.5px", color: "var(--ink)", fontWeight: 500 }}>替换 (replace)</span>
            </div>
          </div>
        </div>

        <textarea
          value={v.qbankPasteText}
          placeholder='粘贴题库 JSON，例如 {"format":"byteoffer.qbank","schemaVersion":1,...}'
          onChange={(e) => v.qbankOnPaste(e.target.value)}
          rows={6}
          style={{
            width: "100%",
            minHeight: "120px",
            fontSize: "13px",
            fontFamily: "'JetBrains Mono',ui-monospace,monospace",
            lineHeight: 1.6,
            padding: "12px 14px",
            borderRadius: "10px",
            border: "1.5px solid var(--line)",
            background: "var(--surface-2)",
            color: "var(--ink)",
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        {v.qbankNotice && (
          <div style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--pri)", fontWeight: 600 }}>{v.qbankNotice}</div>
        )}
      </div>

      {/* ---------- PREVIEW / REPORT ---------- */}
      {v.qbankSummary && (
        <div style={card}>
          <div style={monoLabel}>// VALIDATION</div>
          <div style={sectionTitle}>校验预览</div>

          {/* summary bar ✅N ⚠️K ❌M */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", margin: "12px 0 18px" }}>
            <Stat tint="#0E9F6E" label="通过" n={v.qbankSummary.accepted} icon="✅" />
            <Stat tint="#B7791F" label="警告" n={v.qbankSummary.warned} icon="⚠️" />
            <Stat tint="#D63C31" label="拒绝" n={v.qbankSummary.rejected} icon="❌" />
            <Stat tint="var(--ink2)" label="总计" n={v.qbankSummary.total} icon="Σ" />
          </div>

          {!v.qbankSummary.fileOk && (
            <div style={{ fontSize: "13px", color: "#D63C31", fontWeight: 600, marginBottom: "14px" }}>
              文件级校验未通过，无法导入。请修正后重试。
            </div>
          )}

          {/* per-row */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "420px", overflowY: "auto" }}>
            {v.qbankReportRows.map((r) => (
              <div
                key={r.index}
                style={{
                  border: `1px solid ${r.ok ? "var(--line)" : "rgba(240,68,56,.4)"}`,
                  borderRadius: "10px",
                  padding: "12px 14px",
                  background: r.ok ? "var(--surface)" : "rgba(240,68,56,.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap", marginBottom: r.issues.length ? "8px" : 0 }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--ink3)" }}>#{r.index + 1}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12.5px", color: "var(--ink)", fontWeight: 600 }}>{r.id}</span>
                  <span style={r.typeChip}>{r.typeLabel}</span>
                  {r.diffChip && (
                    <span style={r.diffChip.style}><span style={r.diffChip.dot} />{r.diffChip.label}</span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: "12.5px", fontWeight: 700, color: r.ok ? "#0E9F6E" : "#D63C31" }}>
                    {r.ok ? "✓ 通过" : "✗ 拒绝"}
                  </span>
                </div>
                {r.issues.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {r.issues.map((iss, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={iss.chip}>{iss.level === "error" ? "错误" : "警告"}</span>
                        <span style={{ fontSize: "12.5px", color: "var(--ink2)" }}>{iss.msg}</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "var(--ink3)" }}>{iss.path}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
            <button
              onClick={v.qbankConfirm}
              disabled={v.qbankConfirmDisabled}
              style={{
                ...priBtn,
                opacity: v.qbankConfirmDisabled ? 0.5 : 1,
                cursor: v.qbankConfirmDisabled ? "not-allowed" : "pointer",
              }}
            >
              {v.qbankConfirmLabel}
            </button>
          </div>
        </div>
      )}

      {/* ---------- EXPORT / SAMPLE ---------- */}
      <div style={card}>
        <div style={monoLabel}>// EXPORT</div>
        <div style={sectionTitle}>导出 / 模板</div>
        <div style={{ fontSize: "13px", color: "var(--ink2)", marginBottom: "16px" }}>
          导出当前题库为 JSON，或下载 13 类型样例题库 / JSON Schema 作为作者模板。
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <button onClick={v.qbankExport} style={{ ...priBtn, display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></svg>
            下载题库 JSON
          </button>
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

function radioSty(on: boolean): React.CSSProperties {
  return {
    width: "17px",
    height: "17px",
    borderRadius: "50%",
    flex: "none",
    boxSizing: "border-box",
    border: on ? "5px solid var(--pri)" : "1.6px solid #CAD1DE",
    transition: "all .1s",
  };
}

function Stat({ tint, label, n, icon }: { tint: string; label: string; n: number; icon: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        border: "1px solid var(--line)",
        borderRadius: "9px",
        padding: "8px 14px",
        background: "var(--surface)",
      }}
    >
      <span style={{ fontSize: "14px" }}>{icon}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "18px", fontWeight: 700, color: tint }}>{n}</span>
      <span style={{ fontSize: "12.5px", color: "var(--ink3)" }}>{label}</span>
    </div>
  );
}

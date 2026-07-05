"use client";

// components/admin/import-wizard.tsx
// The two-phase import wizard (architecture §5.1). Phase 1: pick a bank + merge/replace, then
// either choose a .json file or paste JSON → adminPrepareImportAction validates and persists an
// ImportBatch (pending), returning an ImportReport (writes NO questions). We render the report
// (✅N ⚠️K ❌M summary + per-row chips reusing typeChip/diffChip + issue messages). Phase 2:
// "确认导入 X 题" → adminConfirmImportAction({batchId}) applies the batch (upsert → in_review) and
// shows applied/rejected/warned. The server RE-validates on confirm; the client report is advisory.
// Also: download sample bank / JSON Schema, and an export button hitting /api/admin/export.

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { adminConfirmImportAction, adminPrepareImportAction } from "@/lib/actions/admin";
import type { ImportReport, RecordReport } from "@/lib/qbank/validate";
import { TYPE_LABEL } from "@/lib/qbank/enums";
import { diffChip, typeChipStyle } from "@/lib/data";
import type { QuestionType } from "@prisma/client";
import {
  Banner,
  Card,
  SectionHeader,
  ghostBtnStyle,
  inputStyle,
  monoTextareaStyle,
  priBtnStyle,
} from "./ui";

type MergeMode = "merge" | "replace";

interface ConfirmResult {
  applied: number;
  rejected: number;
  warned: number;
}

export function ImportWizard({ banks }: { banks: { id: string; title: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [mergeMode, setMergeMode] = useState<MergeMode>("merge");
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmResult | null>(null);

  const exportHref = useMemo(() => (bankId ? `/api/admin/export?bankId=${encodeURIComponent(bankId)}` : ""), [bankId]);

  function readEnvelope(): unknown | undefined {
    const raw = pasteText.trim();
    if (!raw) {
      setError("请粘贴题库 JSON 或选择文件");
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      setError("JSON 解析失败：" + (e instanceof Error ? e.message : String(e)));
      return undefined;
    }
  }

  function prepare(envelope: unknown) {
    if (!bankId) {
      setError("请先选择题库");
      return;
    }
    setError(null);
    setReport(null);
    setBatchId(null);
    setConfirmed(null);
    startTransition(async () => {
      const res = await adminPrepareImportAction({ bankId, envelope, mergeMode });
      if (!res.ok) {
        setError(res.error.message ?? "校验失败");
        return;
      }
      setReport(res.data.report);
      setBatchId(res.data.batchId);
    });
  }

  function onPastePrepare() {
    const env = readEnvelope();
    if (env !== undefined) prepare(env);
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      let env: unknown;
      try {
        env = JSON.parse(String(reader.result ?? ""));
      } catch (err) {
        setError("文件不是合法 JSON：" + (err instanceof Error ? err.message : String(err)));
        return;
      }
      prepare(env);
    };
    reader.readAsText(f);
    e.target.value = ""; // allow re-selecting the same file
  }

  function confirmImport() {
    if (!batchId) return;
    setError(null);
    startTransition(async () => {
      const res = await adminConfirmImportAction({ batchId });
      if (!res.ok) {
        setError(res.error.message ?? "确认导入失败");
        return;
      }
      setConfirmed(res.data);
      setReport(null);
      setBatchId(null);
      router.refresh();
    });
  }

  function downloadSample() {
    // A minimal valid envelope so authors have a starting template.
    const sample = {
      format: "byteoffer.qbank",
      schemaVersion: 1,
      questions: [
        {
          id: "sample-1",
          type: "single_choice",
          difficulty: "easy",
          stem: "示例：以下哪一项是 JavaScript 的原始类型？",
          tags: ["示例"],
          options: [
            { k: "A", t: "Object" },
            { k: "B", t: "Symbol" },
            { k: "C", t: "Array" },
            { k: "D", t: "Function" },
          ],
          answer: "B",
          explanation: { text: "Symbol 是 ES6 引入的原始类型。" },
        },
      ],
    };
    downloadJson(sample, "byteoffer-qbank-sample.json");
  }

  return (
    <div>
      {/* ---------- IMPORT ---------- */}
      <Card>
        <SectionHeader
          label="// IMPORT"
          title="两阶段导入"
          desc={
            <>
              选择目标题库与合并模式，上传 <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>.json</span> 或粘贴题库 JSON。
              系统先校验并生成待确认批次（不写题），确认后落库为 <b>待审核</b>，再到审核队列批量发布。
            </>
          }
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-end", marginBottom: "14px" }}>
          <div style={{ minWidth: "240px", flex: "1 1 240px" }}>
            <label style={fieldLabel}>目标题库</label>
            <select value={bankId} onChange={(e) => setBankId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {banks.length === 0 && <option value="">（暂无题库）</option>}
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}（{b.id}）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={fieldLabel}>合并模式</label>
            <div style={{ display: "flex", gap: "14px", paddingTop: "4px" }}>
              <RadioRow on={mergeMode === "merge"} label="合并 (merge)" onClick={() => setMergeMode("merge")} />
              <RadioRow on={mergeMode === "replace"} label="替换 (replace)" onClick={() => setMergeMode("replace")} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "14px" }}>
          <label style={{ ...ghostBtnStyle, display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M6 10l6-6 6 6" />
              <path d="M4 20h16" />
            </svg>
            选择文件校验
            <input type="file" accept=".json,application/json" onChange={onFile} style={{ display: "none" }} disabled={pending || !bankId} />
          </label>
        </div>

        <textarea
          value={pasteText}
          placeholder='粘贴题库 JSON，例如 {"format":"byteoffer.qbank","schemaVersion":1,"questions":[…]}'
          onChange={(e) => setPasteText(e.target.value)}
          rows={7}
          spellCheck={false}
          style={{ ...monoTextareaStyle, minHeight: "140px" }}
        />
        <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
          <button onClick={onPastePrepare} disabled={pending || !bankId} style={{ ...priBtnStyle, opacity: pending || !bankId ? 0.6 : 1 }}>
            {pending ? "校验中…" : "校验 JSON"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: "12px" }}>
            <Banner kind="error">{error}</Banner>
          </div>
        )}
      </Card>

      {/* ---------- REPORT ---------- */}
      {report && (
        <Card>
          <SectionHeader label="// VALIDATION" title="校验预览" />

          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", margin: "12px 0 18px" }}>
            <Stat tint="#0E9F6E" label="通过" n={report.counts.accepted} icon="✅" />
            <Stat tint="#B7791F" label="警告" n={report.counts.warned} icon="⚠️" />
            <Stat tint="#D63C31" label="拒绝" n={report.counts.rejected} icon="❌" />
            <Stat tint="var(--ink2)" label="总计" n={report.counts.total} icon="Σ" />
          </div>

          {!report.fileOk && (
            <div style={{ marginBottom: "14px" }}>
              <Banner kind="error">文件级校验未通过，无法导入。请修正后重试。</Banner>
              {report.envelopeIssues.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginTop: "10px" }}>
                  {report.envelopeIssues.map((iss, j) => (
                    <IssueRow key={j} level={iss.level} msg={iss.msg} path={iss.path} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "420px", overflowY: "auto" }}>
            {report.records.map((r) => (
              <ReportRow key={r.index} r={r} />
            ))}
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
            <button
              onClick={confirmImport}
              disabled={pending || !report.fileOk || report.counts.accepted === 0}
              style={{
                ...priBtnStyle,
                opacity: pending || !report.fileOk || report.counts.accepted === 0 ? 0.5 : 1,
                cursor: pending || !report.fileOk || report.counts.accepted === 0 ? "not-allowed" : "pointer",
              }}
            >
              {pending ? "导入中…" : `确认导入 ${report.counts.accepted} 题`}
            </button>
          </div>
        </Card>
      )}

      {/* ---------- CONFIRMED ---------- */}
      {confirmed && (
        <Card>
          <SectionHeader label="// APPLIED" title="导入完成" />
          <Banner kind="success">
            已导入 <b>{confirmed.applied}</b> 题（落为待审核）· 拒绝 <b>{confirmed.rejected}</b> · 警告 <b>{confirmed.warned}</b>。
            前往 <a href="/admin/review" style={{ color: "var(--pri)", fontWeight: 700 }}>审核队列</a> 批量发布。
          </Banner>
        </Card>
      )}

      {/* ---------- EXPORT / TEMPLATES ---------- */}
      <Card>
        <SectionHeader label="// EXPORT" title="导出 / 模板" desc="导出所选题库为 JSON，或下载样例题库 / JSON Schema 作为作者模板。" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <a
            href={exportHref || undefined}
            aria-disabled={!bankId}
            style={{
              ...priBtnStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              textDecoration: "none",
              pointerEvents: bankId ? "auto" : "none",
              opacity: bankId ? 1 : 0.5,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v12M6 10l6 6 6-6" />
              <path d="M4 20h16" />
            </svg>
            导出题库 JSON
          </a>
          <button onClick={downloadSample} style={{ ...ghostBtnStyle, display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="4" width="14" height="16" rx="2" />
              <path d="M9 9h6M9 13h6M9 17h4" />
            </svg>
            下载样例题库
          </button>
          <a href="/qbank.schema.json" download style={{ ...ghostBtnStyle, display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7l8-4 8 4-8 4-8-4z" />
              <path d="M4 7v10l8 4 8-4V7" />
            </svg>
            下载 JSON Schema
          </a>
        </div>
      </Card>
    </div>
  );
}

// ---- Row helpers ----

function ReportRow({ r }: { r: RecordReport }) {
  const typeLabel = r.record ? TYPE_LABEL[r.record.type as QuestionType] ?? r.record.type : null;
  const chip = r.record ? diffChip(diffLabelFor(r.record.difficulty)) : null;
  return (
    <div
      style={{
        border: `1px solid ${r.ok ? "var(--line)" : "rgba(240,68,56,.4)"}`,
        borderRadius: "10px",
        padding: "12px 14px",
        background: r.ok ? "var(--surface)" : "rgba(240,68,56,.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap", marginBottom: r.issues.length ? "8px" : 0 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--ink3)" }}>#{r.index + 1}</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12.5px", color: "var(--ink)", fontWeight: 600 }}>{r.id ?? "—"}</span>
        {typeLabel && <span style={typeChipStyle()}>{typeLabel}</span>}
        {chip && (
          <span style={chip.style}>
            <span style={chip.dot} />
            {chip.label}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: "12.5px", fontWeight: 700, color: r.ok ? "#0E9F6E" : "#D63C31" }}>
          {r.ok ? "✓ 通过" : "✗ 拒绝"}
        </span>
      </div>
      {r.issues.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {r.issues.map((iss, j) => (
            <IssueRow key={j} level={iss.level} msg={iss.msg} path={iss.path} />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueRow({ level, msg, path }: { level: "error" | "warning"; msg: string; path: string }) {
  const isErr = level === "error";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          borderRadius: "6px",
          padding: "2px 8px",
          fontSize: "11px",
          fontWeight: 700,
          color: isErr ? "#D63C31" : "#B7791F",
          background: isErr ? "rgba(240,68,56,.10)" : "rgba(247,144,9,.12)",
        }}
      >
        {isErr ? "错误" : "警告"}
      </span>
      <span style={{ fontSize: "12.5px", color: "var(--ink2)" }}>{msg}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "var(--ink3)" }}>{path}</span>
    </div>
  );
}

function diffLabelFor(d: string): string {
  return d === "easy" ? "简单" : d === "hard" ? "困难" : "中等";
}

function RadioRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
      <span
        style={{
          width: "17px",
          height: "17px",
          borderRadius: "50%",
          flex: "none",
          boxSizing: "border-box",
          border: on ? "5px solid var(--pri)" : "1.6px solid #CAD1DE",
        }}
      />
      <span style={{ fontSize: "13.5px", color: "var(--ink)", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function Stat({ tint, label, n, icon }: { tint: string; label: string; n: number; icon: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", border: "1px solid var(--line)", borderRadius: "9px", padding: "8px 14px", background: "var(--surface)" }}>
      <span style={{ fontSize: "14px" }}>{icon}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "18px", fontWeight: 700, color: tint }}>{n}</span>
      <span style={{ fontSize: "12.5px", color: "var(--ink3)" }}>{label}</span>
    </div>
  );
}

function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontFamily: "'JetBrains Mono',monospace",
  letterSpacing: ".08em",
  color: "var(--ink3)",
  fontWeight: 600,
  marginBottom: "6px",
};

export default ImportWizard;

"use client";

// components/admin/question-editor.tsx
// A JSON editor for a single QuestionRecord (v1 admin editor per the plan). It is a JSON textarea
// prefilled with the record: on "新建题目" it starts from a per-type skeleton; on "编辑" it is
// seeded with the existing record (fetched server-side via getRowForAdmin and passed as
// initialRecord). Submit runs createQuestionAction / updateQuestionAction — the record is
// DEEP-validated server-side by validateEnvelope, so client-side we only parse JSON and surface the
// per-field errors the action returns. Never trusts client role/status: create lands in draft,
// status transitions happen through the status actions.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuestionAction, updateQuestionAction } from "@/lib/actions/admin";
import { Banner, ghostBtnStyle, inputStyle, monoTextareaStyle, priBtnStyle } from "./ui";

const SKELETON = {
  id: "",
  type: "single_choice",
  difficulty: "medium",
  stem: "",
  tags: [],
  options: [
    { k: "A", t: "" },
    { k: "B", t: "" },
  ],
  answer: "A",
  explanation: { text: "" },
};

export interface QuestionEditorProps {
  mode: "create" | "edit";
  /** For edit: the record's id (target). For create: ignored. */
  targetId?: string;
  /** For edit: the existing record JSON (from payload). For create: undefined → skeleton. */
  initialRecord?: unknown;
  /** For create: the bank the new question lands in. */
  bankId?: string;
  onDone?: () => void;
  onCancel?: () => void;
}

export function QuestionEditor({ mode, targetId, initialRecord, bankId, onDone, onCancel }: QuestionEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bank, setBank] = useState(bankId ?? "");
  const [text, setText] = useState(() =>
    JSON.stringify(mode === "edit" && initialRecord ? initialRecord : SKELETON, null, 2),
  );
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [okMsg, setOkMsg] = useState<string | null>(null);

  function submit() {
    setError(null);
    setFields({});
    setOkMsg(null);

    let record: unknown;
    try {
      record = JSON.parse(text);
    } catch (e) {
      setError("JSON 解析失败：" + (e instanceof Error ? e.message : String(e)));
      return;
    }

    if (mode === "create" && !bank.trim()) {
      setError("请填写题库 ID（bankId）");
      return;
    }

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createQuestionAction({ bankId: bank.trim(), record })
          : await updateQuestionAction({ id: targetId, record });

      if (res.ok) {
        setOkMsg(mode === "create" ? "已创建（草稿）" : "已保存");
        router.refresh();
        onDone?.();
        return;
      }
      setError(res.error.message ?? "保存失败");
      if (res.error.fields) setFields(res.error.fields);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {error && <Banner kind="error">{error}</Banner>}
      {okMsg && <Banner kind="success">{okMsg}</Banner>}

      {Object.keys(fields).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {Object.entries(fields).map(([path, msg]) => (
            <div key={path} style={{ display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#D63C31" }}>{path}</span>
              <span style={{ fontSize: "12.5px", color: "var(--ink2)" }}>{msg}</span>
            </div>
          ))}
        </div>
      )}

      {mode === "create" && (
        <div>
          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--ink2)", marginBottom: "6px" }}>
            题库 ID（bankId）
          </label>
          <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="例如 clx… 的题库 cuid" style={inputStyle} />
        </div>
      )}

      <div>
        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--ink2)", marginBottom: "6px" }}>
          题目记录 JSON（QuestionRecord，服务端经 validateEnvelope 深校验）
        </label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={18} spellCheck={false} style={{ ...monoTextareaStyle, minHeight: "320px" }} />
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        <button onClick={submit} disabled={pending} style={{ ...priBtnStyle, opacity: pending ? 0.6 : 1, cursor: pending ? "not-allowed" : "pointer" }}>
          {pending ? "保存中…" : mode === "create" ? "创建题目" : "保存修改"}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={pending} style={ghostBtnStyle}>
            取消
          </button>
        )}
      </div>
    </div>
  );
}

export default QuestionEditor;

"use client";

// components/admin/questions-manager.tsx
// Client shell for the questions admin table. The server page fetches the QuestionCard[] (mirror
// columns only — no payload) plus the current filters and passes them in; this component renders
// the table, the per-row actions (发布/下架 via setQuestionStatusAction, 删除 via
// deleteQuestionAction with a confirm), and hosts the "新建题目" / "编辑" JSON editor. Editing
// lazily fetches the full record from the server through a passed-in loader (getRowForAdmin is
// server-only, so the page wires a server action / route — here we accept an async fetcher prop to
// keep the boundary clean).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteQuestionAction, getQuestionRecordAction, setQuestionStatusAction } from "@/lib/actions/admin";
import type { QuestionCard } from "@/lib/server/services/questionService";
import type { AdminBank } from "@/lib/server/services/adminService";
import {
  Banner,
  DiffChip,
  StatusPill,
  Table,
  Td,
  Th,
  TypeChip,
  dangerBtnStyle,
  ghostBtnStyle,
  priBtnStyle,
  truncate,
} from "./ui";
import { QuestionEditor } from "./question-editor";

export interface QuestionsManagerProps {
  items: QuestionCard[];
  /** Banks for the create-editor's bankId <select> (replaces the old free-text cuid input). */
  banks: AdminBank[];
  /** Cursor-pagination links computed on the server (preserve current filters). */
  nextHref: string | null;
  firstHref: string | null;
}

type EditorState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; id: string; record: unknown };

export function QuestionsManager({ items, banks, nextHref, firstHref }: QuestionsManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({ kind: "closed" });

  function changeStatus(id: string, status: "published" | "archived") {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await setQuestionStatusAction({ id, status });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error.message ?? "操作失败");
        return;
      }
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!window.confirm(`确认删除题目 ${id}？该操作会级联删除其作答/进度记录，不可撤销。`)) return;
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await deleteQuestionAction({ id });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error.message ?? "删除失败");
        return;
      }
      router.refresh();
    });
  }

  function openEdit(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await getQuestionRecordAction({ id });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error.message ?? "无法加载该题目记录");
        return;
      }
      setEditor({ kind: "edit", id, record: res.data.record });
    });
  }

  if (editor.kind === "create") {
    return (
      <div>
        <EditorHeader title="新建题目" onBack={() => setEditor({ kind: "closed" })} />
        <QuestionEditor mode="create" banks={banks} onDone={() => setEditor({ kind: "closed" })} onCancel={() => setEditor({ kind: "closed" })} />
      </div>
    );
  }

  if (editor.kind === "edit") {
    return (
      <div>
        <EditorHeader title={`编辑题目 · ${editor.id}`} onBack={() => setEditor({ kind: "closed" })} />
        <QuestionEditor
          mode="edit"
          targetId={editor.id}
          initialRecord={editor.record}
          onDone={() => setEditor({ kind: "closed" })}
          onCancel={() => setEditor({ kind: "closed" })}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setEditor({ kind: "create" })} style={priBtnStyle}>
          + 新建题目
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <Table
        head={
          <>
            <Th>ID</Th>
            <Th>题型</Th>
            <Th>难度</Th>
            <Th>状态</Th>
            <Th>题干</Th>
            <Th style={{ textAlign: "right" }}>操作</Th>
          </>
        }
      >
        {items.length === 0 ? (
          <tr>
            <Td colSpan={6} style={{ textAlign: "center", color: "var(--ink3)" }}>
              暂无题目
            </Td>
          </tr>
        ) : (
          items.map((q) => {
            const busy = pending && busyId === q.id;
            return (
              <tr key={q.id}>
                <Td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--ink2)" }}>{q.id}</Td>
                <Td>
                  <TypeChip type={q.type} />
                </Td>
                <Td>
                  <DiffChip difficulty={q.difficulty} />
                </Td>
                <Td>
                  <StatusPill status={q.status} />
                </Td>
                <Td style={{ color: "var(--ink2)", maxWidth: "320px" }}>{truncate(q.stemText)}</Td>
                <Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button onClick={() => openEdit(q.id)} disabled={busy} style={smallBtn(ghostBtnStyle)}>
                      编辑
                    </button>
                    {q.status !== "published" ? (
                      <button onClick={() => changeStatus(q.id, "published")} disabled={busy} style={smallBtn(priBtnStyle)}>
                        发布
                      </button>
                    ) : (
                      <button onClick={() => changeStatus(q.id, "archived")} disabled={busy} style={smallBtn(ghostBtnStyle)}>
                        下架
                      </button>
                    )}
                    <button onClick={() => remove(q.id)} disabled={busy} style={smallBtn(dangerBtnStyle)}>
                      删除
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })
        )}
      </Table>

      {(firstHref || nextHref) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "12px", color: "var(--ink3)" }}>
            本页 {items.length} 条{nextHref ? "，还有更多" : ""}
          </div>
          <div style={{ display: "inline-flex", gap: "8px" }}>
            {firstHref && (
              <Link href={firstHref} style={{ ...ghostBtnStyle, padding: "7px 13px", fontSize: "12px", textDecoration: "none" }}>
                ← 回到第一页
              </Link>
            )}
            {nextHref && (
              <Link href={nextHref} style={{ ...ghostBtnStyle, padding: "7px 13px", fontSize: "12px", textDecoration: "none" }}>
                下一页 →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function smallBtn(base: React.CSSProperties): React.CSSProperties {
  return { ...base, padding: "6px 11px", fontSize: "12px" };
}

function EditorHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
      <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>{title}</div>
      <button onClick={onBack} style={{ ...ghostBtnStyle, padding: "6px 12px", fontSize: "12px" }}>
        ← 返回列表
      </button>
    </div>
  );
}

export default QuestionsManager;

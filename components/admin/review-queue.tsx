"use client";

// components/admin/review-queue.tsx
// The in_review publish queue (architecture §5.5). The server page fetches the QuestionCard[]
// filtered to status:in_review (via listReviewQueueAction on the server) and passes them in.
// This client shell renders a checklist; "批量发布" calls bulkPublishAction with the selected ids,
// transitioning them to published (+ publishedAt). Empty selection is disabled. Never trusts the
// client for status — the action is requireAdmin-guarded and the service owns the transition.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkPublishAction } from "@/lib/actions/admin";
import type { QuestionCard } from "@/lib/server/services/questionService";
import { Banner, DiffChip, TypeChip, priBtnStyle, truncate } from "./ui";

export function ReviewQueue({ items }: { items: QuestionCard[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((q) => q.id)));
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = items.length > 0 && selected.size === items.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((q) => q.id)));
  }

  function publish() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      const res = await bulkPublishAction({ ids });
      if (!res.ok) {
        setError(res.error.message ?? "发布失败");
        return;
      }
      // Clear selection before the refresh: the just-published ids leave the in_review queue, so a
      // stale `selected` would make the "全选（selected.size/items.length）" counter read wrong
      // (e.g. 5/3) after a partial publish. The useState initializer only runs on mount, so we must
      // reset explicitly rather than rely on the shrinking `items` prop.
      setSelected(new Set());
      setOkMsg(`已发布 ${res.data.published} 题`);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return <Banner kind="info">审核队列为空 —— 没有待发布（in_review）的题目。</Banner>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {error && <Banner kind="error">{error}</Banner>}
      {okMsg && <Banner kind="success">{okMsg}</Banner>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "var(--ink2)" }}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          全选（{selected.size}/{items.length}）
        </label>
        <button
          onClick={publish}
          disabled={pending || selected.size === 0}
          style={{ ...priBtnStyle, opacity: pending || selected.size === 0 ? 0.5 : 1, cursor: pending || selected.size === 0 ? "not-allowed" : "pointer" }}
        >
          {pending ? "发布中…" : `批量发布 ${selected.size} 题`}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {items.map((q) => {
          const on = selected.has(q.id);
          return (
            <label
              key={q.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                border: `1px solid ${on ? "var(--pri-w2, var(--line))" : "var(--line)"}`,
                background: on ? "var(--pri-w)" : "var(--surface)",
                borderRadius: "10px",
                cursor: "pointer",
              }}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(q.id)} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--ink3)", flex: "none" }}>{q.id}</span>
              <TypeChip type={q.type} />
              <DiffChip difficulty={q.difficulty} />
              <span style={{ fontSize: "13px", color: "var(--ink2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{truncate(q.stemText, 80)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default ReviewQueue;

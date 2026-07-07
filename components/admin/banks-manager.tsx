"use client";

// components/admin/banks-manager.tsx
// Client shell for 题库管理 (bank management). The server page fetches AdminBankDetail[] (metadata +
// live question counts) and passes them in; this component renders the table, a "新建题库" form,
// per-row 编辑, and 删除 (guarded to EMPTY banks only — the service re-checks and the FK is Restrict).
// Writes go through createBank/updateBank/deleteBankAction; success → router.refresh() re-runs the
// server component (the single source of truth), matching the rest of the admin console.

import { useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createBankAction, deleteBankAction, updateBankAction } from "@/lib/actions/admin";
import type { AdminBankDetail } from "@/lib/server/services/adminService";
import {
  Banner,
  Card,
  Table,
  Td,
  Th,
  dangerBtnStyle,
  ghostBtnStyle,
  inputStyle,
  monoTextareaStyle,
  priBtnStyle,
} from "./ui";

type EditorState = { kind: "closed" } | { kind: "create" } | { kind: "edit"; bank: AdminBankDetail };

export function BanksManager({ banks }: { banks: AdminBankDetail[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({ kind: "closed" });

  function openCreate() {
    setError(null);
    setOkMsg(null);
    setEditor({ kind: "create" });
  }
  function openEdit(bank: AdminBankDetail) {
    setError(null);
    setOkMsg(null);
    setEditor({ kind: "edit", bank });
  }

  function remove(bank: AdminBankDetail) {
    // Client-side guard mirrors the server rule (deletion only when empty) for an instant, clear
    // refusal; the service (adminService.deleteBank) re-checks and the FK is Restrict either way.
    if (bank.questionCount > 0) {
      setError(`题库「${bank.title}」仍有 ${bank.questionCount} 道题目，无法删除。请先删除或迁移这些题目。`);
      return;
    }
    if (!window.confirm(`确认删除题库「${bank.title}」（${bank.slug}）？该操作不可撤销。`)) return;
    setError(null);
    setOkMsg(null);
    setBusyId(bank.id);
    startTransition(async () => {
      const res = await deleteBankAction({ id: bank.id });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error.message ?? "删除失败");
        return;
      }
      setOkMsg(`已删除题库「${bank.title}」`);
      router.refresh();
    });
  }

  if (editor.kind !== "closed") {
    return (
      <div>
        <EditorHeader
          title={editor.kind === "create" ? "新建题库" : `编辑题库 · ${editor.bank.title}`}
          onBack={() => setEditor({ kind: "closed" })}
        />
        <BankForm
          key={editor.kind === "edit" ? editor.bank.id : "create"}
          mode={editor.kind}
          bank={editor.kind === "edit" ? editor.bank : undefined}
          onDone={(msg) => {
            setOkMsg(msg);
            setEditor({ kind: "closed" });
          }}
          onCancel={() => setEditor({ kind: "closed" })}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {okMsg && <Banner kind="success">{okMsg}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={openCreate} style={priBtnStyle}>
          + 新建题库
        </button>
      </div>

      <Table
        head={
          <>
            <Th>题库</Th>
            <Th>slug</Th>
            <Th>访问</Th>
            <Th style={{ textAlign: "right" }}>排序</Th>
            <Th style={{ textAlign: "right" }}>题目数</Th>
            <Th style={{ textAlign: "right" }}>操作</Th>
          </>
        }
      >
        {banks.length === 0 ? (
          <tr>
            <Td colSpan={6} style={{ textAlign: "center", color: "var(--ink3)" }}>
              暂无题库，点击「新建题库」创建第一个。
            </Td>
          </tr>
        ) : (
          banks.map((b) => {
            const busy = pending && busyId === b.id;
            const empty = b.questionCount === 0;
            return (
              <tr key={b.id}>
                <Td>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{b.title}</div>
                  {b.description && (
                    <div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "3px", maxWidth: "360px" }}>
                      {b.description}
                    </div>
                  )}
                </Td>
                <Td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--ink2)" }}>{b.slug}</Td>
                <Td>
                  <AccessChip isPremium={b.isPremium} />
                </Td>
                <Td style={{ textAlign: "right", color: "var(--ink2)", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px" }}>{b.sortOrder}</Td>
                <Td style={{ textAlign: "right", color: "var(--ink2)", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px" }}>{b.questionCount}</Td>
                <Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ display: "inline-flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button onClick={() => openEdit(b)} disabled={busy} style={smallBtn(ghostBtnStyle)}>
                      编辑
                    </button>
                    <button
                      onClick={() => remove(b)}
                      disabled={busy || !empty}
                      title={empty ? undefined : "题库非空，无法删除"}
                      style={{ ...smallBtn(dangerBtnStyle), opacity: empty ? 1 : 0.45, cursor: empty ? "pointer" : "not-allowed" }}
                    >
                      删除
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })
        )}
      </Table>
    </div>
  );
}

// ---- Create / edit form ----

function BankForm({
  mode,
  bank,
  onDone,
  onCancel,
}: {
  mode: "create" | "edit";
  bank?: AdminBankDetail;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(bank?.title ?? "");
  const [slug, setSlug] = useState(bank?.slug ?? "");
  const [description, setDescription] = useState(bank?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(bank?.sortOrder ?? 0));
  const [isPremium, setIsPremium] = useState(bank?.isPremium ?? false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  function submit() {
    setError(null);
    setFields({});

    const so = sortOrder.trim() === "" ? 0 : Number(sortOrder);
    if (!Number.isInteger(so) || so < 0) {
      setError("排序值必须是非负整数");
      return;
    }

    startTransition(async () => {
      const desc = description.trim();
      const res =
        mode === "create"
          ? await createBankAction({
              title: title.trim(),
              slug: slug.trim(),
              description: desc || undefined,
              isPremium,
              sortOrder: so,
            })
          : await updateBankAction({
              id: bank!.id,
              title: title.trim(),
              // Empty textarea explicitly CLEARS the description (null); slug is never sent (immutable).
              description: desc ? desc : null,
              isPremium,
              sortOrder: so,
            });

      if (res.ok) {
        onDone(mode === "create" ? `已创建题库「${res.data.title}」` : `已保存题库「${res.data.title}」`);
        router.refresh();
        return;
      }
      setError(res.error.message ?? "保存失败");
      if (res.error.fields) setFields(res.error.fields);
    });
  }

  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {error && <Banner kind="error">{error}</Banner>}

        <Field label="标题" hint="题库的显示名称，例如「前端核心题库」" error={fields.title}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="前端核心题库" style={inputStyle} />
        </Field>

        {mode === "create" ? (
          <Field label="slug（唯一标识，创建后不可修改）" hint="仅小写字母、数字与连字符，例如 frontend-core" error={fields.slug}>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="frontend-core" style={{ ...inputStyle, fontFamily: "'JetBrains Mono',monospace" }} />
          </Field>
        ) : (
          <Field label="slug（不可修改）">
            <input value={slug} disabled style={{ ...inputStyle, fontFamily: "'JetBrains Mono',monospace", opacity: 0.6, cursor: "not-allowed" }} />
          </Field>
        )}

        <Field label="描述（可选）" error={fields.description}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="题库简介，展示给管理员"
            style={{ ...monoTextareaStyle, minHeight: "72px", fontFamily: "inherit" }}
          />
        </Field>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", alignItems: "flex-end" }}>
          <div style={{ width: "140px" }}>
            <Field label="排序（升序）" error={fields.sortOrder}>
              <input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                style={{ ...inputStyle, fontFamily: "'JetBrains Mono',monospace" }}
              />
            </Field>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "9px", cursor: "pointer", paddingBottom: "9px" }}>
            <input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} />
            <span style={{ fontSize: "13px", color: "var(--ink2)" }}>标记为 Plus 专属</span>
          </label>
        </div>
        <div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "-6px" }}>
          Plus 会员即将推出。勾选后本题库将预留给 Plus 专属，暂不对免费用户开放；如需现在上线内容请保持未勾选。
        </div>

        <div style={{ display: "flex", gap: "10px", paddingTop: "4px" }}>
          <button
            onClick={submit}
            disabled={pending}
            style={{ ...priBtnStyle, opacity: pending ? 0.6 : 1, cursor: pending ? "not-allowed" : "pointer" }}
          >
            {pending ? "保存中…" : mode === "create" ? "创建题库" : "保存修改"}
          </button>
          <button onClick={onCancel} disabled={pending} style={ghostBtnStyle}>
            取消
          </button>
        </div>
      </div>
    </Card>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--ink2)", marginBottom: "6px" }}>{label}</label>
      {children}
      {hint && !error && <div style={{ fontSize: "11.5px", color: "var(--ink3)", marginTop: "5px" }}>{hint}</div>}
      {error && <div style={{ fontSize: "12px", color: "#D63C31", marginTop: "5px" }}>{error}</div>}
    </div>
  );
}

function AccessChip({ isPremium }: { isPremium: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "6px",
        padding: "3px 9px",
        fontSize: "12px",
        fontWeight: 600,
        color: isPremium ? "#B7791F" : "#0A7D4E",
        background: isPremium ? "rgba(247,144,9,.12)" : "rgba(18,183,106,.12)",
        whiteSpace: "nowrap",
      }}
    >
      {isPremium ? "Plus 专属" : "免费"}
    </span>
  );
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

function smallBtn(base: CSSProperties): CSSProperties {
  return { ...base, padding: "6px 11px", fontSize: "12px" };
}

export default BanksManager;

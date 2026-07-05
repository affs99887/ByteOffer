"use client";

// components/billing/delete-account-button.tsx
// Client "delete account" control (architecture §6.5). A two-step confirm guards the destructive
// action: the first click reveals a typed-confirm panel; only an explicit confirm calls
// deleteAccountAction(). The action cancels any live Stripe subscription first, then cascade-deletes
// the user. On success we hard-navigate to /login (the session is now invalid).

import { useState, useTransition } from "react";
import { deleteAccountAction } from "@/lib/actions/billing";

export function DeleteAccountButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const CONFIRM_WORD = "删除";

  function doDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteAccountAction({});
      if (res.ok) {
        // Session is gone; leave the app.
        window.location.href = "/login";
        return;
      }
      setError(res.error.message ?? "删除失败，请稍后再试");
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={dangerBtn}
      >
        删除账户
      </button>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #F3D0CE",
        background: "rgba(240,68,56,.06)",
        borderRadius: "10px",
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: "13.5px", color: "var(--ink)", fontWeight: 600, marginBottom: "6px" }}>
        确认删除账户？
      </div>
      <div style={{ fontSize: "12.5px", color: "var(--ink2)", lineHeight: 1.55, marginBottom: "10px" }}>
        此操作不可撤销：将取消你的订阅并永久删除全部刷题记录、错题本与收藏。请输入「{CONFIRM_WORD}」以确认。
      </div>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={CONFIRM_WORD}
        style={{
          width: "100%",
          maxWidth: "200px",
          boxSizing: "border-box",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "8px",
          padding: "8px 11px",
          fontSize: "13px",
          color: "var(--ink)",
          outline: "none",
          fontFamily: "inherit",
          marginBottom: "10px",
        }}
      />
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <button
          onClick={doDelete}
          disabled={pending || text.trim() !== CONFIRM_WORD}
          style={{
            ...dangerBtn,
            background: "#D63C31",
            color: "#fff",
            border: "1px solid #D63C31",
            opacity: pending || text.trim() !== CONFIRM_WORD ? 0.55 : 1,
            cursor: pending || text.trim() !== CONFIRM_WORD ? "default" : "pointer",
          }}
        >
          {pending ? "删除中…" : "确认删除"}
        </button>
        <button
          onClick={() => {
            setConfirming(false);
            setText("");
            setError(null);
          }}
          disabled={pending}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
            borderRadius: "8px",
            padding: "9px 16px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          取消
        </button>
      </div>
      {error && (
        <div style={{ color: "#D63C31", fontSize: "12.5px", marginTop: "10px", lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  );
}

const dangerBtn: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid #F3D0CE",
  color: "#D63C31",
  borderRadius: "8px",
  padding: "9px 18px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

export default DeleteAccountButton;

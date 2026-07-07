"use client";

// components/auth/ui.tsx (3b-2)
// Shared building blocks for the auth forms — a brand header, the card frame, styled inputs, the
// primary submit button, status banners, and the ResendVerifyButton shared by the register success
// view and the login "邮箱未验证" prompt. All inline-style + CSS-var to match the app look. Mostly
// presentational; the one action-wired piece (ResendVerifyButton) lives here so both forms reuse it.

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { resendVerificationAction } from "@/lib/actions/auth";

export const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "400px",
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "16px",
  padding: "34px 30px 30px",
  boxShadow: "0 12px 40px rgba(20,26,45,.08)",
  boxSizing: "border-box",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "12.5px",
  fontWeight: 600,
  color: "var(--ink2)",
  marginBottom: "7px",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  borderRadius: "9px",
  padding: "11px 13px",
  fontSize: "14px",
  color: "var(--ink)",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color .12s",
};

export const primaryBtnStyle: CSSProperties = {
  width: "100%",
  background: "var(--pri)",
  border: "1px solid var(--pri)",
  color: "#fff",
  borderRadius: "9px",
  padding: "12px",
  fontSize: "14px",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 6px 16px rgba(45,91,255,.24)",
  transition: "opacity .12s",
};

export const oauthBtnStyle: CSSProperties = {
  width: "100%",
  background: "var(--surface)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  borderRadius: "9px",
  padding: "11px",
  fontSize: "13.5px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "9px",
};

export const linkStyle: CSSProperties = {
  color: "var(--pri)",
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
};

// A <button> that reads as a text link (for in-form actions like "重新发送" that must not be an <a>).
export const linkBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--pri)",
  fontWeight: 600,
  fontSize: "13px",
  fontFamily: "inherit",
  cursor: "pointer",
};

export function BrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <div style={{ marginBottom: "26px", textAlign: "center" }}>
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          background: "var(--pri)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 20px rgba(45,91,255,.35)",
          marginBottom: "14px",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
        </svg>
      </div>
      <div
        style={{
          fontFamily: "'Space Grotesk',sans-serif",
          fontSize: "22px",
          fontWeight: 700,
          color: "var(--ink)",
          letterSpacing: ".3px",
        }}
      >
        ByteOffer
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: "12px",
          color: "var(--ink3)",
          marginTop: "6px",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div style={{ fontSize: "12px", color: "#D63C31", marginTop: "6px" }}>{msg}</div>
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
        padding: "11px 13px",
        fontSize: "13px",
        fontWeight: 500,
        marginBottom: "16px",
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

export const dividerRow = (label: string): ReactNode => (
  <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "18px 0" }}>
    <div style={{ flex: 1, height: "1px", background: "var(--line)" }} />
    <span style={{ fontSize: "11.5px", color: "var(--ink3)", fontWeight: 500 }}>{label}</span>
    <div style={{ flex: 1, height: "1px", background: "var(--line)" }} />
  </div>
);

/**
 * ResendVerifyButton — inline "重新发送验证邮件" control shared by the register success view and the
 * login "邮箱未验证" prompt. Calls the enumeration-safe resendVerificationAction (always ok) with the
 * email the user just submitted and shows a transient, non-committal acknowledgement — the wording
 * never confirms the address exists. `email` is always the just-typed (required) field, so it is
 * non-empty in practice; the guard is belt-and-suspenders.
 */
export function ResendVerifyButton({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function onClick() {
    if (!email) return;
    setSent(false);
    startTransition(async () => {
      await resendVerificationAction({ email });
      setSent(true);
    });
  }

  return (
    <div style={{ marginTop: "10px", textAlign: "center" }}>
      <button type="button" onClick={onClick} disabled={pending || !email} style={{ ...linkBtnStyle, opacity: pending ? 0.6 : 1 }}>
        {pending ? "发送中…" : "重新发送验证邮件"}
      </button>
      {sent && (
        <div style={{ fontSize: "12.5px", color: "var(--ink3)", marginTop: "6px", lineHeight: 1.5 }}>
          如果该邮箱有待验证的账号，我们已重新发送（请查收，含垃圾箱）。
        </div>
      )}
    </div>
  );
}

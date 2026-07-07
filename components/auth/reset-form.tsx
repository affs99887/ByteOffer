"use client";

// components/auth/reset-form.tsx (3b-2)
// Two modes in one component:
//   - no token  → the REQUEST form (requestPasswordResetAction). Enumeration-safe: the terminal copy
//     depends only on the returned `mode` (server email config), never on whether the email exists —
//     "sent" shows the usual "如果该邮箱已注册…" line; "disabled" (no email service) tells the user
//     self-serve recovery is unavailable and to contact the admin (reveals config, not existence).
//   - token set → the NEW-PASSWORD form (resetPasswordAction). On ok → success + link to /login.
// The token comes from the ?token= query, resolved server-side and passed as a prop.

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { requestPasswordResetAction, resetPasswordAction } from "@/lib/actions/auth";
import {
  Banner,
  BrandHeader,
  cardStyle,
  FieldError,
  inputStyle,
  labelStyle,
  linkStyle,
  primaryBtnStyle,
} from "./ui";

export function ResetForm({ token }: { token?: string }) {
  if (token) return <NewPasswordForm token={token} />;
  return <RequestForm />;
}

function RequestForm() {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<null | "sent" | "disabled">(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    startTransition(async () => {
      // Enumeration-safe: the terminal state depends only on `mode` (server email config), never on
      // whether the email exists. Any non-ok envelope (e.g. rate limit) falls back to generic "sent".
      const res = await requestPasswordResetAction({ email });
      setOutcome(res.ok ? res.data.mode : "sent");
    });
  }

  if (outcome) {
    return (
      <div style={cardStyle}>
        <BrandHeader subtitle="// 找回密码" />
        {outcome === "disabled" ? (
          <Banner kind="info">
            邮件服务未配置，暂无法自助找回密码，请联系管理员协助重置。
          </Banner>
        ) : (
          <Banner kind="success">
            如果该邮箱已注册，我们已向其发送重置链接（1 小时内有效）。请查收邮件（含垃圾箱）。
          </Banner>
        )}
        <div style={{ textAlign: "center", fontSize: "13px", color: "var(--ink3)", marginTop: "8px" }}>
          <Link href="/login" style={linkStyle}>返回登录</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <BrandHeader subtitle="// 找回密码" />
      <div style={{ fontSize: "13px", color: "var(--ink3)", marginBottom: "18px", lineHeight: 1.6 }}>
        输入你的注册邮箱，我们会发送一个密码重置链接。
      </div>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle} htmlFor="email">邮箱</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" style={inputStyle} />
        </div>
        <button type="submit" disabled={pending} style={{ ...primaryBtnStyle, opacity: pending ? 0.7 : 1 }}>
          {pending ? "发送中…" : "发送重置链接"}
        </button>
      </form>
      <div style={{ marginTop: "22px", textAlign: "center", fontSize: "13px", color: "var(--ink3)" }}>
        <Link href="/login" style={linkStyle}>返回登录</Link>
      </div>
    </div>
  );
}

function NewPasswordForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFields({});
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    startTransition(async () => {
      const res = await resetPasswordAction({ token, password });
      if (res.ok) {
        setDone(true);
        return;
      }
      if (res.error.fields && Object.keys(res.error.fields).length > 0) {
        setFields(res.error.fields);
      } else {
        setFormError(res.error.message ?? "重置失败，链接可能已失效");
      }
    });
  }

  if (done) {
    return (
      <div style={cardStyle}>
        <BrandHeader subtitle="// 重置密码" />
        <Banner kind="success">密码已重置，请使用新密码登录。</Banner>
        <div style={{ textAlign: "center", fontSize: "13px", color: "var(--ink3)", marginTop: "8px" }}>
          <Link href="/login" style={linkStyle}>前往登录</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <BrandHeader subtitle="// 设置新密码" />
      {formError && <Banner kind="error">{formError}</Banner>}
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle} htmlFor="password">新密码</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required placeholder="至少 10 位，含字母与数字" style={inputStyle} />
          <FieldError msg={fields.password} />
          <FieldError msg={fields.token} />
        </div>
        <button type="submit" disabled={pending} style={{ ...primaryBtnStyle, opacity: pending ? 0.7 : 1 }}>
          {pending ? "提交中…" : "重置密码"}
        </button>
      </form>
      <div style={{ marginTop: "22px", textAlign: "center", fontSize: "13px", color: "var(--ink3)" }}>
        <Link href="/login" style={linkStyle}>返回登录</Link>
      </div>
    </div>
  );
}

export default ResetForm;

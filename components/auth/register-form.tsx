"use client";

// components/auth/register-form.tsx (3b-2)
// Registration form → registerAction. The response is enumeration-safe (identical whether or not
// the email exists), so we NEVER reveal whether the account already existed. The success view is
// DUAL-MODE on the returned `mode` (which reflects only server email config, not account existence):
//   - "verify" (email configured) → 验证邮件已发送至 <email>，请查收（含垃圾箱） + a 重新发送 button.
//   - "active" (no email service)  → 注册成功，已可直接登录 → /login (no fake "邮件已发送").
// Field errors (weak password, bad email) come back in error.fields and render inline.

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { registerAction } from "@/lib/actions/auth";
import {
  Banner,
  BrandHeader,
  cardStyle,
  FieldError,
  inputStyle,
  labelStyle,
  linkStyle,
  primaryBtnStyle,
  ResendVerifyButton,
} from "./ui";

export function RegisterForm() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<null | { mode: "verify" | "active"; email: string }>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFields({});
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    startTransition(async () => {
      const res = await registerAction({ email, password, ...(name ? { name } : {}) });
      if (res.ok) {
        setDone({ mode: res.data.mode, email });
        return;
      }
      if (res.error.fields && Object.keys(res.error.fields).length > 0) {
        setFields(res.error.fields);
      } else {
        setFormError(res.error.message ?? "注册失败，请稍后再试");
      }
    });
  }

  if (done) {
    return (
      <div style={cardStyle}>
        <BrandHeader subtitle="// 注册" />
        {done.mode === "verify" ? (
          <>
            <Banner kind="success">
              验证邮件已发送至 {done.email}，请查收（含垃圾箱）。点击邮件中的链接完成验证后即可登录（24 小时内有效）。
            </Banner>
            <ResendVerifyButton email={done.email} />
          </>
        ) : (
          <Banner kind="success">注册成功，已可直接登录。</Banner>
        )}
        <div style={{ textAlign: "center", fontSize: "13px", color: "var(--ink3)", marginTop: "12px" }}>
          <Link href="/login" style={linkStyle}>{done.mode === "active" ? "前往登录" : "返回登录"}</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <BrandHeader subtitle="// 创建你的账号" />

      {formError && <Banner kind="error">{formError}</Banner>}

      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle} htmlFor="name">昵称（可选）</label>
          <input id="name" name="name" type="text" autoComplete="nickname" placeholder="前端小白" style={inputStyle} />
          <FieldError msg={fields.name} />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle} htmlFor="email">邮箱</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" style={inputStyle} />
          <FieldError msg={fields.email} />
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle} htmlFor="password">密码</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required placeholder="至少 10 位，含字母与数字" style={inputStyle} />
          <FieldError msg={fields.password} />
        </div>
        <button type="submit" disabled={pending} style={{ ...primaryBtnStyle, opacity: pending ? 0.7 : 1 }}>
          {pending ? "提交中…" : "注册"}
        </button>
      </form>

      <div style={{ marginTop: "14px", textAlign: "center", fontSize: "12px", color: "var(--ink3)", lineHeight: 1.6 }}>
        注册即代表你同意
        <Link href="/terms" style={{ ...linkStyle, margin: "0 3px" }}>服务条款</Link>
        与
        <Link href="/privacy" style={{ ...linkStyle, margin: "0 3px" }}>隐私政策</Link>
      </div>

      <div style={{ marginTop: "16px", textAlign: "center", fontSize: "13px", color: "var(--ink3)" }}>
        已有账号？
        <Link href="/login" style={{ ...linkStyle, marginLeft: "6px" }}>登录</Link>
      </div>
    </div>
  );
}

export default RegisterForm;

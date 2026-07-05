"use client";

// components/auth/register-form.tsx (3b-2)
// Registration form → registerAction. The response is enumeration-safe (identical whether or not
// the email exists), so on ok we ALWAYS show the same "验证邮件已发送" confirmation — we never
// reveal whether the account already existed. Field errors (weak password, bad email) come back
// in error.fields and render inline.

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
} from "./ui";

export function RegisterForm() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
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
        setDone(true);
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
        <Banner kind="success">
          验证邮件已发送。请前往邮箱查收并点击验证链接完成注册（24 小时内有效）。
        </Banner>
        <div style={{ textAlign: "center", fontSize: "13px", color: "var(--ink3)", marginTop: "8px" }}>
          <Link href="/login" style={linkStyle}>返回登录</Link>
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

      <div style={{ marginTop: "22px", textAlign: "center", fontSize: "13px", color: "var(--ink3)" }}>
        已有账号？
        <Link href="/login" style={{ ...linkStyle, marginLeft: "6px" }}>登录</Link>
      </div>
    </div>
  );
}

export default RegisterForm;

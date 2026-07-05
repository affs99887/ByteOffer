"use client";

// components/auth/login-form.tsx (3b-2)
// Credential login form. Calls loginAction (Auth.js v5 signIn with redirect:false); on ok the
// client router.push("/app") drives navigation. Wrong email/password → 邮箱或密码错误; an unverified
// credential account (EMAIL_NOT_VERIFIED) → a distinct prompt. GitHub/Google buttons are rendered
// only when the provider is configured (props from the server page) and post to oauthSignInAction.

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginAction, oauthSignInAction } from "@/lib/actions/auth";
import {
  Banner,
  BrandHeader,
  cardStyle,
  dividerRow,
  inputStyle,
  labelStyle,
  linkStyle,
  oauthBtnStyle,
  primaryBtnStyle,
} from "./ui";

export function LoginForm({ github, google }: { github: boolean; google: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsVerify(false);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    startTransition(async () => {
      const res = await loginAction({ email, password });
      if (res.ok) {
        router.push("/app");
        router.refresh();
        return;
      }
      if (res.error.code === "EMAIL_NOT_VERIFIED") {
        setNeedsVerify(true);
        return;
      }
      setError("邮箱或密码错误");
    });
  }

  const hasOAuth = github || google;

  return (
    <div style={cardStyle}>
      <BrandHeader subtitle="// 登录你的账号" />

      {error && <Banner kind="error">{error}</Banner>}
      {needsVerify && (
        <Banner kind="info">
          该邮箱尚未验证。请查收注册时发送的验证邮件并完成验证后再登录。
        </Banner>
      )}

      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle} htmlFor="email">邮箱</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" style={inputStyle} />
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle} htmlFor="password">密码</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••••" style={inputStyle} />
        </div>
        <button type="submit" disabled={pending} style={{ ...primaryBtnStyle, opacity: pending ? 0.7 : 1 }}>
          {pending ? "登录中…" : "登录"}
        </button>
      </form>

      {hasOAuth && (
        <>
          {dividerRow("或使用第三方登录")}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {github && (
              <form action={async () => { await oauthSignInAction("github"); }}>
                <button type="submit" style={oauthBtnStyle}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.33.85 0 1.7.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 22 12c0-5.52-4.48-10-10-10z" /></svg>
                  使用 GitHub 登录
                </button>
              </form>
            )}
            {google && (
              <form action={async () => { await oauthSignInAction("google"); }}>
                <button type="submit" style={oauthBtnStyle}>
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" /><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z" /></svg>
                  使用 Google 登录
                </button>
              </form>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: "22px", textAlign: "center", fontSize: "13px", color: "var(--ink3)" }}>
        还没有账号？
        <Link href="/register" style={{ ...linkStyle, marginLeft: "6px" }}>注册</Link>
        <span style={{ margin: "0 8px", color: "var(--line)" }}>·</span>
        <Link href="/reset" style={linkStyle}>忘记密码？</Link>
      </div>
    </div>
  );
}

export default LoginForm;

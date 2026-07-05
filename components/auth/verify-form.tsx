"use client";

// components/auth/verify-form.tsx (3b-2)
// Email-verification handler. On mount it calls verifyEmailAction({token}) exactly once and shows
// success or a generic failure. A missing token short-circuits to the failure state. Success links
// to /login so the (now-verified) user can sign in.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { verifyEmailAction } from "@/lib/actions/auth";
import { Banner, BrandHeader, cardStyle, linkStyle } from "./ui";

type Status = "pending" | "success" | "error";

export function VerifyForm({ token }: { token?: string }) {
  const [status, setStatus] = useState<Status>(token ? "pending" : "error");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // guard against React 18/19 double-invoke in dev StrictMode
    (async () => {
      try {
        const res = await verifyEmailAction({ token });
        setStatus(res.ok ? "success" : "error");
      } catch {
        setStatus("error");
      }
    })();
  }, [token]);

  return (
    <div style={cardStyle}>
      <BrandHeader subtitle="// 邮箱验证" />
      {status === "pending" && <Banner kind="info">正在验证你的邮箱，请稍候…</Banner>}
      {status === "success" && (
        <Banner kind="success">邮箱验证成功！你现在可以登录了。</Banner>
      )}
      {status === "error" && (
        <Banner kind="error">验证链接无效或已过期。请重新注册或申请新的验证邮件。</Banner>
      )}
      <div style={{ textAlign: "center", fontSize: "13px", color: "var(--ink3)", marginTop: "8px" }}>
        {status === "success" ? (
          <Link href="/login" style={linkStyle}>前往登录</Link>
        ) : status === "error" ? (
          <Link href="/register" style={linkStyle}>返回注册</Link>
        ) : null}
      </div>
    </div>
  );
}

export default VerifyForm;

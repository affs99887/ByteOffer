"use client";

// components/billing/upsell.tsx
// Reusable "升级 Plus" prompt (architecture §6.4, §7.1 premium.upsell_viewed). Rendered by the
// client when a server gate throws a PAYMENT_REQUIRED reason — QUOTA_EXCEEDED (daily limit hit),
// PREMIUM_BANK_REQUIRED (Plus-only bank), or EXAM_MODE_REQUIRED. Phase 3's client can drop this in
// wherever an action returns { code: "PAYMENT_REQUIRED" }. It offers a link to /pricing and (when a
// priceId is provided) an inline one-click checkout.
//
// This is a presentational + light-interaction component only. It NEVER changes entitlement — the
// CTA either navigates to /pricing or starts a Checkout; the grant still happens webhook-side (§6.3).

import Link from "next/link";
import { CheckoutButton } from "./checkout-button";

/** The gate reason codes the server may surface (message strings from PaymentRequiredError). */
export type UpsellReason =
  | "QUOTA_EXCEEDED"
  | "PREMIUM_BANK_REQUIRED"
  | "EXAM_MODE_REQUIRED"
  | "GENERIC";

const COPY: Record<UpsellReason, { title: string; body: string }> = {
  QUOTA_EXCEEDED: {
    title: "今日免费额度已用完",
    body: "免费版每天可练习 30 题。升级 Plus 解锁无限刷题，继续保持手感。",
  },
  PREMIUM_BANK_REQUIRED: {
    title: "该题库为 Plus 专享",
    body: "升级 Plus 即可解锁全部高级题库与大厂真题。",
  },
  EXAM_MODE_REQUIRED: {
    title: "模拟考试为 Plus 功能",
    body: "升级 Plus 解锁限时模拟面试与整卷评分。",
  },
  GENERIC: {
    title: "升级 Plus 解锁全部功能",
    body: "无限刷题、全部题库、模拟面试与 AI 解析。",
  },
};

export function Upsell({
  reason = "GENERIC",
  priceId,
  compact = false,
}: {
  reason?: UpsellReason;
  /** When provided, renders an inline one-click checkout in addition to the /pricing link. */
  priceId?: string;
  /** Tighter padding for inline embedding (e.g. below a locked question). */
  compact?: boolean;
}) {
  const copy = COPY[reason] ?? COPY.GENERIC;
  return (
    <div
      role="note"
      style={{
        border: "1px solid var(--pri)",
        background: "var(--pri-w, rgba(45,91,255,.06))",
        borderRadius: "12px",
        padding: compact ? "14px 16px" : "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: "10.5px",
            letterSpacing: ".14em",
            color: "var(--pri)",
            fontWeight: 700,
          }}
        >
          // PLUS
        </span>
      </div>
      <div style={{ fontSize: compact ? "14px" : "16px", fontWeight: 700, color: "var(--ink)" }}>
        {copy.title}
      </div>
      <div style={{ fontSize: "13px", color: "var(--ink2)", lineHeight: 1.55 }}>{copy.body}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px", flexWrap: "wrap" }}>
        {priceId ? (
          <div style={{ minWidth: "160px" }}>
            <CheckoutButton priceId={priceId} style={{ padding: "9px 16px", fontSize: "13px" }}>
              升级到 Plus
            </CheckoutButton>
          </div>
        ) : null}
        <Link
          href="/pricing"
          style={{
            color: "var(--pri)",
            fontWeight: 600,
            fontSize: "13px",
            textDecoration: "none",
          }}
        >
          查看会员方案 →
        </Link>
      </div>
    </div>
  );
}

export default Upsell;

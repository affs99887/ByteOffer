// app/pricing/page.tsx
// PUBLIC pricing page (architecture §6.1). Server component: reads the Plan table for the live
// quota/flags + Stripe price ids (the local Plan table is the gating source of truth, §6.1), with a
// try/catch fallback to static copy so the page renders even when the DB is cold/absent at build
// time. force-dynamic so `next build` never prerenders it against a DB (it awaits auth() anyway).
//
// CTA logic: a logged-in visitor gets a client CheckoutButton (→ Stripe Checkout); an anonymous
// visitor gets a link to /register. Entitlement is NEVER granted here — checkout only starts a
// session; the grant happens webhook-side (§6.3).

import type { CSSProperties } from "react";
import Link from "next/link";
import { computeThemeVars, PRIMARY_PRESETS } from "@/lib/theme";
import { auth } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { prisma } from "@/lib/server/db";
import { CheckoutButton } from "@/components/billing/checkout-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "会员方案 · ByteOffer" };

const themeVars = computeThemeVars(PRIMARY_PRESETS[0], "light", "light");

interface PlanView {
  name: string;
  dailyQuota: number | null;
  premiumBanks: boolean;
  examMode: boolean;
  aiExplain: boolean;
  priceMonthly: string | null;
  priceYearly: string | null;
}

/** Static fallback matching the §6.1 spec numbers, used when the DB is unavailable. */
const FALLBACK: { free: PlanView; plus: PlanView } = {
  free: {
    name: "免费版",
    dailyQuota: 30,
    premiumBanks: false,
    examMode: true,
    aiExplain: false,
    priceMonthly: null,
    priceYearly: null,
  },
  plus: {
    name: "Plus 会员",
    dailyQuota: null,
    premiumBanks: true,
    examMode: true,
    aiExplain: true,
    priceMonthly: env.STRIPE_PRICE_PLUS_MONTHLY || null,
    priceYearly: env.STRIPE_PRICE_PLUS_YEARLY || null,
  },
};

async function loadPlans(): Promise<{ free: PlanView; plus: PlanView }> {
  try {
    const rows = await prisma.plan.findMany({ where: { tier: { in: ["free", "plus"] } } });
    const free = rows.find((r) => r.tier === "free");
    const plus = rows.find((r) => r.tier === "plus");
    if (!free || !plus) return FALLBACK;
    return {
      free: {
        name: free.name,
        dailyQuota: free.dailyQuota,
        premiumBanks: free.premiumBanks,
        examMode: free.examMode,
        aiExplain: free.aiExplain,
        priceMonthly: null,
        priceYearly: null,
      },
      plus: {
        name: plus.name,
        dailyQuota: plus.dailyQuota,
        premiumBanks: plus.premiumBanks,
        examMode: plus.examMode,
        aiExplain: plus.aiExplain,
        // Prefer the Plan row's stored price ids; fall back to env so checkout has an id either way.
        priceMonthly: plus.stripePriceIdMonthly || env.STRIPE_PRICE_PLUS_MONTHLY || null,
        priceYearly: plus.stripePriceIdYearly || env.STRIPE_PRICE_PLUS_YEARLY || null,
      },
    };
  } catch {
    // Cold/absent DB → static copy (hard constraint: build must not crash without a DB).
    return FALLBACK;
  }
}

export default async function PricingPage() {
  const session = await auth();
  const loggedIn = Boolean(session?.user);
  const { free, plus } = await loadPlans();

  return (
    <div
      className="bo-th"
      style={{
        ...(themeVars as unknown as CSSProperties),
        minHeight: "100vh",
        width: "100%",
        color: "var(--ink)",
        backgroundColor: "var(--canvas)",
        backgroundImage:
          "linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px)",
        backgroundSize: "30px 30px",
        fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif",
        padding: "56px 20px",
      }}
    >
      <div style={{ maxWidth: "920px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={mono}>// PRICING · 会员方案</div>
          <h1 style={{ fontSize: "30px", fontWeight: 800, color: "var(--ink)", margin: "10px 0 8px" }}>
            升级 Plus，无限刷题
          </h1>
          <p style={{ fontSize: "15px", color: "var(--ink2)", lineHeight: 1.6, maxWidth: "520px", margin: "0 auto" }}>
            免费开始，随时升级解锁全部题库、模拟面试与 AI 解析。
          </p>
        </div>

        <div
          className="bo-col2"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "18px" }}
        >
          {/* Free card */}
          <PlanCard
            title={free.name}
            price="¥0"
            priceHint="永久免费"
            features={featuresOf(free)}
            highlight={false}
            cta={
              loggedIn ? (
                <div style={{ ...ctaGhost, textAlign: "center" }}>当前方案</div>
              ) : (
                <Link href="/register" style={{ ...ctaGhost, display: "block", textAlign: "center", textDecoration: "none" }}>
                  免费注册
                </Link>
              )
            }
          />

          {/* Plus card */}
          <PlanCard
            title={plus.name}
            price="¥29"
            priceHint="/ 月 · ¥199 / 年"
            features={featuresOf(plus)}
            highlight
            cta={
              loggedIn ? (
                plus.priceMonthly ? (
                  <CheckoutButton priceId={plus.priceMonthly}>升级到 Plus · 按月</CheckoutButton>
                ) : (
                  <div style={{ ...ctaGhost, textAlign: "center" }}>暂未开放购买</div>
                )
              ) : (
                <Link href="/register" style={{ ...ctaPrimary, display: "block", textAlign: "center", textDecoration: "none" }}>
                  注册后升级
                </Link>
              )
            }
            secondaryCta={
              loggedIn && plus.priceYearly ? (
                <CheckoutButton
                  priceId={plus.priceYearly}
                  style={{ background: "var(--surface)", color: "var(--pri)", border: "1px solid var(--pri)" }}
                >
                  升级到 Plus · 按年（更划算）
                </CheckoutButton>
              ) : null
            }
          />
        </div>

        <div style={{ textAlign: "center", marginTop: "34px" }}>
          <Link href={loggedIn ? "/app" : "/login"} style={{ color: "var(--ink3)", fontSize: "13px", textDecoration: "none" }}>
            {loggedIn ? "← 返回刷题" : "已有账号？登录"}
          </Link>
        </div>
      </div>
    </div>
  );
}

function featuresOf(p: PlanView): { label: string; on: boolean }[] {
  return [
    { label: p.dailyQuota === null ? "无限刷题" : `每日 ${p.dailyQuota} 题`, on: true },
    { label: "全部高级题库 · 大厂真题", on: p.premiumBanks },
    { label: "模拟面试 · 限时整卷评分", on: p.examMode },
    { label: "AI 智能解析", on: p.aiExplain },
    { label: "错题本 · 收藏 · 学习报告", on: true },
  ];
}

function PlanCard({
  title,
  price,
  priceHint,
  features,
  highlight,
  cta,
  secondaryCta,
}: {
  title: string;
  price: string;
  priceHint: string;
  features: { label: string; on: boolean }[];
  highlight: boolean;
  cta: React.ReactNode;
  secondaryCta?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: highlight ? "1.5px solid var(--pri)" : "1px solid var(--line)",
        borderRadius: "16px",
        padding: "26px 24px",
        position: "relative",
        boxShadow: highlight ? "0 12px 34px rgba(45,91,255,.12)" : "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {highlight && (
        <span
          style={{
            position: "absolute",
            top: "-11px",
            left: "24px",
            background: "var(--pri)",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: "6px",
            letterSpacing: ".04em",
          }}
        >
          最受欢迎
        </span>
      )}
      <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>{title}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "10px" }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "34px", fontWeight: 800, color: "var(--ink)" }}>
          {price}
        </span>
        <span style={{ fontSize: "13px", color: "var(--ink3)" }}>{priceHint}</span>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 22px", display: "flex", flexDirection: "column", gap: "11px" }}>
        {features.map((f) => (
          <li key={f.label} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13.5px", color: f.on ? "var(--ink)" : "var(--ink3)" }}>
            <Check on={f.on} />
            <span style={{ textDecoration: f.on ? "none" : "line-through", opacity: f.on ? 1 : 0.7 }}>{f.label}</span>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
        {cta}
        {secondaryCta}
      </div>
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return on ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

const mono: CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "11px",
  letterSpacing: ".14em",
  color: "var(--pri)",
  fontWeight: 600,
};

const ctaPrimary: CSSProperties = {
  background: "var(--pri)",
  border: "1px solid var(--pri)",
  color: "#fff",
  borderRadius: "10px",
  padding: "11px 18px",
  fontSize: "14px",
  fontWeight: 700,
  fontFamily: "inherit",
};

const ctaGhost: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  color: "var(--ink2)",
  borderRadius: "10px",
  padding: "11px 18px",
  fontSize: "14px",
  fontWeight: 600,
  fontFamily: "inherit",
};

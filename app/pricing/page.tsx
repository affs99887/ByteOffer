// app/pricing/page.tsx
// PUBLIC pricing page (architecture §6.1). FREE-FOR-ALL RELEASE (binding product decision): every
// feature is free for registered users this release — there is no paywall, no quota, and no plan on
// sale. So this page is honest static copy: one 免费版 card that lists the full feature set, and one
// Plus card shown as「即将推出」(greyed, no price, no button, no AI claim). There is NO Stripe/checkout
// UI here anymore (the CheckoutButton component was removed); the server billing infra stays intact
// for legacy subscribers but nothing is purchasable from the product.
//
// Server component. It awaits auth() only to swap the free card's CTA (进入应用 vs 免费开始); it reads
// NO database, so `next build` is green without a DB. force-dynamic because auth() reads the session.

import type { CSSProperties } from "react";
import Link from "next/link";
import { computeThemeVars, PRIMARY_PRESETS } from "@/lib/theme";
import { auth } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "定价" };

const themeVars = computeThemeVars(PRIMARY_PRESETS[0], "light", "light");

const FONT_SANS =
  "var(--font-space-grotesk),'PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif";
const FONT_MONO = "var(--font-jetbrains-mono),ui-monospace,'SFMono-Regular',monospace";

/** The full, honest feature set — every one of these is on for every registered user this release. */
const FREE_FEATURES: string[] = [
  "无限练习 · 不限每日题量",
  "全部题库开放",
  "12 种题型 · 客观题自动判分",
  "模拟考试 · 限时整卷评分",
  "错题本 · 收藏 · 学习数据统计",
  "题库导入导出",
];

export default async function PricingPage() {
  const session = await auth();
  const loggedIn = Boolean(session?.user);

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
        fontFamily: FONT_SANS,
        padding: "56px 20px",
      }}
    >
      <div style={{ maxWidth: "920px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={mono}>// PRICING · 定价</div>
          <h1 style={{ fontSize: "30px", fontWeight: 800, color: "var(--ink)", margin: "10px 0 8px" }}>
            全部功能，免费开放
          </h1>
          <p
            style={{
              fontSize: "15px",
              color: "var(--ink2)",
              lineHeight: 1.6,
              maxWidth: "540px",
              margin: "0 auto",
            }}
          >
            注册即用，无限练习、全部题库、模拟考试、错题本与数据统计全部免费，无需信用卡。Plus 会员正在打磨中。
          </p>
        </div>

        <div
          className="bo-col2"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
            gap: "18px",
            alignItems: "stretch",
          }}
        >
          {/* Free card — the highlighted, real offering. */}
          <div style={{ ...cardBase, border: "1.5px solid var(--pri)", boxShadow: "0 12px 34px rgba(45,91,255,.12)" }}>
            <span style={badgePrimary}>当前版本</span>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>免费版</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "10px" }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: "34px", fontWeight: 800, color: "var(--ink)" }}>
                ¥0
              </span>
              <span style={{ fontSize: "13px", color: "var(--ink3)" }}>永久免费</span>
            </div>

            <ul style={featureList}>
              {FREE_FEATURES.map((f) => (
                <li key={f} style={featureItem}>
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div style={{ marginTop: "auto" }}>
              {loggedIn ? (
                <Link href="/app" style={{ ...ctaPrimary, display: "block", textAlign: "center", textDecoration: "none" }}>
                  进入应用
                </Link>
              ) : (
                <Link href="/register" style={{ ...ctaPrimary, display: "block", textAlign: "center", textDecoration: "none" }}>
                  免费开始
                </Link>
              )}
            </div>
          </div>

          {/* Plus card —「即将推出」placeholder. No price, no button, no AI claim. */}
          <div style={{ ...cardBase, border: "1px dashed var(--line)", background: "var(--surface)", opacity: 0.92 }}>
            <span style={badgeMuted}>即将推出</span>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink2)" }}>Plus 会员</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "10px" }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: "26px", fontWeight: 800, color: "var(--ink3)" }}>
                敬请期待
              </span>
            </div>
            <p style={{ fontSize: "13.5px", color: "var(--ink2)", lineHeight: 1.65, margin: "18px 0 0" }}>
              更多高级能力正在打磨中。当前版本已把全部核心功能免费开放，Plus 上线前你不会错过任何东西。
            </p>
            <div style={{ marginTop: "auto", paddingTop: "22px" }}>
              <div style={{ ...ctaGhost, textAlign: "center", cursor: "default", color: "var(--ink3)" }}>敬请期待</div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "34px" }}>
          <Link
            href={loggedIn ? "/app" : "/"}
            style={{ color: "var(--ink3)", fontSize: "13px", textDecoration: "none" }}
          >
            {loggedIn ? "← 返回刷题" : "← 返回首页"}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--pri)"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none" }}
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

const mono: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: "11px",
  letterSpacing: ".14em",
  color: "var(--pri)",
  fontWeight: 600,
};

const cardBase: CSSProperties = {
  background: "var(--surface)",
  borderRadius: "16px",
  padding: "26px 24px",
  position: "relative",
  display: "flex",
  flexDirection: "column",
};

const featureList: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "20px 0 22px",
  display: "flex",
  flexDirection: "column",
  gap: "11px",
};

const featureItem: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  fontSize: "13.5px",
  color: "var(--ink)",
};

const badgePrimary: CSSProperties = {
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
};

const badgeMuted: CSSProperties = {
  position: "absolute",
  top: "-11px",
  left: "24px",
  background: "var(--surface-2, #EEF0F4)",
  color: "var(--ink3)",
  fontSize: "11px",
  fontWeight: 700,
  padding: "3px 10px",
  borderRadius: "6px",
  letterSpacing: ".04em",
  border: "1px solid var(--line)",
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

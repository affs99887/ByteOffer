// app/billing/page.tsx
// Authenticated billing page (architecture §6.2, §6.5). Server component, requireUser (the
// authoritative boundary), force-dynamic (awaits auth + reads per-user DB state, never prerendered).
//
// FREE-FOR-ALL RELEASE (binding product decision): every feature is free this release and nothing is
// on sale, so there is NO upgrade / checkout UI here (the CheckoutButton component was removed). The
// page shows:
//   - Current plan: 免费版 · 全功能开放 (no fake daily-quota line — the quota is unlimited).
//   - Legacy subscription: ONLY when a Subscription row still carries a stripeSubscriptionId (a
//     historical subscriber). Then we surface its status + a PortalButton so they can self-serve
//     cancel — otherwise no Stripe UI renders at all (and the page is fine with zero Stripe env).
//   - Danger zone: two-step DeleteAccountButton (§6.5).
//   - A dismissible notice for a legacy ?checkout=success|cancel redirect (the payment flow is
//     dormant), so a stale bookmark/redirect gets an honest message instead of a silent no-op.
//
// All reads are try/catch-guarded so a cold DB renders a safe view rather than crashing.

import type { CSSProperties } from "react";
import Link from "next/link";
import { computeThemeVars, PRIMARY_PRESETS } from "@/lib/theme";
import { requireUser } from "@/lib/server/guards";
import { prisma } from "@/lib/server/db";
import { PortalButton } from "@/components/billing/portal-button";
import { DeleteAccountButton } from "@/components/billing/delete-account-button";
import type { SubStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "订阅与账单" };

const themeVars = computeThemeVars(PRIMARY_PRESETS[0], "light", "light");

const FONT_SANS =
  "var(--font-space-grotesk),'PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif";
const FONT_MONO = "var(--font-jetbrains-mono),ui-monospace,'SFMono-Regular',monospace";

const STATUS_LABEL: Record<SubStatus, string> = {
  active: "有效",
  trialing: "试用中",
  past_due: "逾期未支付（宽限期内）",
  canceled: "已取消",
  incomplete: "待完成",
  incomplete_expired: "已过期",
  unpaid: "未支付",
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function BillingPage({
  searchParams,
}: {
  // searchParams is a Promise in Next 16 (App Router server components).
  searchParams: Promise<{ checkout?: string | string[] }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const checkoutRaw = Array.isArray(sp.checkout) ? sp.checkout[0] : sp.checkout;
  const checkout = checkoutRaw === "success" || checkoutRaw === "cancel" ? checkoutRaw : null;

  // Legacy Stripe subscription (if any). A stripeSubscriptionId is the marker of a real historical
  // subscriber; without it there is nothing to manage and no Stripe UI is shown.
  let status: SubStatus | null = null;
  let stripeSubscriptionId: string | null = null;
  let currentPeriodEnd: Date | null = null;
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { status: true, stripeSubscriptionId: true, currentPeriodEnd: true },
    });
    if (sub) {
      status = sub.status;
      stripeSubscriptionId = sub.stripeSubscriptionId;
      currentPeriodEnd = sub.currentPeriodEnd;
    }
  } catch {
    // Cold DB → default view without a legacy-subscription section.
  }

  const hasLegacySub = Boolean(stripeSubscriptionId);

  return (
    <div
      className="bo-th"
      style={{
        ...(themeVars as unknown as CSSProperties),
        minHeight: "100vh",
        width: "100%",
        color: "var(--ink)",
        backgroundColor: "var(--canvas)",
        fontFamily: FONT_SANS,
        padding: "48px 20px",
      }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <div style={mono}>// BILLING · 订阅与账单</div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, margin: "10px 0 22px" }}>订阅与账单</h1>

        {/* Dismissible notice for a stale ?checkout redirect — the payment flow is dormant. The close
            control is a link back to /billing (no query), so it "dismisses" without any client JS. */}
        {checkout && (
          <div style={notice}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...mono, fontSize: "10px", color: "var(--ink3)", marginBottom: "6px" }}>
                  // 支付系统当前未启用
                </div>
                <div style={{ fontSize: "13px", color: "var(--ink2)", lineHeight: 1.6 }}>
                  {checkout === "success"
                    ? "本版本已把全部功能免费开放，你无需任何支付即可继续使用全部功能。"
                    : "已取消结账——本版本全部功能均已免费开放，无需支付。"}
                </div>
              </div>
              <Link
                href="/billing"
                aria-label="关闭提示"
                style={{
                  flex: "none",
                  color: "var(--ink3)",
                  fontSize: "18px",
                  lineHeight: "18px",
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                ×
              </Link>
            </div>
          </div>
        )}

        {/* Current plan card */}
        <div style={card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "14px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={sub}>当前方案</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--ink)" }}>免费版</span>
                <span style={tierBadge}>FREE</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={sub}>每日额度</div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "var(--ink)",
                  marginTop: "6px",
                }}
              >
                无限制
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: "16px",
              paddingTop: "16px",
              borderTop: "1px solid var(--divider)",
              fontSize: "13px",
              color: "var(--ink2)",
              lineHeight: 1.6,
            }}
          >
            全部功能已免费开放：无限练习、全部题库、模拟考试、错题本 / 收藏与数据统计，无需任何付费。
          </div>
        </div>

        {/* Legacy subscription — only for historical subscribers with a live Stripe subscription id. */}
        {hasLegacySub && (
          <div style={card}>
            <div style={{ ...sub, marginBottom: "14px" }}>历史订阅</div>
            {status && (
              <div style={{ fontSize: "13px", color: "var(--ink2)", marginBottom: "6px" }}>
                订阅状态：
                <span
                  style={{
                    fontWeight: 600,
                    color: status === "active" || status === "trialing" ? "#0A7D4E" : "#B7791F",
                  }}
                >
                  {STATUS_LABEL[status]}
                </span>
              </div>
            )}
            {currentPeriodEnd && (
              <div style={{ fontSize: "13px", color: "var(--ink2)", marginBottom: "14px" }}>
                当前计费周期至 <span style={{ fontFamily: FONT_MONO }}>{fmtDate(currentPeriodEnd)}</span>
              </div>
            )}
            <PortalButton>管理订阅（取消 / 更换卡片 / 账单）</PortalButton>
            <div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "8px", lineHeight: 1.5 }}>
              本版本已把全部功能免费开放，历史订阅可随时在 Stripe 安全页面中取消，取消后不影响你继续使用全部功能。
            </div>
          </div>
        )}

        {/* Danger zone */}
        <div style={{ ...card, border: "1px solid #F3D0CE" }}>
          <div style={{ ...sub, color: "#D63C31", marginBottom: "6px" }}>危险操作</div>
          <div style={{ fontSize: "13px", color: "var(--ink2)", lineHeight: 1.55, marginBottom: "14px" }}>
            删除账户将取消订阅并永久移除你的全部数据，此操作不可撤销。
          </div>
          <DeleteAccountButton />
        </div>

        <div style={{ textAlign: "center", marginTop: "10px" }}>
          <Link href="/app" style={{ color: "var(--ink3)", fontSize: "13px", textDecoration: "none" }}>
            ← 返回刷题
          </Link>
        </div>
      </div>
    </div>
  );
}

const mono: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: "11px",
  letterSpacing: ".14em",
  color: "var(--pri)",
  fontWeight: 600,
};

const card: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "14px",
  padding: "22px 24px",
  marginBottom: "16px",
};

const notice: CSSProperties = {
  background: "var(--pri-w, rgba(45,91,255,.06))",
  border: "1px solid var(--line)",
  borderRadius: "12px",
  padding: "14px 16px",
  marginBottom: "16px",
};

const sub: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: "10.5px",
  letterSpacing: ".13em",
  color: "var(--ink3)",
  fontWeight: 600,
};

const tierBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "6px",
  padding: "3px 9px",
  fontSize: "12px",
  fontWeight: 700,
  color: "#5A6172",
  background: "rgba(138,146,162,.12)",
};

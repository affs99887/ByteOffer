// app/billing/page.tsx
// Authenticated billing page (architecture §6.2, §6.5). Server component, requireUser (the
// authoritative boundary), force-dynamic (awaits auth + reads per-user DB state, never prerendered).
// Shows the current entitlement tier + validUntil + subscription status, and the manage buttons:
//   - 升级到 Plus  → client CheckoutButton (§6.2)
//   - 管理订阅     → client PortalButton (Stripe Billing Portal)
//   - 删除账户     → client DeleteAccountButton (two-step confirm, §6.5)
//
// All reads are try/catch-guarded so a cold DB renders a safe free view rather than crashing. The
// tier shown is the DENORMALIZED entitlement snapshot (webhook-derived) — the single gating truth.

import type { CSSProperties } from "react";
import Link from "next/link";
import { computeThemeVars, PRIMARY_PRESETS } from "@/lib/theme";
import { requireUser } from "@/lib/server/guards";
import { env } from "@/lib/server/env";
import { prisma } from "@/lib/server/db";
import * as entitlementService from "@/lib/server/services/entitlementService";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { PortalButton } from "@/components/billing/portal-button";
import { DeleteAccountButton } from "@/components/billing/delete-account-button";
import type { SubStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "订阅与账单 · ByteOffer" };

const themeVars = computeThemeVars(PRIMARY_PRESETS[0], "light", "light");

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

export default async function BillingPage() {
  const user = await requireUser();

  // Denormalized entitlement (webhook-derived) is the tier truth; Subscription carries status.
  let tier: "free" | "plus" = "free";
  let validUntil: Date | null = null;
  let status: SubStatus | null = null;
  let hasSubRow = false;
  try {
    const ent = await entitlementService.get(user.id);
    tier = ent.tier;
    validUntil = ent.validUntil;
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (sub) {
      status = sub.status;
      hasSubRow = true;
    }
  } catch {
    // Cold DB → default free view.
  }

  const isPlus = tier === "plus";
  const priceMonthly = env.STRIPE_PRICE_PLUS_MONTHLY || null;
  const priceYearly = env.STRIPE_PRICE_PLUS_YEARLY || null;

  return (
    <div
      className="bo-th"
      style={{
        ...(themeVars as unknown as CSSProperties),
        minHeight: "100vh",
        width: "100%",
        color: "var(--ink)",
        backgroundColor: "var(--canvas)",
        fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif",
        padding: "48px 20px",
      }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <div style={mono}>// BILLING · 订阅与账单</div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, margin: "10px 0 22px" }}>订阅与账单</h1>

        {/* Current plan card */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
            <div>
              <div style={sub}>当前方案</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--ink)" }}>
                  {isPlus ? "Plus 会员" : "免费版"}
                </span>
                <TierBadge plus={isPlus} />
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={sub}>{isPlus ? "有效期至" : "每日额度"}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "15px", fontWeight: 700, color: "var(--ink)", marginTop: "6px" }}>
                {isPlus ? fmtDate(validUntil) : "30 题 / 天"}
              </div>
            </div>
          </div>

          {hasSubRow && status && (
            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--divider)", fontSize: "13px", color: "var(--ink2)" }}>
              订阅状态：<span style={{ fontWeight: 600, color: status === "active" || status === "trialing" ? "#0A7D4E" : "#B7791F" }}>{STATUS_LABEL[status]}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={card}>
          <div style={{ ...sub, marginBottom: "14px" }}>管理</div>

          {!isPlus && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px" }}>
              {priceMonthly ? (
                <div style={{ maxWidth: "320px" }}>
                  <CheckoutButton priceId={priceMonthly}>升级到 Plus · 按月（¥29）</CheckoutButton>
                </div>
              ) : (
                <div style={{ fontSize: "13px", color: "var(--ink3)" }}>购买暂未开放（未配置价格）。</div>
              )}
              {priceYearly && (
                <div style={{ maxWidth: "320px" }}>
                  <CheckoutButton
                    priceId={priceYearly}
                    style={{ background: "var(--surface)", color: "var(--pri)", border: "1px solid var(--pri)" }}
                  >
                    升级到 Plus · 按年（¥199 · 更划算）
                  </CheckoutButton>
                </div>
              )}
              <Link href="/pricing" style={{ color: "var(--pri)", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
                查看方案对比 →
              </Link>
            </div>
          )}

          {(isPlus || hasSubRow) && (
            <div style={{ marginBottom: "6px" }}>
              <PortalButton>管理订阅（取消 / 更换卡片 / 账单）</PortalButton>
              <div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "8px", lineHeight: 1.5 }}>
                在 Stripe 安全页面中自助管理你的订阅。取消后仍可使用至当前计费周期结束。
              </div>
            </div>
          )}
        </div>

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

function TierBadge({ plus }: { plus: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "6px",
        padding: "3px 9px",
        fontSize: "12px",
        fontWeight: 700,
        color: plus ? "#B7791F" : "#5A6172",
        background: plus ? "rgba(247,144,9,.14)" : "rgba(138,146,162,.12)",
      }}
    >
      {plus ? "PLUS" : "FREE"}
    </span>
  );
}

const mono: CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
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

const sub: CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "10.5px",
  letterSpacing: ".13em",
  color: "var(--ink3)",
  fontWeight: 600,
};

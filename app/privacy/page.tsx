// app/privacy/page.tsx
// PUBLIC privacy policy (static Chinese legal copy for the question-bank SaaS). Server component, no
// DB, no auth — build-safe with zero database. Visual language mirrors the landing shell (.bo-th
// wrapper + computeThemeVars, self-hosted brand fonts via var(--font-*), `// LABEL` mono accents).
//
// It also fixes a stale-.next typecheck reference: the route now exists as a real page. Keep the copy
// truthful — data actually collected (email / practice records), the real processors (Neon / Vercel /
// Stripe / Resend), and the real deletion entry point (/billing).

import type { CSSProperties } from "react";
import Link from "next/link";
import { computeThemeVars, PRIMARY_PRESETS } from "@/lib/theme";

export const metadata = { title: "隐私政策" };

const themeVars = computeThemeVars(PRIMARY_PRESETS[0], "light", "light");

const FONT_SANS =
  "var(--font-space-grotesk),'PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif";
const FONT_MONO = "var(--font-jetbrains-mono),ui-monospace,'SFMono-Regular',monospace";

const LAST_UPDATED = "2026-07-07";

export default function PrivacyPage() {
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
        padding: "48px 20px 72px",
      }}
    >
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <PageHeader />

        <div style={{ ...mono, marginTop: "8px" }}>// PRIVACY · 隐私政策</div>
        <h1 style={{ fontSize: "28px", fontWeight: 800, color: "var(--ink)", margin: "10px 0 6px" }}>隐私政策</h1>
        <p style={{ fontSize: "13px", color: "var(--ink3)", margin: 0 }}>最后更新：{LAST_UPDATED}</p>

        <p style={lead}>
          本政策说明 ByteOffer（下称“我们”）在你使用前端面试刷题服务时如何收集、使用、存储与保护你的个人信息。使用本服务即表示你已阅读并理解本政策。
        </p>

        <Section n="01" title="我们收集的信息">
          <P>
            <B>账户信息：</B>你注册时提供的电子邮箱；以加密方式（哈希）存储的密码；以及你可选填写的昵称等资料。我们不会以明文存储你的密码。
          </P>
          <P>
            <B>练习与使用数据：</B>你的答题记录与正误、错题本、收藏、学习统计、连续打卡以及界面与练习偏好设置。这些数据用于向你提供判分、复盘与统计功能。
          </P>
          <P>
            <B>技术与日志信息：</B>为保障安全与稳定，我们会记录访问日志、IP 地址、浏览器与设备的基本信息，并据此进行防滥用与访问频率限制。
          </P>
        </Section>

        <Section n="02" title="我们如何使用信息">
          <List
            items={[
              "提供并维护刷题、自动判分、模拟考试、错题本、收藏与数据统计等核心功能；",
              "进行账号认证与安全防护（登录校验、防止未授权访问、访问频率限制）；",
              "排查故障、改进产品体验与内容质量；",
              "在你同意或法律要求时，发送验证、密码重置等必要的服务性邮件。",
            ]}
          />
        </Section>

        <Section n="03" title="第三方服务与数据处理者">
          <P>为运行本服务，我们使用下列受信任的第三方处理者，它们仅按其各自的隐私政策、为我们提供服务之目的处理必要数据：</P>
          <List
            items={[
              "Neon（数据库托管）——存储你的账户与练习数据；",
              "Vercel（应用托管与 CDN）——运行应用、分发静态资源并处理请求日志；",
              "Stripe（支付处理）——仅在涉及历史订阅时处理支付信息；我们不接触、也不存储你的完整银行卡号；",
              "Resend（事务性邮件）——发送账号验证、密码重置等邮件。",
            ]}
          />
          <P>我们不会将你的个人信息出售给第三方，也不用于第三方广告追踪。</P>
        </Section>

        <Section n="04" title="Cookie 与本地存储">
          <P>
            我们使用必要的会话 Cookie 维持你的登录状态，并使用浏览器本地存储保存界面偏好。这些是提供服务所必需的，不用于跨站广告追踪。
          </P>
        </Section>

        <Section n="05" title="数据保留与删除">
          <P>
            在你的账户存续期间，我们会保留上述数据以持续提供服务。你可以随时在
            <Anchor href="/billing">账户与账单页（/billing）</Anchor>
            自助删除账户——该操作会取消任何订阅并<B>永久移除</B>你在本服务中的全部数据，且不可撤销。
          </P>
        </Section>

        <Section n="06" title="数据安全">
          <P>
            我们采取传输层加密（HTTPS）、密码哈希存储、访问控制与访问频率限制等措施保护你的信息。请注意，没有任何系统能保证绝对安全，请妥善保管你的账户凭证。
          </P>
        </Section>

        <Section n="07" title="未成年人">
          <P>本服务面向具备完全民事行为能力的用户。如你为未成年人，请在监护人的指导与同意下使用本服务。</P>
        </Section>

        <Section n="08" title="政策更新">
          <P>我们可能不时更新本政策。发生重大变更时，我们会在本页面更新“最后更新”日期并公示。你继续使用本服务即视为接受更新后的政策。</P>
        </Section>

        <Section n="09" title="联系我们">
          <P>如你对本隐私政策或个人信息处理有任何疑问或请求，请通过应用内的账户页面，或使用你的注册邮箱与我们联系。</P>
        </Section>

        <PageFooter current="privacy" />
      </div>
    </div>
  );
}

// ---- shared shell (inlined; server-only, no client JS) --------------------

function PageHeader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "26px" }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: "11px", textDecoration: "none" }}>
        <LogoMark size={28} />
        <span style={{ fontFamily: "var(--font-space-grotesk),sans-serif", fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>
          ByteOffer
        </span>
      </Link>
      <Link href="/" style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink2)", textDecoration: "none" }}>
        ← 返回首页
      </Link>
    </div>
  );
}

function PageFooter({ current }: { current: "privacy" | "terms" }) {
  return (
    <div style={{ marginTop: "40px", paddingTop: "22px", borderTop: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: "18px" }}>
      {current !== "privacy" && (
        <Link href="/privacy" style={footLink}>隐私政策</Link>
      )}
      {current !== "terms" && (
        <Link href="/terms" style={footLink}>服务条款</Link>
      )}
      <Link href="/" style={footLink}>返回首页</Link>
    </div>
  );
}

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        flex: "none",
        borderRadius: "8px",
        background: "var(--pri)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 6px 16px rgba(45,91,255,.30)",
      }}
    >
      <svg width={Math.round(size * 0.57)} height={Math.round(size * 0.57)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
      </svg>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: "30px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: "13px", fontWeight: 700, color: "var(--pri)", opacity: 0.7 }}>{n}</span>
        <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--ink)", margin: 0 }}>{title}</h2>
      </div>
      <div style={{ marginTop: "10px" }}>{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: "14px", color: "var(--ink2)", lineHeight: 1.75, margin: "0 0 10px" }}>{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: "var(--ink)", fontWeight: 700 }}>{children}</strong>;
}

function Anchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ color: "var(--pri)", fontWeight: 600, textDecoration: "none" }}>
      {children}
    </Link>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "0 0 10px", padding: "0 0 0 2px", listStyle: "none", display: "flex", flexDirection: "column", gap: "9px" }}>
      {items.map((it) => (
        <li key={it} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "14px", color: "var(--ink2)", lineHeight: 1.7 }}>
          <span style={{ color: "var(--pri)", marginTop: "1px", flex: "none" }}>·</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

const mono: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: "11px",
  letterSpacing: ".14em",
  color: "var(--pri)",
  fontWeight: 600,
};

const lead: CSSProperties = {
  fontSize: "14.5px",
  color: "var(--ink2)",
  lineHeight: 1.75,
  margin: "18px 0 0",
};

const footLink: CSSProperties = {
  fontSize: "13px",
  color: "var(--ink2)",
  textDecoration: "none",
  fontWeight: 600,
};

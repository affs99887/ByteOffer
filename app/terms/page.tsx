// app/terms/page.tsx
// PUBLIC terms of service (static Chinese legal copy for the question-bank SaaS). Server component, no
// DB, no auth — build-safe with zero database. Visual language mirrors the landing shell (.bo-th
// wrapper + computeThemeVars, self-hosted brand fonts via var(--font-*), `// LABEL` mono accents).
//
// It also fixes a stale-.next typecheck reference: the route now exists as a real page. Copy reflects
// the binding product decisions — this release is FREE for all registered users, and the question
// content is provided for personal study only (免责声明).

import type { CSSProperties } from "react";
import Link from "next/link";
import { computeThemeVars, PRIMARY_PRESETS } from "@/lib/theme";

export const metadata = { title: "服务条款" };

const themeVars = computeThemeVars(PRIMARY_PRESETS[0], "light", "light");

const FONT_SANS =
  "var(--font-space-grotesk),'PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif";
const FONT_MONO = "var(--font-jetbrains-mono),ui-monospace,'SFMono-Regular',monospace";

const LAST_UPDATED = "2026-07-07";

export default function TermsPage() {
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

        <div style={{ ...mono, marginTop: "8px" }}>// TERMS · 服务条款</div>
        <h1 style={{ fontSize: "28px", fontWeight: 800, color: "var(--ink)", margin: "10px 0 6px" }}>服务条款</h1>
        <p style={{ fontSize: "13px", color: "var(--ink3)", margin: 0 }}>最后更新：{LAST_UPDATED}</p>

        <p style={lead}>
          欢迎使用 ByteOffer（下称“本服务”）。本条款是你与我们之间就使用本服务达成的协议。访问或使用本服务，即表示你同意受本条款约束；如不同意，请停止使用。
        </p>

        <Section n="01" title="服务说明">
          <P>
            本服务为前端工程师提供面试刷题、客观题自动判分、主观题参考答案与自评、模拟考试、错题本、收藏与学习数据统计等功能。<B>本版本的全部功能对注册用户免费开放。</B>
          </P>
        </Section>

        <Section n="02" title="账户">
          <List
            items={[
              "注册需提供有效的电子邮箱，你应保证所提供信息真实、准确；",
              "你须妥善保管账户凭证，对在你账户下发生的活动负责；",
              "如发现账户被未授权使用，应及时采取措施并通知我们。",
            ]}
          />
        </Section>

        <Section n="03" title="可接受使用">
          <P>使用本服务时，你不得从事下列行为：</P>
          <List
            items={[
              "对题目内容进行逆向、爬取或自动化批量抓取；",
              "干扰、攻击、探测本服务，或试图规避鉴权与访问频率限制；",
              "上传违法、侵权或含恶意代码的内容；",
              "未经许可转售、再分发本服务的题目或其他内容。",
            ]}
          />
        </Section>

        <Section n="04" title="内容与知识产权">
          <P>
            本服务的题库、界面与站点内容归 ByteOffer 或相应权利人所有，仅授权你用于<B>个人、非商业的学习用途</B>。除法律另有规定外，未经授权不得复制、传播或用于商业目的。
          </P>
        </Section>

        <Section n="05" title="用户导入的内容">
          <P>
            如你使用题库导入功能，你须保证对导入内容拥有相应权利、且其不侵犯任何第三方权益；你授予我们为向你提供服务所必需的范围内处理该内容的权限。你对自己导入的内容负责。
          </P>
        </Section>

        <Section n="06" title="免责声明">
          <P>
            本服务的<B>题目内容仅供学习与参考</B>，我们不保证其准确性、完整性或时效性，亦<B>不构成对任何面试、录用、考试或其他结果的承诺或保证</B>。本服务按“现状”与“现有”基础提供，不附带任何明示或默示的担保。
          </P>
        </Section>

        <Section n="07" title="责任限制">
          <P>
            在适用法律允许的最大范围内，对于因使用或无法使用本服务而产生的任何间接、偶然、特殊或后果性损失，我们不承担责任。
          </P>
        </Section>

        <Section n="08" title="费用">
          <P>
            本版本的全部功能均<B>免费</B>提供，无需付费或绑定信用卡。如未来推出付费功能，我们将事先明确其价格与条款；付费功能的推出不影响本条款下已向你开放的免费功能。
          </P>
        </Section>

        <Section n="09" title="服务变更与终止">
          <P>
            我们可能不时新增、修改、暂停或终止本服务的部分功能。你可以随时在
            <Anchor href="/billing">账户与账单页（/billing）</Anchor>
            删除账户以终止使用。
          </P>
        </Section>

        <Section n="10" title="条款变更">
          <P>我们可能更新本条款。发生变更时将更新本页“最后更新”日期；你在变更后继续使用本服务，即视为接受更新后的条款。</P>
        </Section>

        <Section n="11" title="适用法律">
          <P>本条款的订立、效力、解释与争议解决，均受相关适用法律法规管辖。</P>
        </Section>

        <PageFooter current="terms" />
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

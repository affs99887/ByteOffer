// app/page.tsx
// The PUBLIC marketing landing page (architecture: the authed app was relocated to /app; `/` is now
// the front door). SERVER COMPONENT. It awaits auth() only to swap the primary CTA (进入应用 vs
// 免费开始) — it never force-redirects an authed visitor away, so everyone can see the landing. The
// auth() call makes the route dynamic (ƒ); that is fine (nothing here reads the DB, so it is
// build-safe with no database). Visual language mirrors the app: computeThemeVars on a .bo-th
// wrapper so every var(--*) resolves, the self-hosted Space Grotesk / JetBrains Mono brand faces via
// the var(--font-*) tokens (see app/layout.tsx; Chinese uses the system CJK stack), the code-bracket
// logo, and the `// LABEL` mono accents. Pure inline styles + CSS vars; no new deps.

import type { CSSProperties } from "react";
import Link from "next/link";
import { computeThemeVars, PRIMARY_PRESETS } from "@/lib/theme";
import { auth } from "@/lib/server/auth";

// auth() reads the request session → dynamic. No DB access, so `next build` stays green sans database.
export const dynamic = "force-dynamic";

export const metadata = {
  // absolute → opt out of the layout's `%s · ByteOffer` template (this is the brand root page).
  title: { absolute: "ByteOffer · 前端面试刷题系统 — 从刷题到拿 Offer" },
  description:
    "ByteOffer 是面向前端工程师的面试刷题系统：12 种题型、客观题自动判分、主观题参考答案 + 自评、模拟面试考试模式、错题本/收藏夹、数据统计与题库导入导出。注册即用，全部功能免费开放。",
};

const themeVars = computeThemeVars(PRIMARY_PRESETS[0], "light", "light");

// ---- shared style atoms ---------------------------------------------------
const mono: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono),ui-monospace,monospace",
  fontSize: "11px",
  letterSpacing: ".14em",
  color: "var(--pri)",
  fontWeight: 600,
};
const sectionWrap: CSSProperties = {
  maxWidth: "1120px",
  margin: "0 auto",
  padding: "0 24px",
  boxSizing: "border-box",
};
const heading: CSSProperties = {
  fontFamily: "var(--font-space-grotesk),'PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif",
  fontWeight: 700,
  color: "var(--ink)",
  letterSpacing: "-.02em",
};

// The code-bracket logo mark (matches sidebar/admin/auth).
function LogoMark({ size = 30 }: { size?: number }) {
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

// ---- feature grid data ----------------------------------------------------
type Feature = { badge: string; title: string; body: string; icon: React.ReactNode };

const iStroke = { fill: "none", stroke: "var(--pri)", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const FEATURES: Feature[] = [
  {
    badge: "// GRADING",
    title: "12 种题型 · 客观题自动判分",
    body: "单选 / 多选 / 判断 / 填空 / 数值 / 输出预测 / 排序 / 匹配 即时判分；简答 / 问答 / 编程 / 情景 给参考答案 + 自评。",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" {...iStroke}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12l2.4 2.4L15.5 9.5" /></svg>
    ),
  },
  {
    badge: "// EXAM",
    title: "模拟面试 · 考试模式",
    body: "倒计时、答题卡、成绩结算，还原真实面试节奏，一键进入限时练习。",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" {...iStroke}><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.4 1.6M9.5 3.5h5" /></svg>
    ),
  },
  {
    badge: "// LIBRARY",
    title: "错题本 / 收藏夹 / 最近练习",
    body: "答错自动进错题本，一键收藏重点题，最近练习随时续刷，复盘不遗漏。",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" {...iStroke}><path d="M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z" /><path d="M6 4a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h13" /></svg>
    ),
  },
  {
    badge: "// STATS",
    title: "数据统计",
    body: "正确率趋势、分类掌握度、连续打卡，用数据看清进步与短板。",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" {...iStroke}><path d="M4 20h16" /><path d="M7 20v-6M12 20V6M17 20v-9" /></svg>
    ),
  },
  {
    badge: "// PORTABLE",
    title: "题库导入导出",
    body: "JSON 交换格式自由导入导出，编辑器内置 Schema 校验，构建你的私有题库。",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" {...iStroke}><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" opacity={0.5} /></svg>
    ),
  },
  {
    badge: "// ADMIN",
    title: "管理后台",
    body: "题库 CRUD、批量导入审核，团队协作维护题库，内容质量可控。",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" {...iStroke}><path d="M4 8h9M17 8h3M4 16h3M11 16h9" /><circle cx="15" cy="8" r="2.4" /><circle cx="9" cy="16" r="2.4" /></svg>
    ),
  },
];

type Step = { n: string; title: string; body: string };
const STEPS: Step[] = [
  { n: "01", title: "选题库 · 筛题", body: "按分类、难度、题型自由筛选，或直接进入模拟面试。" },
  { n: "02", title: "作答 · 即时判分", body: "客观题秒出对错，主观题对照参考答案自评，当场看解析。" },
  { n: "03", title: "错题复盘 · 数据追踪", body: "错题自动归档，正确率趋势与掌握度持续追踪你的成长。" },
];

// ---- button styles --------------------------------------------------------
const btnBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  borderRadius: "9px",
  fontSize: "14px",
  fontWeight: 600,
  fontFamily: "var(--font-space-grotesk),'PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif",
  textDecoration: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const primaryBtn: CSSProperties = {
  ...btnBase,
  padding: "13px 22px",
  background: "var(--pri)",
  border: "1px solid var(--pri)",
  color: "#fff",
  boxShadow: "0 8px 22px rgba(45,91,255,.30)",
};
const ghostBtnDark: CSSProperties = {
  ...btnBase,
  padding: "13px 22px",
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.16)",
  color: "#EAEEFF",
};
const navBtn: CSSProperties = {
  ...btnBase,
  padding: "9px 15px",
  fontSize: "13.5px",
  background: "var(--surface)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
};
const navBtnPrimary: CSSProperties = {
  ...btnBase,
  padding: "9px 16px",
  fontSize: "13.5px",
  background: "var(--pri)",
  border: "1px solid var(--pri)",
  color: "#fff",
  boxShadow: "0 6px 16px rgba(45,91,255,.24)",
};

const arrow = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
);

export default async function LandingPage() {
  const session = await auth();
  const authed = !!session?.user;

  return (
    <div
      className="bo-th"
      style={{
        ...(themeVars as unknown as CSSProperties),
        minHeight: "100vh",
        width: "100%",
        color: "var(--ink)",
        backgroundColor: "var(--canvas)",
        fontFamily: "var(--font-space-grotesk),'PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif",
        overflowX: "hidden",
      }}
    >
      {/* ============================ NAV ============================ */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          borderBottom: "1px solid var(--line)",
          background: "rgba(255,255,255,.82)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <nav
          style={{
            ...sectionWrap,
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "11px", minWidth: 0 }}>
            <LogoMark size={30} />
            <div style={{ display: "flex", alignItems: "baseline", gap: "9px", minWidth: 0 }}>
              <span style={{ fontFamily: "var(--font-space-grotesk),sans-serif", fontSize: "17px", fontWeight: 700, color: "var(--ink)" }}>ByteOffer</span>
              <span style={{ fontFamily: "var(--font-jetbrains-mono),ui-monospace,monospace", fontSize: "10px", letterSpacing: ".16em", color: "var(--pri)", fontWeight: 600 }} className="bo-navtag">INTERVIEW · OS</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Link href="/pricing" style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--ink2)", textDecoration: "none", padding: "8px 4px" }} className="bo-navlink">定价</Link>
            {authed ? (
              <Link href="/app" style={navBtnPrimary}>进入应用 {arrow}</Link>
            ) : (
              <>
                <Link href="/login" style={navBtn} className="bo-navlink">登录</Link>
                <Link href="/register" style={navBtnPrimary}>免费开始</Link>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* ============================ HERO ============================ */}
      <section style={{ ...sectionWrap, paddingTop: "34px", paddingBottom: "56px" }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: "24px",
            background: "#0F1420",
            border: "1px solid rgba(255,255,255,.08)",
            padding: "clamp(40px, 6vw, 84px) clamp(24px, 5vw, 72px)",
          }}
        >
          {/* blue radial glow */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(680px 380px at 22% 8%, rgba(45,91,255,.42), transparent 60%), radial-gradient(520px 340px at 96% 100%, rgba(45,91,255,.20), transparent 62%)",
              pointerEvents: "none",
            }}
          />
          {/* faint code-grid texture */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
              backgroundSize: "42px 42px",
              maskImage: "radial-gradient(680px 420px at 30% 20%, #000, transparent 78%)",
              WebkitMaskImage: "radial-gradient(680px 420px at 30% 20%, #000, transparent 78%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", maxWidth: "760px" }}>
            <div style={{ fontFamily: "var(--font-jetbrains-mono),ui-monospace,monospace", fontSize: "12px", letterSpacing: ".18em", color: "#7FA0FF", fontWeight: 600, marginBottom: "20px" }}>
              // FRONT-END INTERVIEW · OS
            </div>
            <h1
              style={{
                fontFamily: "var(--font-space-grotesk),'PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif",
                fontWeight: 700,
                letterSpacing: "-.03em",
                lineHeight: 1.12,
                fontSize: "clamp(34px, 5.4vw, 60px)",
                color: "#fff",
                margin: 0,
              }}
            >
              前端面试刷题系统
              <br />
              <span style={{ color: "#8FAAFF" }}>从刷题到拿 Offer</span>
            </h1>
            <p style={{ fontSize: "clamp(15px, 1.6vw, 18px)", lineHeight: 1.7, color: "#AEB6C7", margin: "22px 0 0", maxWidth: "620px" }}>
              12 种题型、客观题自动判分、主观题参考答案 + 自评，配合模拟面试、错题本与数据统计。
              一个把「刷题 → 复盘 → 拿 Offer」跑通的完整系统，全部功能免费开放。
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", marginTop: "34px" }}>
              {authed ? (
                <Link href="/app" style={primaryBtn}>进入应用 {arrow}</Link>
              ) : (
                <>
                  <Link href="/register" style={primaryBtn}>免费开始 {arrow}</Link>
                  <Link href="/login" style={ghostBtnDark}>登录 {arrow}</Link>
                </>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "22px", marginTop: "40px" }}>
              {[
                ["12", "种题型"],
                ["10", "大分类"],
                ["免费", "全部功能"],
                ["无需", "信用卡"],
              ].map(([a, b]) => (
                <div key={b} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span style={{ fontFamily: "var(--font-jetbrains-mono),ui-monospace,monospace", fontSize: "22px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>{a}</span>
                  <span style={{ fontSize: "12px", color: "#8891A4" }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================ FEATURES ============================ */}
      <section style={{ ...sectionWrap, paddingBottom: "20px" }}>
        <div style={{ marginBottom: "26px" }}>
          <div style={mono}>// FEATURES</div>
          <h2 style={{ ...heading, fontSize: "clamp(24px, 3vw, 32px)", margin: "10px 0 8px" }}>刷题、判分、复盘，一站到位</h2>
          <p style={{ fontSize: "15px", color: "var(--ink2)", margin: 0, maxWidth: "620px", lineHeight: 1.7 }}>
            覆盖从客观题即时判分到主观题参考答案自评的完整链路，配套错题、统计与题库管理。
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "16px",
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "14px",
                padding: "22px 22px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "13px",
              }}
            >
              <div
                style={{
                  width: "46px",
                  height: "46px",
                  borderRadius: "11px",
                  background: "var(--pri-w)",
                  border: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {f.icon}
              </div>
              <div style={{ ...mono, fontSize: "10px", color: "var(--ink3)" }}>{f.badge}</div>
              <div style={{ ...heading, fontSize: "17px", letterSpacing: "-.01em" }}>{f.title}</div>
              <div style={{ fontSize: "13.5px", color: "var(--ink2)", lineHeight: 1.65 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================ HOW IT WORKS ============================ */}
      <section style={{ ...sectionWrap, paddingTop: "56px", paddingBottom: "20px" }}>
        <div style={{ marginBottom: "26px" }}>
          <div style={mono}>// HOW IT WORKS</div>
          <h2 style={{ ...heading, fontSize: "clamp(24px, 3vw, 32px)", margin: "10px 0 0" }}>三步跑通刷题闭环</h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "16px",
          }}
        >
          {STEPS.map((s) => (
            <div
              key={s.n}
              style={{
                position: "relative",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "14px",
                padding: "24px 22px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-jetbrains-mono),ui-monospace,monospace",
                  fontSize: "44px",
                  fontWeight: 700,
                  color: "var(--pri)",
                  opacity: 0.14,
                  lineHeight: 1,
                  letterSpacing: "-.03em",
                }}
              >
                {s.n}
              </div>
              <div style={{ ...heading, fontSize: "17px", marginTop: "10px" }}>{s.title}</div>
              <div style={{ fontSize: "13.5px", color: "var(--ink2)", lineHeight: 1.65, marginTop: "8px" }}>{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================ PRICING TEASER ============================ */}
      <section style={{ ...sectionWrap, paddingTop: "56px", paddingBottom: "20px" }}>
        <div style={{ marginBottom: "26px" }}>
          <div style={mono}>// PRICING</div>
          <h2 style={{ ...heading, fontSize: "clamp(24px, 3vw, 32px)", margin: "10px 0 8px" }}>全部功能，免费开放</h2>
          <p style={{ fontSize: "15px", color: "var(--ink2)", margin: 0, lineHeight: 1.7 }}>注册即用，无限练习、全部题库、模拟考试与数据统计全部免费，无需信用卡。Plus 会员即将推出。</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", alignItems: "stretch" }}>
          {/* Free — the real, current offering (highlighted). */}
          <div style={{ position: "relative", background: "var(--surface)", border: "1.5px solid var(--pri)", borderRadius: "16px", padding: "26px 24px", display: "flex", flexDirection: "column", boxShadow: "0 12px 34px rgba(45,91,255,.12)" }}>
            <div style={{ position: "absolute", top: "18px", right: "20px", fontFamily: "var(--font-jetbrains-mono),ui-monospace,monospace", fontSize: "10.5px", fontWeight: 700, letterSpacing: ".08em", color: "#fff", background: "var(--pri)", borderRadius: "6px", padding: "3px 9px" }}>当前版本</div>
            <div style={{ ...mono, color: "var(--ink3)" }}>// FREE</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "12px" }}>
              <span style={{ fontFamily: "var(--font-space-grotesk),sans-serif", fontSize: "30px", fontWeight: 700, color: "var(--ink)" }}>免费版</span>
              <span style={{ fontSize: "13.5px", color: "var(--ink3)" }}>¥0 · 永久免费</span>
            </div>
            <div style={{ fontSize: "13.5px", color: "var(--ink2)", marginTop: "6px" }}>完全免费 · 全部功能开放</div>
            <ul style={{ listStyle: "none", padding: 0, margin: "18px 0 0", display: "flex", flexDirection: "column", gap: "11px" }}>
              {["12 种题型 · 客观题自动判分", "无限练习 · 全部题库开放", "模拟面试 · 错题本 · 数据统计"].map((t) => (
                <li key={t} style={{ display: "flex", alignItems: "flex-start", gap: "9px", fontSize: "13.5px", color: "var(--ink)" }}>
                  <Check /> {t}
                </li>
              ))}
            </ul>
          </div>
          {/* Plus —「即将推出」placeholder. No price, no AI, no purchasable feature. */}
          <div style={{ position: "relative", background: "var(--surface)", border: "1px dashed var(--line)", borderRadius: "16px", padding: "26px 24px", display: "flex", flexDirection: "column", opacity: 0.92 }}>
            <div style={{ position: "absolute", top: "18px", right: "20px", fontFamily: "var(--font-jetbrains-mono),ui-monospace,monospace", fontSize: "10.5px", fontWeight: 700, letterSpacing: ".08em", color: "var(--ink3)", background: "var(--surface-2, #EEF0F4)", border: "1px solid var(--line)", borderRadius: "6px", padding: "3px 9px" }}>即将推出</div>
            <div style={{ ...mono, color: "var(--ink3)" }}>// PLUS</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "12px" }}>
              <span style={{ fontFamily: "var(--font-space-grotesk),sans-serif", fontSize: "26px", fontWeight: 700, color: "var(--ink3)" }}>敬请期待</span>
            </div>
            <div style={{ fontSize: "13.5px", color: "var(--ink2)", marginTop: "6px" }}>Plus 会员</div>
            <p style={{ fontSize: "13.5px", color: "var(--ink2)", lineHeight: 1.65, margin: "18px 0 0" }}>
              更多高级能力正在打磨中。当前版本已把全部核心功能免费开放，Plus 上线前你不会错过任何东西。
            </p>
          </div>
        </div>
        <div style={{ marginTop: "22px" }}>
          <Link href="/pricing" style={{ ...primaryBtn, boxShadow: "none", background: "var(--surface)", color: "var(--pri)", border: "1px solid var(--pri)" }}>查看方案 {arrow}</Link>
        </div>
      </section>

      {/* ============================ CTA BAND ============================ */}
      <section style={{ ...sectionWrap, paddingTop: "56px", paddingBottom: "56px" }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: "20px",
            background: "#0F1420",
            border: "1px solid rgba(255,255,255,.08)",
            padding: "clamp(36px, 5vw, 60px) clamp(24px, 5vw, 56px)",
            textAlign: "center",
          }}
        >
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(560px 300px at 50% 0%, rgba(45,91,255,.34), transparent 62%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontFamily: "var(--font-jetbrains-mono),ui-monospace,monospace", fontSize: "11px", letterSpacing: ".18em", color: "#7FA0FF", fontWeight: 600, marginBottom: "14px" }}>// START NOW</div>
            <h2 style={{ fontFamily: "var(--font-space-grotesk),'PingFang SC','Microsoft YaHei','Source Han Sans SC',sans-serif", fontWeight: 700, letterSpacing: "-.02em", fontSize: "clamp(24px, 3.4vw, 36px)", color: "#fff", margin: 0 }}>
              今天就开始刷题，向 Offer 更近一步
            </h2>
            <p style={{ fontSize: "15px", color: "#AEB6C7", margin: "14px auto 0", maxWidth: "520px", lineHeight: 1.7 }}>免费注册，即刻开始刷题——无限练习、全部题库、模拟考试全部免费。</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "center", marginTop: "28px" }}>
              {authed ? (
                <Link href="/app" style={primaryBtn}>进入应用 {arrow}</Link>
              ) : (
                <>
                  <Link href="/register" style={primaryBtn}>免费开始 {arrow}</Link>
                  <Link href="/login" style={ghostBtnDark}>登录 {arrow}</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================ FOOTER ============================ */}
      <footer style={{ borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
        <div
          style={{
            ...sectionWrap,
            paddingTop: "34px",
            paddingBottom: "34px",
            display: "flex",
            flexWrap: "wrap",
            gap: "22px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <LogoMark size={28} />
            <div>
              <div style={{ fontFamily: "var(--font-space-grotesk),sans-serif", fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>ByteOffer</div>
              <div style={{ fontFamily: "var(--font-jetbrains-mono),ui-monospace,monospace", fontSize: "11px", color: "var(--ink3)" }}>© 2026 ByteOffer · 前端面试刷题系统</div>
            </div>
          </div>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
            {[
              ["登录", "/login"],
              ["注册", "/register"],
              ["定价", "/pricing"],
              ["隐私政策", "/privacy"],
              ["服务条款", "/terms"],
            ].map(([label, href]) => (
              <Link key={href} href={href} style={{ fontSize: "13.5px", color: "var(--ink2)", textDecoration: "none", fontWeight: 600 }} className="bo-navlink">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

      {/* hover niceties + a couple of responsive tweaks (scoped by .bo-th) */}
      <style>{`
        .bo-th .bo-navlink:hover { color: var(--pri); }
        @media (max-width: 560px) {
          .bo-th .bo-navtag { display: none; }
        }
      `}</style>
    </div>
  );
}

function Check() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "1px" }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

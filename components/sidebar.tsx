"use client";

import type { ReactNode } from "react";
import { useApp } from "@/lib/app-context";

type IconFn = (sw: number) => ReactNode;

const svg = (sw: number, children: ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const icons: Record<string, IconFn> = {
  home: (sw) =>
    svg(sw, (
      <>
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6 10.2V19h12v-8.8" />
      </>
    )),
  wrongbook: (sw) =>
    svg(sw, (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2.5" />
        <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
      </>
    )),
  favorites: (sw) =>
    svg(sw, (
      <path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" />
    )),
  qbank: (sw) =>
    svg(sw, (
      <>
        <path d="M4 7l8-4 8 4-8 4-8-4z" />
        <path d="M4 7v10l8 4 8-4V7" />
        <path d="M12 11v10" opacity="0.5" />
      </>
    )),
  stats: (sw) =>
    svg(sw, (
      <>
        <path d="M4 20h16" />
        <path d="M7 20v-6M12 20V6M17 20v-9" />
      </>
    )),
  settings: (sw) =>
    svg(sw, (
      <>
        <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
        <circle cx="15" cy="8" r="2.4" />
        <circle cx="9" cy="16" r="2.4" />
      </>
    )),
};

function NavItem({
  icon,
  label,
  kbd,
  active,
  onClick,
}: {
  icon: IconFn;
  label: string;
  kbd: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="bo-rail-item"
      style={{ position: "relative", margin: "2px 0", cursor: "pointer", borderRadius: "9px" }}
      title={label}
      onClick={onClick}
    >
      {active ? (
        <>
          <span style={{ position: "absolute", inset: 0, background: "var(--rail-active-bg)", borderRadius: "9px" }} />
          <span style={{ position: "absolute", left: 0, top: "8px", bottom: "8px", width: "2.5px", borderRadius: "2px", background: "var(--pri)" }} />
          <span
            className="bo-nav-inner"
            style={{ position: "relative", display: "flex", alignItems: "center", height: "40px", color: "var(--rail-active-fg)", fontWeight: 600, fontSize: "14px" }}
          >
            <span className="bo-nav-ico" style={{ width: "52px", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {icon(1.9)}
            </span>
            <span className="bo-nav-txt" style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" }}>{label}</span>
            <span
              className="bo-nav-txt"
              style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", color: "var(--pri)", border: "1px solid var(--pri-w2)", borderRadius: "5px", padding: "1px 6px", background: "var(--pri-w)" }}
            >
              {kbd}
            </span>
          </span>
        </>
      ) : (
        <span
          className="bo-nav-inner"
          style={{ position: "relative", display: "flex", alignItems: "center", height: "40px", color: "var(--rail-fg)", fontWeight: 500, fontSize: "14px" }}
        >
          <span className="bo-nav-ico" style={{ width: "52px", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {icon(1.8)}
          </span>
          <span className="bo-nav-txt" style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" }}>{label}</span>
          <span
            className="bo-nav-txt"
            style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", color: "var(--rail-kbd-fg)", border: "1px solid var(--rail-kbd-bd)", borderRadius: "5px", padding: "1px 6px" }}
          >
            {kbd}
          </span>
        </span>
      )}
    </div>
  );
}

const SectionLabel = ({ children, pt = "6px" }: { children: ReactNode; pt?: string }) => (
  <div
    className="bo-nav-sec"
    style={{ fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: "9.5px", letterSpacing: ".16em", color: "var(--rail-muted)", padding: `${pt} 12px 8px` }}
  >
    {children}
  </div>
);

export function Sidebar() {
  const v = useApp();
  return (
    <aside
      className={`bo-aside ${v.asideMod}`}
      style={{ background: "var(--rail-bg)", borderRight: "1px solid var(--rail-border)", display: "flex", flexDirection: "column", position: "relative" }}
    >
      <div className="bo-hdr" style={{ padding: "22px 0 16px" }}>
        <div className="bo-logo-row" style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: "76px", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "36px", height: "36px", flex: "none", borderRadius: "9px", background: "var(--pri)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 1px rgba(255,255,255,.08),0 8px 20px rgba(45,91,255,.35)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
              </svg>
            </div>
          </div>
          <div className="bo-logo-txt" style={{ lineHeight: 1.25, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "16px", fontWeight: 700, color: "var(--rail-strong)", letterSpacing: ".3px" }}>ByteOffer</div>
            <div style={{ fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: "9.5px", letterSpacing: ".16em", color: "var(--rail-sub)", marginTop: "3px" }}>INTERVIEW · OS</div>
          </div>
        </div>
      </div>
      <div style={{ height: "1px", background: "var(--rail-border)", margin: "0 16px" }} />

      <nav style={{ flex: 1, padding: "12px 12px", overflowY: "auto", overflowX: "hidden" }}>
        {/* 6-item V2 set. 刷题/模拟面试 merged into the 题库 hub → a launched session
            keeps 题库 lit. ⌘1..⌘6 map to the kernel shortcut order [home,qbank,wrongbook,favorites,stats,settings]. */}
        <SectionLabel>// 练习</SectionLabel>
        <NavItem icon={icons.home} label="首页" kbd="⌘1" active={v.nav.home.active} onClick={v.nav.home.go} />
        <NavItem icon={icons.qbank} label="题库" kbd="⌘2" active={v.nav.qbank.active} onClick={v.nav.qbank.go} />

        <SectionLabel pt="16px">// 复习</SectionLabel>
        <NavItem icon={icons.wrongbook} label="错题本" kbd="⌘3" active={v.nav.wrongbook.active} onClick={v.nav.wrongbook.go} />
        <NavItem icon={icons.favorites} label="收藏夹" kbd="⌘4" active={v.nav.favorites.active} onClick={v.nav.favorites.go} />

        <SectionLabel pt="16px">// 成长</SectionLabel>
        <NavItem icon={icons.stats} label="数据统计" kbd="⌘5" active={v.nav.stats.active} onClick={v.nav.stats.go} />
        <NavItem icon={icons.settings} label="设置" kbd="⌘6" active={v.nav.settings.active} onClick={v.nav.settings.go} />
      </nav>

      {v.showArt && (
        <div className="bo-streak" style={{ padding: "12px 16px 16px", overflow: "hidden" }}>
          <div style={{ border: "1px solid var(--rail-wbd)", background: "var(--rail-wbg)", borderRadius: "11px", padding: "13px 14px", minWidth: "206px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "9px" }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "9.5px", letterSpacing: ".14em", color: "var(--rail-muted)" }}>STREAK</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "var(--rail-fg)" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#12B76A", boxShadow: "0 0 0 3px rgba(18,183,106,.18)" }} />
                在线
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "24px", fontWeight: 700, color: "var(--rail-strong)", lineHeight: 1 }}>{v.statStreak}</span>
              <span style={{ fontSize: "11px", color: "var(--rail-fg)" }}>天 · 今日目标 {v.statTodayLive}/{v.statGoal}</span>
            </div>
            <div style={{ height: "4px", background: "var(--rail-wbd)", borderRadius: "3px", marginTop: "11px", overflow: "hidden" }}>
              <div style={{ width: `${v.statTodayGoalPct}%`, height: "100%", background: "var(--pri)", borderRadius: "3px" }} />
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "2px 12px 14px" }}>
        <div
          className="bo-rail-item"
          title="收起 / 展开侧边栏"
          style={{ position: "relative", display: "flex", alignItems: "center", height: "40px", borderRadius: "9px", cursor: "pointer", color: "var(--rail-fg)" }}
          onClick={v.toggleCollapse}
        >
          <span className="bo-nav-ico" style={{ width: "52px", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg className="bo-collapse-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 6l-6 6 6 6" />
              <path d="M19 6l-6 6 6 6" opacity="0.4" />
            </svg>
          </span>
          <span className="bo-nav-txt" style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", fontSize: "13px", fontWeight: 500 }}>收起侧边栏</span>
        </div>
      </div>
    </aside>
  );
}

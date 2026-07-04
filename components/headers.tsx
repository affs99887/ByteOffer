"use client";

import type { ReactNode } from "react";
import { useApp } from "@/lib/app-context";

const IconBtn = ({
  title,
  onClick,
  children,
  hideM,
  extraStyle,
}: {
  title: string;
  onClick?: () => void;
  children: ReactNode;
  hideM?: boolean;
  extraStyle?: React.CSSProperties;
}) => (
  <div
    title={title}
    className={`bo-icon-btn${hideM ? " bo-hide-m" : ""}`}
    style={{ width: "36px", height: "36px", borderRadius: "8px", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--ink2)", ...extraStyle }}
    onClick={onClick}
  >
    {children}
  </div>
);

const Burger = ({ onClick }: { onClick: () => void }) => (
  <div
    className="bo-burger"
    style={{ display: "none", width: "36px", height: "36px", borderRadius: "8px", border: "1px solid var(--line)", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--ink2)", marginRight: "2px" }}
    onClick={onClick}
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  </div>
);

export function AppHeader() {
  const v = useApp();
  return (
    <header
      className="bo-h-pad"
      style={{ height: "60px", flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", background: "var(--surface)", borderBottom: "1px solid var(--line)", zIndex: 5 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
        <Burger onClick={v.openNav} />
        <div style={{ width: "25px", height: "25px", borderRadius: "7px", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: "12px", color: "var(--pri)" }}>{v.topNo}</div>
        <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>{v.topTitle}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div className="bo-hide-m bo-search-box" style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "13px", color: "var(--ink3)", border: "1px solid var(--line)", padding: "7px 11px", borderRadius: "8px", cursor: "text" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4-4" />
          </svg>
          搜索题目、知识点…
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10.5px", color: "var(--ink3)", border: "1px solid var(--line)", borderRadius: "5px", padding: "1px 6px", marginLeft: "14px" }}>⌘K</span>
        </div>
        <IconBtn title="切换布局：侧边栏 / 顶部导航" onClick={v.toggleLayout} hideM>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </svg>
        </IconBtn>
        <IconBtn title="切换侧边栏深浅色" onClick={v.toggleTheme} hideM>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
          </svg>
        </IconBtn>
        <IconBtn title="切换整体深浅色（浅色 / 深色）" onClick={v.toggleAppTheme}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 14.5A7.5 7.5 0 0 1 9.5 4a7.5 7.5 0 1 0 10.5 10.5z" />
          </svg>
        </IconBtn>
        <div className="bo-hide-m bo-icon-btn" style={{ position: "relative", width: "36px", height: "36px", borderRadius: "8px", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--ink2)" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5" />
            <path d="M10.5 19a1.8 1.8 0 0 0 3 0" />
          </svg>
          <span style={{ position: "absolute", top: "8px", right: "9px", width: "6px", height: "6px", borderRadius: "50%", background: "#F04438", border: "1.5px solid var(--surface)" }} />
        </div>
        <div className="bo-hide-m" style={{ width: "1px", height: "24px", background: "var(--line)" }} />
        <div className="bo-avatar-row" style={{ display: "flex", alignItems: "center", gap: "9px", cursor: "pointer" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: "var(--avatar)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "14px" }}>白</div>
          <div className="bo-hide-m" style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>前端小白</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", color: "var(--ink3)", letterSpacing: ".04em" }}>LV.24 · 62d</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function TopLink({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "0 12px", cursor: "pointer", flex: "none" }} onClick={onClick}>
      {active ? (
        <>
          <span style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap" }}>{label}</span>
          <span style={{ position: "absolute", left: "11px", right: "11px", bottom: 0, height: "3px", borderRadius: "2px 2px 0 0", background: "var(--ink)" }} />
        </>
      ) : (
        <span className="bo-topnav-link" style={{ fontSize: "14.5px", fontWeight: 500, color: "var(--ink2)", whiteSpace: "nowrap" }}>{label}</span>
      )}
    </div>
  );
}

export function TopNav() {
  const v = useApp();
  return (
    <header
      className="bo-h-pad"
      style={{ height: "62px", flex: "none", padding: "0 28px", background: "var(--surface)", borderBottom: "1px solid var(--line)", zIndex: 5 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "4px", height: "100%", maxWidth: "1440px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", marginRight: "20px" }}>
          <Burger onClick={v.openNav} />
          <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
          </svg>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "18px", fontWeight: 700, color: "var(--ink)", letterSpacing: ".2px" }}>ByteOffer</div>
        </div>
        <nav className="bo-hide-m" style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
          <TopLink label="首页" active={v.nav.home.active} onClick={v.nav.home.go} />
          <TopLink label="刷题" active={v.nav.practice.active} onClick={v.nav.practice.go} />
          <TopLink label="模拟面试" active={v.nav.interview.active} onClick={v.nav.interview.go} />
          <TopLink label="错题本" active={v.nav.wrongbook.active} onClick={v.nav.wrongbook.go} />
          <TopLink label="收藏夹" active={v.nav.favorites.active} onClick={v.nav.favorites.go} />
          <TopLink label="数据统计" active={v.nav.stats.active} onClick={v.nav.stats.go} />
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <div className="bo-hide-m bo-search-box" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--ink3)", border: "1px solid var(--line)", padding: "7px 11px", borderRadius: "8px", cursor: "text" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M20 20l-4-4" />
            </svg>
            搜索
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10.5px", color: "var(--ink3)", border: "1px solid var(--line)", borderRadius: "5px", padding: "1px 6px", marginLeft: "8px" }}>⌘K</span>
          </div>
          <IconBtn title="切换布局：侧边栏 / 顶部导航" onClick={v.toggleLayout} hideM>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 9h18" />
            </svg>
          </IconBtn>
          <IconBtn title="切换整体深浅色（浅色 / 深色）" onClick={v.toggleAppTheme}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 14.5A7.5 7.5 0 0 1 9.5 4a7.5 7.5 0 1 0 10.5 10.5z" />
            </svg>
          </IconBtn>
          <div className="bo-hide-m" style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--pri)", color: "#fff", borderRadius: "8px", padding: "8px 13px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(45,91,255,.26)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" stroke="none">
              <path d="M3 8l4.5 3L12 5l4.5 6L21 8l-1.8 10H4.8z" />
            </svg>
            Plus 会员
          </div>
          <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: "var(--avatar)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>白</div>
        </div>
      </div>
    </header>
  );
}

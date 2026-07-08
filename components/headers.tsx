"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useApp } from "@/lib/app-context";
import { logoutAction } from "@/lib/actions/auth";

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

// ---------- account dropdown (shared by AppHeader + TopNav) ----------
// A real menu replacing the old dead cursor:pointer avatar. It shows the signed-in user's real
// name / first-initial (never a fabricated persona).

const menuRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  borderRadius: "7px",
  fontSize: "13px",
  fontWeight: 500,
  fontFamily: "inherit",
  textAlign: "left",
  textDecoration: "none",
  border: "none",
  whiteSpace: "nowrap",
  transition: "background .12s",
};

function MenuItem({
  href,
  onClick,
  danger,
  disabled,
  children,
}: {
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const style: CSSProperties = {
    ...menuRowStyle,
    color: danger ? "#D63C31" : "var(--ink)",
    background: hover && !disabled ? "var(--surface-2)" : "transparent",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
  const hoverProps = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  };
  if (href) {
    return (
      <a href={href} style={style} onClick={onClick} {...hoverProps}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" style={style} disabled={disabled} onClick={onClick} {...hoverProps}>
      {children}
    </button>
  );
}

function UserMenu({ variant }: { variant: "full" | "compact" }) {
  const v = useApp();
  const [open, setOpen] = useState(false);
  const [pendingLogout, startLogout] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Real identity (email fallback, then a defensive 未登录).
  const name = v.user?.name ?? v.user?.email ?? "未登录";
  const initial = (v.user?.name ?? "").trim().charAt(0) || "用";
  const sz = variant === "full" ? "36px" : "34px";
  const showEmail = !!v.user?.name && !!v.user?.email;

  // Outside-click / Escape close (simple, self-contained).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <div
        className="bo-avatar-row"
        style={{ display: "flex", alignItems: "center", gap: "9px", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
        title="账户菜单"
      >
        <div style={{ width: sz, height: sz, flex: "none", borderRadius: "9px", background: "var(--avatar)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "14px" }}>{initial}</div>
        {variant === "full" && (
          <div className="bo-hide-m" style={{ lineHeight: 1.3, maxWidth: "128px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          </div>
        )}
      </div>
      {open && (
        <div
          role="menu"
          style={{ position: "absolute", top: "calc(100% + 9px)", right: 0, minWidth: "198px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "11px", boxShadow: "0 14px 38px rgba(20,26,45,.18)", padding: "6px", zIndex: 60 }}
        >
          <div style={{ padding: "8px 11px 9px", borderBottom: "1px solid var(--line)", marginBottom: "5px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
            {showEmail && (
              <div style={{ fontSize: "11px", color: "var(--ink3)", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.user?.email}</div>
            )}
          </div>
          {/* Admin-only entry (§G) — top of the dropdown, real <a href="/admin">. Non-admins never see it. */}
          {v.isAdmin && (
            <>
              <MenuItem href="/admin" onClick={() => setOpen(false)}>
                管理后台 →
              </MenuItem>
              <div style={{ height: "1px", background: "var(--line)", margin: "5px 6px" }} />
            </>
          )}
          <MenuItem
            onClick={() => {
              setOpen(false);
              v.nav.settings.go();
            }}
          >
            设置
          </MenuItem>
          <MenuItem href="/billing" onClick={() => setOpen(false)}>
            账户与订阅
          </MenuItem>
          <div style={{ height: "1px", background: "var(--line)", margin: "5px 6px" }} />
          <MenuItem
            danger
            disabled={pendingLogout}
            onClick={() => startLogout(async () => { await logoutAction(); })}
          >
            {pendingLogout ? "退出中…" : "退出登录"}
          </MenuItem>
        </div>
      )}
    </div>
  );
}

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
        <div className="bo-hide-m" style={{ width: "1px", height: "24px", background: "var(--line)" }} />
        <UserMenu variant="full" />
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
          {/* 6-item V2 set — 刷题/模拟面试 merged into the 题库 hub (session lit as 题库). */}
          <TopLink label="首页" active={v.nav.home.active} onClick={v.nav.home.go} />
          <TopLink label="题库" active={v.nav.qbank.active} onClick={v.nav.qbank.go} />
          <TopLink label="错题本" active={v.nav.wrongbook.active} onClick={v.nav.wrongbook.go} />
          <TopLink label="收藏夹" active={v.nav.favorites.active} onClick={v.nav.favorites.go} />
          <TopLink label="数据统计" active={v.nav.stats.active} onClick={v.nav.stats.go} />
          <TopLink label="设置" active={v.nav.settings.active} onClick={v.nav.settings.go} />
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
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
          <UserMenu variant="compact" />
        </div>
      </div>
    </header>
  );
}

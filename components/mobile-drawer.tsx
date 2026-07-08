"use client";

import { useApp } from "@/lib/app-context";

export function MobileDrawer() {
  const v = useApp();
  // The kernel's 6-item V2 set.
  const items = v.mobileItems;
  return (
    <div className={v.drawerOpenCls} style={{ display: "none", position: "fixed", inset: 0, zIndex: 70 }}>
      <div onClick={v.closeNav} className="bo-backdrop" style={{ position: "absolute", inset: 0, background: "rgba(8,10,16,.5)" }} />
      <div
        className="bo-panel"
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "264px", maxWidth: "82%", background: "var(--surface)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", padding: "16px 14px", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "16px", padding: "0 4px" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
          </svg>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "17px", fontWeight: 700, color: "var(--ink)" }}>ByteOffer</div>
          <div style={{ flex: 1 }} />
          <div onClick={v.closeNav} style={{ width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--ink3)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </div>
        </div>
        {items.map((m) => (
          <div key={m.label} style={m.rowStyle} onClick={m.go}>
            <span style={m.bar} />
            {m.label}
          </div>
        ))}
        <div style={{ height: "1px", background: "var(--line)", margin: "12px 4px" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div onClick={v.toggleLayout} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: "9px", cursor: "pointer", fontSize: "13.5px", color: "var(--ink)", whiteSpace: "nowrap" }}>
            界面布局<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--pri)", fontWeight: 600 }}>{v.layoutLabel}</span>
          </div>
          <div onClick={v.toggleTheme} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: "9px", cursor: "pointer", fontSize: "13.5px", color: "var(--ink)", whiteSpace: "nowrap" }}>
            侧边栏配色<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--pri)", fontWeight: 600 }}>{v.sbLabel}</span>
          </div>
          <div onClick={v.toggleAppTheme} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: "9px", cursor: "pointer", fontSize: "13.5px", color: "var(--ink)", whiteSpace: "nowrap" }}>
            整体配色<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--pri)", fontWeight: 600 }}>{v.appLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

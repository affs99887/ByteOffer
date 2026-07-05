// app/(admin)/admin/layout.tsx
// Admin shell (architecture §3.2, §9). Server component; the AUTHORITATIVE gate — requireAdmin()
// runs before anything renders (middleware already 404s /admin for non-admins, but that's a UX
// shortcut, not the boundary). On failure we mirror the enumeration-defense posture: notFound()
// for anonymous/non-admin so the admin surface's existence isn't revealed.
//
// force-dynamic + no caching so the guard runs per request and the build never prerenders these
// pages (no DB at build time). The theme wrapper reuses computeThemeVars (a pure fn, safe in RSC)
// to match the app's look without pulling in the full AppProvider — same pattern as (auth)/layout.

import type { CSSProperties, ReactNode } from "react";
import { notFound } from "next/navigation";
import { computeThemeVars, PRIMARY_PRESETS } from "@/lib/theme";
import { requireAdmin } from "@/lib/server/guards";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const themeVars = computeThemeVars(PRIMARY_PRESETS[0], "light", "light");

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Authoritative admin gate. On any failure, 404 (do not reveal the admin surface).
  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  return (
    <div
      className="bo-th"
      style={{
        ...(themeVars as unknown as CSSProperties),
        minHeight: "100vh",
        width: "100%",
        color: "var(--ink)",
        fontSize: "14px",
        backgroundColor: "var(--canvas)",
        fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif",
        display: "flex",
      }}
    >
      {/* Left admin rail */}
      <aside
        className="bo-aside"
        style={{
          width: "232px",
          flex: "none",
          borderRight: "1px solid var(--line)",
          background: "var(--surface)",
          padding: "22px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
          height: "100vh",
          boxSizing: "border-box",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
            <div
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "8px",
                background: "var(--pri)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 16px rgba(45,91,255,.30)",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
              </svg>
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>ByteOffer</div>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10.5px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, paddingLeft: "40px" }}>
            // ADMIN
          </div>
        </div>

        <AdminNav />
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            borderBottom: "1px solid var(--line)",
            background: "var(--surface)",
            padding: "16px 26px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>
            管理后台
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "var(--ink3)" }}>ADMIN CONSOLE</div>
        </header>

        <div style={{ padding: "26px", maxWidth: "1120px", width: "100%", boxSizing: "border-box" }}>{children}</div>
      </main>
    </div>
  );
}

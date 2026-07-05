"use client";

// components/admin/admin-nav.tsx
// Left admin navigation. Client component so it can highlight the active route via usePathname.
// Links are plain <Link>s; the visual language mirrors the app's rail (var(--surface)/--line,
// --pri for active). Kept intentionally simple — a flat list of the five admin sections plus a
// "返回应用" escape hatch back to /.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";

interface NavItem {
  href: string;
  label: string;
  hint: string;
}

const ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "仪表盘", hint: "DASHBOARD" },
  { href: "/admin/questions", label: "题库管理", hint: "QUESTIONS" },
  { href: "/admin/import", label: "批量导入", hint: "IMPORT" },
  { href: "/admin/review", label: "审核队列", hint: "REVIEW" },
  { href: "/admin/users", label: "用户", hint: "USERS" },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      {ITEMS.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href} style={navLinkStyle(active)}>
            <span style={{ fontWeight: active ? 700 : 500 }}>{it.label}</span>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "9.5px",
                letterSpacing: ".1em",
                color: active ? "var(--pri)" : "var(--ink3)",
                opacity: 0.8,
              }}
            >
              {it.hint}
            </span>
          </Link>
        );
      })}

      <div style={{ height: "1px", background: "var(--line)", margin: "10px 4px" }} />

      <Link href="/app" style={{ ...navLinkStyle(false), color: "var(--ink3)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          返回应用
        </span>
      </Link>
    </nav>
  );
}

function navLinkStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "9px 12px",
    borderRadius: "9px",
    fontSize: "13.5px",
    textDecoration: "none",
    color: active ? "var(--pri)" : "var(--ink2)",
    background: active ? "var(--pri-w)" : "transparent",
    border: active ? "1px solid var(--pri-w2, var(--line))" : "1px solid transparent",
  };
}

export default AdminNav;

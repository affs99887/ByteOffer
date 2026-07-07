// app/(admin)/admin/users/page.tsx
// User management (architecture §3.3, §9). Server component: requireAdmin, then load the user
// directory via listUsersAction (self-guarded) with an optional email search + cursor pagination.
// Hands rows to the client UserRoleTable, whose role toggle calls setUserRoleAction — the
// LAST_ADMIN guard is enforced server-side and surfaced gracefully in the client. The search box
// and "下一页" links are plain GET navigation (the server component is the source of truth). Dynamic
// + no caching so the build never prerenders (no DB at build time).

import { requireAdmin } from "@/lib/server/guards";
import Link from "next/link";
import { listUsersAction } from "@/lib/actions/admin";
import { Banner, Card, SectionHeader, ghostBtnStyle, inputStyle } from "@/components/admin/ui";
import { UserRoleTable } from "@/components/admin/user-role-toggle";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "用户 · ByteOffer Admin" };

const PAGE_SIZE = 25;

/** Build a /admin/users URL preserving the active search, optionally with a pagination cursor. */
function buildHref(q?: string, cursor?: string): string {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (cursor) p.set("cursor", cursor);
  const qs = p.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const cursor = sp.cursor?.trim() || undefined;

  const res = await listUsersAction({ take: PAGE_SIZE, cursor, search: q });

  const nextCursor = res.ok ? res.data.nextCursor : null;
  const nextHref = nextCursor ? buildHref(q, nextCursor) : null;
  const firstHref = cursor ? buildHref(q) : null; // only when past page 1

  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, marginBottom: "16px" }}>
        // USERS · 用户管理
      </div>

      <Card>
        <SectionHeader
          label="// USERS"
          title="用户与角色"
          desc="切换用户角色（普通用户 ⇄ 管理员）。系统始终保留至少一名管理员：降级最后一名管理员会被拒绝。"
        />

        <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "flex-end", marginBottom: "16px" }}>
          <div style={{ flex: "1 1 260px", minWidth: "220px" }}>
            <label style={fieldLabel}>按邮箱搜索</label>
            <input name="q" defaultValue={q ?? ""} placeholder="输入邮箱片段，如 @gmail" style={inputStyle} />
          </div>
          <button type="submit" style={ghostBtnStyle}>
            搜索
          </button>
          {q && (
            <Link href="/admin/users" style={{ ...ghostBtnStyle, textDecoration: "none", color: "var(--ink3)" }}>
              清除
            </Link>
          )}
        </form>

        {res.ok ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* key by search+cursor so navigating pages remounts the table with fresh rows
                (its role state is seeded from props on mount only). */}
            <UserRoleTable key={`${q ?? ""}::${cursor ?? ""}`} users={res.data.items} />

            {(firstHref || nextHref) && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "12px", color: "var(--ink3)" }}>
                  本页 {res.data.items.length} 位用户{nextHref ? "，还有更多" : ""}
                </div>
                <div style={{ display: "inline-flex", gap: "8px" }}>
                  {firstHref && (
                    <Link href={firstHref} style={{ ...ghostBtnStyle, padding: "7px 13px", fontSize: "12px", textDecoration: "none" }}>
                      ← 回到第一页
                    </Link>
                  )}
                  {nextHref && (
                    <Link href={nextHref} style={{ ...ghostBtnStyle, padding: "7px 13px", fontSize: "12px", textDecoration: "none" }}>
                      下一页 →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Banner kind="error">{res.error.message ?? "加载用户列表失败"}</Banner>
        )}
      </Card>
    </div>
  );
}

const fieldLabel = {
  display: "block",
  fontSize: "12px",
  fontFamily: "'JetBrains Mono',monospace",
  letterSpacing: ".08em",
  color: "var(--ink3)",
  fontWeight: 600,
  marginBottom: "6px",
} as const;

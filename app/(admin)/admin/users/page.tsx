// app/(admin)/admin/users/page.tsx
// User management (architecture §3.3, §9). Server component: requireAdmin, then load the user
// directory via listUsersAction (self-guarded). Hands rows to the client UserRoleTable, whose role
// toggle calls setUserRoleAction — the LAST_ADMIN guard is enforced server-side and surfaced
// gracefully in the client. Dynamic + no caching so the build never prerenders (no DB at build
// time).

import { requireAdmin } from "@/lib/server/guards";
import { listUsersAction } from "@/lib/actions/admin";
import { Banner, Card, SectionHeader } from "@/components/admin/ui";
import { UserRoleTable } from "@/components/admin/user-role-toggle";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "用户 · ByteOffer Admin" };

export default async function AdminUsersPage() {
  await requireAdmin();
  const res = await listUsersAction({ take: 100 });

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
        {res.ok ? (
          <UserRoleTable users={res.data.items} />
        ) : (
          <Banner kind="error">{res.error.message ?? "加载用户列表失败"}</Banner>
        )}
      </Card>
    </div>
  );
}

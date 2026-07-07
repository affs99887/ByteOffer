// app/(admin)/admin/dashboard/page.tsx
// Admin dashboard (architecture §9). Server component: re-asserts requireAdmin (defense in depth —
// the layout guards too, but every entry re-checks) and renders the dashboardStats() cards. Dynamic
// + no caching so counts are fresh and the build never prerenders (no DB at build time).

import { requireAdmin } from "@/lib/server/guards";
import * as adminService from "@/lib/server/services/adminService";
import { Card, SectionHeader, StatCard } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "仪表盘 · ByteOffer Admin" };

export default async function AdminDashboardPage() {
  await requireAdmin();
  const stats = await adminService.dashboardStats();

  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, marginBottom: "16px" }}>
        // DASHBOARD · 概览
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "14px", marginBottom: "18px" }} className="bo-col2">
        <StatCard label="// QUESTIONS" value={stats.questions.total} hint="题目总数" />
        <StatCard label="// PUBLISHED" value={stats.questions.published} hint="已发布" tint="#0A7D4E" />
        <StatCard label="// IN REVIEW" value={stats.questions.inReview} hint="待审核" tint="#B7791F" />
        <StatCard label="// DRAFT" value={stats.questions.draft} hint="草稿" />
        <StatCard label="// ARCHIVED" value={stats.questions.archived} hint="已下架" tint="#D63C31" />
        <StatCard label="// USERS" value={stats.users} hint="注册用户" />
        <StatCard label="// BANKS" value={stats.banks} hint="题库数量" />
        <StatCard label="// PENDING IMPORTS" value={stats.pendingImports} hint="待确认导入批次" tint={stats.pendingImports > 0 ? "#B7791F" : undefined} />
        <StatCard label="// ATTEMPTS 7D" value={stats.recentAttempts} hint="近 7 日作答" />
      </div>

      <Card>
        <SectionHeader
          label="// SHORTCUTS"
          title="快捷入口"
          desc={
            <>
              <a href="/admin/banks" style={link}>题库管理</a> · <a href="/admin/questions" style={link}>题目管理</a> ·{" "}
              <a href="/admin/import" style={link}>批量导入</a> ·{" "}
              <a href="/admin/review" style={link}>审核队列{stats.questions.inReview > 0 ? `（${stats.questions.inReview}）` : ""}</a> ·{" "}
              <a href="/admin/users" style={link}>用户</a>
            </>
          }
        />
      </Card>
    </div>
  );
}

const link = { color: "var(--pri)", fontWeight: 600, textDecoration: "none" } as const;

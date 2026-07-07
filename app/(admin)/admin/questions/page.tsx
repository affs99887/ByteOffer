// app/(admin)/admin/questions/page.tsx
// Questions admin table (architecture §9, §5.5). Server component: requireAdmin, then
// questionService.list({includeAllStatuses:true, …filters, cursor}) — mirror-column projection only
// (no payload). A GET filter form (status/type/bank) drives the query via searchParams; a `cursor`
// searchParam drives real cursor pagination (a "下一页" <Link> carrying the current filters + the
// service's nextCursor). The bank select + interactive bits (row status/delete + the JSON editor)
// live in the client QuestionsManager. Dynamic + no caching so the build never prerenders (no DB at
// build time).

import { requireAdmin } from "@/lib/server/guards";
import * as questionService from "@/lib/server/services/questionService";
import * as adminService from "@/lib/server/services/adminService";
import { TYPE_LABEL } from "@/lib/qbank/enums";
import { Card, SectionHeader, ghostBtnStyle, inputStyle } from "@/components/admin/ui";
import { QuestionsManager } from "@/components/admin/questions-manager";
import type { Difficulty, QuestionStatus, QuestionType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "题目管理 · ByteOffer Admin" };

// Page size for the admin table. Smaller than the 100 cap so cursor pagination is exercised and the
// table stays responsive on large banks.
const PAGE_SIZE = 50;

const STATUS_OPTIONS: { value: QuestionStatus; label: string }[] = [
  { value: "draft", label: "草稿" },
  { value: "in_review", label: "待审核" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已下架" },
];

function asStatus(v?: string): QuestionStatus | undefined {
  return v && STATUS_OPTIONS.some((o) => o.value === v) ? (v as QuestionStatus) : undefined;
}
function asType(v?: string): QuestionType | undefined {
  return v && v in TYPE_LABEL ? (v as QuestionType) : undefined;
}

/** Build a /admin/questions URL preserving the active filters, optionally with a pagination cursor. */
function buildHref(
  base: { status?: string; type?: string; bankId?: string },
  cursor?: string,
): string {
  const p = new URLSearchParams();
  if (base.status) p.set("status", base.status);
  if (base.type) p.set("type", base.type);
  if (base.bankId) p.set("bankId", base.bankId);
  if (cursor) p.set("cursor", cursor);
  const qs = p.toString();
  return qs ? `/admin/questions?${qs}` : "/admin/questions";
}

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; bankId?: string; cursor?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = asStatus(sp.status);
  const type = asType(sp.type);
  const bankId = sp.bankId?.trim() || undefined;
  const cursor = sp.cursor?.trim() || undefined;

  const [{ items, nextCursor }, banks] = await Promise.all([
    questionService.list({
      includeAllStatuses: true,
      status,
      types: type ? [type] : undefined,
      bankId,
      cursor,
      take: PAGE_SIZE,
    }),
    adminService.listBanks(),
  ]);

  const filterBase = { status, type, bankId };
  const nextHref = nextCursor ? buildHref(filterBase, nextCursor) : null;
  // Only offer "回到第一页" when a cursor is currently active (i.e. we are past page 1).
  const firstHref = cursor ? buildHref(filterBase) : null;

  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, marginBottom: "16px" }}>
        // QUESTIONS · 题目管理
      </div>

      <Card>
        <SectionHeader label="// FILTER" title="筛选" />
        <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
          <div style={{ minWidth: "160px" }}>
            <label style={fieldLabel}>状态</label>
            <select name="status" defaultValue={status ?? ""} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">全部</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: "160px" }}>
            <label style={fieldLabel}>题型</label>
            <select name="type" defaultValue={type ?? ""} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">全部</option>
              {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: "200px", flex: "1 1 200px" }}>
            <label style={fieldLabel}>题库</label>
            <select name="bankId" defaultValue={bankId ?? ""} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">全部题库</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}（{b.slug}）
                </option>
              ))}
            </select>
          </div>
          <button type="submit" style={ghostBtnStyle}>
            应用筛选
          </button>
        </form>
      </Card>

      <QuestionsManager items={items} banks={banks} nextHref={nextHref} firstHref={firstHref} />
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

// Note: `Difficulty` imported for parity with the service's list projection typing; the filter UI
// currently exposes status/type/bank only (difficulty filtering can be added later without schema change).
export type _AdminQuestionsDifficulty = Difficulty;

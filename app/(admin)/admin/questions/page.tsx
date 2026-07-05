// app/(admin)/admin/questions/page.tsx
// Questions admin table (architecture §9, §5.5). Server component: requireAdmin, then
// questionService.list({includeAllStatuses:true, …filters}) — mirror-column projection only (no
// payload). A GET filter form (status/type) drives the query via searchParams. The interactive
// bits (row status/delete actions + the JSON editor) live in the client QuestionsManager. Dynamic
// + no caching so the build never prerenders (no DB at build time).

import { requireAdmin } from "@/lib/server/guards";
import * as questionService from "@/lib/server/services/questionService";
import { TYPE_LABEL } from "@/lib/qbank/enums";
import { Card, SectionHeader, ghostBtnStyle, inputStyle } from "@/components/admin/ui";
import { QuestionsManager } from "@/components/admin/questions-manager";
import type { Difficulty, QuestionStatus, QuestionType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "题库管理 · ByteOffer Admin" };

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

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; bankId?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = asStatus(sp.status);
  const type = asType(sp.type);
  const bankId = sp.bankId?.trim() || undefined;

  const { items, nextCursor } = await questionService.list({
    includeAllStatuses: true,
    status,
    types: type ? [type] : undefined,
    bankId,
    take: 100,
  });

  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, marginBottom: "16px" }}>
        // QUESTIONS · 题库管理
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
            <label style={fieldLabel}>题库 ID（可选）</label>
            <input name="bankId" defaultValue={bankId ?? ""} placeholder="bankId" style={inputStyle} />
          </div>
          <button type="submit" style={ghostBtnStyle}>
            应用筛选
          </button>
        </form>
      </Card>

      <QuestionsManager items={items} nextCursor={nextCursor} />
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
// currently exposes status/type only (difficulty filtering can be added later without schema change).
export type _AdminQuestionsDifficulty = Difficulty;

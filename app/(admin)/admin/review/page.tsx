// app/(admin)/admin/review/page.tsx
// The in_review publish queue (architecture §5.5, §9). Server component: requireAdmin, then load
// the in_review questions via listReviewQueueAction (reused Phase 2 action — the action re-guards
// with requireAdmin, so we unwrap its ActionResult here). Hands the items to the client ReviewQueue
// (checklist → bulkPublishAction). Dynamic + no caching so the build never prerenders (no DB at
// build time).

import { requireAdmin } from "@/lib/server/guards";
import { listReviewQueueAction } from "@/lib/actions/admin";
import { Banner, Card, SectionHeader } from "@/components/admin/ui";
import { ReviewQueue } from "@/components/admin/review-queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "审核队列 · ByteOffer Admin" };

export default async function AdminReviewPage() {
  await requireAdmin();

  // Reuse the Phase 2 action (self-guarded). take up to 100 for the queue view.
  const res = await listReviewQueueAction({ take: 100 });

  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, marginBottom: "16px" }}>
        // REVIEW · 审核队列
      </div>

      <Card>
        <SectionHeader
          label="// PENDING"
          title="待发布题目"
          desc="导入落库的题目为“待审核”状态，用户不可见。勾选后批量发布，转为“已发布”。"
        />
        {res.ok ? (
          <ReviewQueue items={res.data.items} />
        ) : (
          <Banner kind="error">{res.error.message ?? "加载审核队列失败"}</Banner>
        )}
      </Card>
    </div>
  );
}

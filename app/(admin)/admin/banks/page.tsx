// app/(admin)/admin/banks/page.tsx
// Bank management (architecture §9). Server component: requireAdmin, then load the banks with live
// question counts via adminService.listBanksDetailed(). Hands them to the client BanksManager, which
// drives createBank/updateBank/deleteBankAction (all requireAdmin-guarded). Deletion is only offered
// for empty banks (the service re-checks; the Question→bank FK is Restrict). Dynamic + no caching so
// the build never prerenders (no DB at build time).

import { requireAdmin } from "@/lib/server/guards";
import * as adminService from "@/lib/server/services/adminService";
import { Card, SectionHeader } from "@/components/admin/ui";
import { BanksManager } from "@/components/admin/banks-manager";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "题库管理 · ByteOffer Admin" };

export default async function AdminBanksPage() {
  await requireAdmin();
  const banks = await adminService.listBanksDetailed();

  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, marginBottom: "16px" }}>
        // BANKS · 题库管理
      </div>

      <Card>
        <SectionHeader
          label="// BANKS"
          title="题库"
          desc="题库是题目的容器。先创建题库，再到「批量导入」或「题目管理」向其中添加题目。slug 是题库的稳定标识，创建后不可修改；仅当题库为空时才能删除。"
        />
      </Card>

      <BanksManager banks={banks} />
    </div>
  );
}

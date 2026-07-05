// app/(admin)/admin/import/page.tsx
// The two-phase import wizard host (architecture §5.1, §9). Server component: requireAdmin, then
// fetch the bank list for the target select and hand off to the client ImportWizard (which drives
// adminPrepareImportAction → adminConfirmImportAction, plus sample/schema download + export link).
// Dynamic + no caching so the build never prerenders (no DB at build time).

import { requireAdmin } from "@/lib/server/guards";
import * as adminService from "@/lib/server/services/adminService";
import { Banner } from "@/components/admin/ui";
import { ImportWizard } from "@/components/admin/import-wizard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "批量导入 · ByteOffer Admin" };

export default async function AdminImportPage() {
  await requireAdmin();
  const banks = await adminService.listBanks();

  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "var(--pri)", fontWeight: 600, marginBottom: "16px" }}>
        // IMPORT · 批量导入
      </div>

      {banks.length === 0 ? (
        <Banner kind="info">尚无题库。请先创建题库（seed 或后续题库管理），再进行导入。</Banner>
      ) : (
        <ImportWizard banks={banks.map((b) => ({ id: b.id, title: b.title }))} />
      )}
    </div>
  );
}

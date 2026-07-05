// app/api/admin/export/route.ts
// Admin export (architecture §4.2, §5.2). GET ?bankId= reads that bank's rows, maps each
// payload back to a QuestionRecord (quarantining bad rows via recordFromRow → null → filtered),
// wraps them in a QBankEnvelope, and streams a JSON attachment. Round-trip is lossless because
// payload IS the record (§5.2). Guarded by requireAdmin (404 on failure, §3.2). Node runtime.

import { NextResponse } from "next/server";
import { buildEnvelope } from "@/lib/qbank/serialize";
import { requireAdmin } from "@/lib/server/guards";
import { recordFromRow } from "@/lib/server/qbank/mapping";
import * as questionService from "@/lib/server/services/questionService";
import type { QuestionRecord } from "@/lib/qbank/types";

export const runtime = "nodejs";

const notFound = () => new NextResponse("Not Found", { status: 404 });

export async function GET(req: Request): Promise<Response> {
  // AuthZ boundary: 404 on any failure (do not reveal the endpoint).
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return notFound();
  }

  const url = new URL(req.url);
  const bankId = url.searchParams.get("bankId");
  if (!bankId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "缺少 bankId" } },
      { status: 400 },
    );
  }

  const rows = await questionService.listRowsForBankExport(bankId);

  const records: QuestionRecord[] = [];
  for (const row of rows) {
    const rec = recordFromRow(row); // null-quarantines any un-migratable payload
    if (rec) records.push(rec);
  }

  const envelope = buildEnvelope(
    records,
    { title: `ByteOffer 题库导出（${bankId}）`, locale: "zh-CN", author: admin.email ?? undefined },
    new Date().toISOString(),
  );

  const body = JSON.stringify(envelope, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="byteoffer-qbank-${bankId}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

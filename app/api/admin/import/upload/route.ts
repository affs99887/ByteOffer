// app/api/admin/import/upload/route.ts
// Admin import upload (architecture §4.2, §5.1). Accepts a multipart file OR a JSON body,
// parses it to an envelope, and runs importService.prepare (validate + persist ImportBatch,
// writes NO questions). Guarded by requireAdmin — any guard failure returns 404 (not 403) so
// admin surface existence is not leaked (§3.2). Node runtime (touches prisma).

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/guards";
import * as importService from "@/lib/server/services/importService";
import type { MergeMode } from "@/lib/server/services/importService";

export const runtime = "nodejs";

const notFound = () => new NextResponse("Not Found", { status: 404 });

function parseMergeMode(v: FormDataEntryValue | string | null | undefined): MergeMode {
  return v === "replace" ? "replace" : "merge";
}

export async function POST(req: Request): Promise<Response> {
  // AuthZ boundary: on any failure, 404 (do not reveal the endpoint).
  let adminId: string;
  try {
    const admin = await requireAdmin();
    adminId = admin.id;
  } catch {
    return notFound();
  }

  const contentType = req.headers.get("content-type") ?? "";

  let envelope: unknown;
  let bankId: string | null = null;
  let mergeMode: MergeMode = "merge";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      bankId = (form.get("bankId") as string | null) ?? null;
      mergeMode = parseMergeMode(form.get("mergeMode"));
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: { code: "VALIDATION", message: "缺少文件" } }, { status: 400 });
      }
      envelope = JSON.parse(await file.text());
    } else {
      // JSON body: { bankId, mergeMode?, envelope }
      const body = (await req.json()) as {
        bankId?: string;
        mergeMode?: string;
        envelope?: unknown;
      };
      bankId = body.bankId ?? null;
      mergeMode = parseMergeMode(body.mergeMode ?? null);
      envelope = body.envelope;
    }
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "文件不是合法 JSON" } },
      { status: 400 },
    );
  }

  if (!bankId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "缺少 bankId" } },
      { status: 400 },
    );
  }

  try {
    const { report, batchId } = await importService.prepare(envelope, adminId, bankId, mergeMode);
    return NextResponse.json({ report, batchId });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "服务器错误，请稍后再试" } },
      { status: 500 },
    );
  }
}

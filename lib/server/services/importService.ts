// lib/server/services/importService.ts
// Two-phase question import with a persistent review queue (architecture §5.1). One of the
// ONLY layers touching Prisma. prepare() validates + persists an ImportBatch (pending) but
// writes NO questions; confirm() RE-runs validateEnvelope server-side (discarding the client
// report), then upserts accepted records inside a single $transaction.

import { validateEnvelope } from "@/lib/qbank/validate";
import type { ImportReport } from "@/lib/qbank/validate";
import { prisma } from "@/lib/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/server/errors";
import { questionRowFromRecord } from "@/lib/server/qbank/mapping";
import { syncTags } from "@/lib/server/qbank/tags";
import type { Prisma } from "@prisma/client";

export type MergeMode = "merge" | "replace";

export interface PrepareResult {
  report: ImportReport;
  batchId: string;
}

export interface ConfirmResult {
  applied: number;
  rejected: number;
  warned: number;
}

/**
 * prepare — validate the raw envelope (same pure validateEnvelope the UI wizard uses), persist
 * an ImportBatch{status:pending, report, rawPayload, mergeMode, bankId, adminId}, and return the
 * report + batchId. Writes NO questions (§5.1). rawPayload is stored verbatim for re-validation.
 */
export async function prepare(
  rawEnvelope: unknown,
  adminId: string,
  bankId: string,
  mergeMode: MergeMode,
): Promise<PrepareResult> {
  const report = validateEnvelope(rawEnvelope);

  const batch = await prisma.importBatch.create({
    data: {
      adminId,
      bankId,
      status: "pending",
      mergeMode,
      report: report as unknown as Prisma.InputJsonValue,
      rawPayload: (rawEnvelope ?? {}) as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return { report, batchId: batch.id };
}

/**
 * confirm — apply a pending batch. Loads the batch (asserts owner + still pending), RE-runs
 * validateEnvelope on the stored rawPayload server-side (client report discarded), and if the
 * file is OK, upserts every accepted record inside a $transaction:
 *   - mergeMode "replace": archive Questions in the bank whose id is NOT in the accepted set.
 *   - each accepted record: upsert (create → status:"in_review"; update → last-wins) + syncTags.
 * Marks the batch applied. Never hard-deletes (preserves attempt/progress FKs, §5.1/§5.5).
 */
export async function confirm(batchId: string, adminId: string): Promise<ConfirmResult> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError();
  if (batch.adminId !== adminId) throw new ForbiddenError();
  if (batch.status !== "pending") {
    throw new ValidationError("该导入批次已处理，无法重复确认", { batchId: "批次不是 pending 状态" });
  }

  // Re-validate server-side; the client-supplied report is never trusted.
  const report = validateEnvelope(batch.rawPayload);

  if (!report.fileOk) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "rejected", report: report as unknown as Prisma.InputJsonValue },
    });
    return { applied: 0, rejected: report.counts.rejected, warned: report.counts.warned };
  }

  const acceptedIds = report.accepted.map((r) => r.id);

  await prisma.$transaction(async (tx) => {
    if (batch.mergeMode === "replace") {
      await tx.question.updateMany({
        where: { bankId: batch.bankId, id: { notIn: acceptedIds.length > 0 ? acceptedIds : ["__none__"] } },
        data: { status: "archived" },
      });
    }

    for (const rec of report.accepted) {
      const row = questionRowFromRecord(rec, batch.bankId);
      await tx.question.upsert({
        where: { id: rec.id },
        // Imports land in in_review (not published; not user-visible until bulkPublish).
        create: { ...row, status: "in_review" },
        // last-wins on re-import; status is NOT reset here (an already-published question
        // stays published on re-import — publish workflow owns status transitions).
        update: {
          bankId: row.bankId,
          type: row.type,
          difficulty: row.difficulty,
          gradingClass: row.gradingClass,
          stemText: row.stemText,
          tagsFlat: row.tagsFlat,
          payload: row.payload,
          schemaVersion: row.schemaVersion,
        },
      });
      await syncTags(tx, rec.id, rec.tags);
    }

    await tx.importBatch.update({
      where: { id: batch.id },
      data: { status: "applied", appliedAt: new Date(), report: report as unknown as Prisma.InputJsonValue },
    });
  });

  return {
    applied: report.accepted.length,
    rejected: report.counts.rejected,
    warned: report.counts.warned,
  };
}

// lib/server/services/importService.ts
// Two-phase question import with a persistent review queue (architecture §5.1). One of the
// ONLY layers touching Prisma. prepare() validates + persists an ImportBatch (pending) but
// writes NO questions; confirm() RE-runs validateEnvelope server-side (discarding the client
// report), then upserts accepted records in SEQUENTIAL CHUNKS (one $transaction per chunk).
//
// Two hardening invariants beyond raw validateEnvelope, both applied on the SAME server-side report
// in prepare AND confirm (prepare's copy is advisory; confirm re-derives and never trusts it):
//   - ID SAFETY GATE (assertLoadableIds): within-file duplicate ids and ids that already live in a
//     DIFFERENT bank are promoted from validateEnvelope's silent last-wins WARNING to file-level
//     ERRORS — a 500+ hand-curated batch must never silently drop a question or migrate one across
//     banks. See assertLoadableIds for the exact semantics.
//   - CHUNKED APPLY: confirm splits report.accepted into CHUNK_SIZE-record transactions applied
//     sequentially, trading whole-batch atomicity for completability on Neon(PgBouncer)+Vercel,
//     where a single 500-question / ~2000-statement transaction would time out. Partial-failure
//     semantics are documented on confirm().

import { validateEnvelope } from "@/lib/qbank/validate";
import type { ImportReport } from "@/lib/qbank/validate";
import { prisma } from "@/lib/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import { questionRowFromRecord } from "@/lib/server/qbank/mapping";
import { syncTags } from "@/lib/server/qbank/tags";
import type { Prisma } from "@prisma/client";

export type MergeMode = "merge" | "replace";

/**
 * Records applied per $transaction. Each accepted record is an upsert + a syncTags (itself several
 * statements), so a chunk of 25 is ~100–150 statements — comfortably inside PgBouncer/statement
 * timeouts while keeping the number of sequential round-trips low. Chunks are applied in order.
 */
const CHUNK_SIZE = 25;

/** Per-chunk transaction timeout (ms). Generous: a chunk is small, but Neon cold starts add latency. */
const CHUNK_TX_TIMEOUT_MS = 60_000;

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

  // Run the id-safety gate against the TARGET bank so the wizard shows dup-id / cross-bank conflicts
  // up front (confirm is disabled while !fileOk). Advisory only — confirm re-derives this server-side.
  await assertLoadableIds(report, bankId);

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
 * validateEnvelope + the id-safety gate server-side (client report discarded), and if the file is
 * OK, applies accepted records in SEQUENTIAL CHUNKS (CHUNK_SIZE per $transaction):
 *   - mergeMode "replace": FIRST archive Questions in the bank whose id is NOT in the accepted set
 *     (its own statement, before the chunk loop).
 *   - each accepted record: upsert (create → status:"in_review"; update → last-wins) + syncTags.
 * The batch flips to "applied" ONLY after EVERY chunk lands. Never hard-deletes (preserves
 * attempt/progress FKs, §5.1/§5.5).
 *
 * ── PARTIAL-FAILURE SEMANTICS (chunked, non-atomic by design) ──────────────────────────────────
 * We deliberately trade the old "whole batch in one transaction" atomicity for completability on
 * Neon(PgBouncer)+Vercel, where 500 records × (upsert + syncTags) in ONE transaction reliably times
 * out. Consequence: if chunk k fails, chunks 0..k-1 are ALREADY committed (their questions exist as
 * in_review), the "replace" archive (if any) has ALREADY happened, and the ImportBatch is LEFT
 * PENDING (never flipped to applied). We throw a clear Chinese ValidationError naming the failed
 * chunk and the approximate count already written. Because the batch stays pending it is RETRYABLE:
 * re-running confirm re-validates, re-archives (idempotent), and re-applies ALL chunks — the upserts
 * are id-keyed last-wins so already-written chunks are no-ops and no row is duplicated. This is the
 * coherent state: every WRITTEN row is fully written (row-atomic), nothing is half-written, and the
 * operation is resumable to completion.
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

  // Re-run the id-safety gate against the batch's bank BEFORE the fileOk check (a gate failure marks
  // the whole batch rejected below — nothing is applied). Cheap on retry: already-imported rows live
  // in THIS bank, so they are not cross-bank conflicts.
  await assertLoadableIds(report, batch.bankId);

  if (!report.fileOk) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "rejected", report: report as unknown as Prisma.InputJsonValue },
    });
    return { applied: 0, rejected: report.counts.rejected, warned: report.counts.warned };
  }

  const acceptedIds = report.accepted.map((r) => r.id);

  // "replace": archive out-of-set questions first, in its own statement. Idempotent on retry.
  if (batch.mergeMode === "replace") {
    await prisma.question.updateMany({
      where: { bankId: batch.bankId, id: { notIn: acceptedIds.length > 0 ? acceptedIds : ["__none__"] } },
      data: { status: "archived" },
    });
  }

  // Apply in sequential chunks. A failed chunk aborts the loop, leaves the batch pending, and throws
  // a clear error (see PARTIAL-FAILURE SEMANTICS above).
  const chunks = chunkArray(report.accepted, CHUNK_SIZE);
  for (let c = 0; c < chunks.length; c++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          for (const rec of chunks[c]) {
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
                chapter: row.chapter,
                section: row.section,
                payload: row.payload,
                schemaVersion: row.schemaVersion,
              },
            });
            await syncTags(tx, rec.id, rec.tags);
          }
        },
        { timeout: CHUNK_TX_TIMEOUT_MS },
      );
    } catch (err) {
      const written = c * CHUNK_SIZE; // fully-committed chunks precede the failed one
      logger.error("import_chunk_failed", {
        batchId: batch.id,
        chunk: c,
        totalChunks: chunks.length,
        message: err instanceof Error ? err.message : String(err),
      });
      throw new ValidationError(
        `导入在第 ${c + 1}/${chunks.length} 批写入时失败：已成功写入约 ${written} 题（落为待审核），其余未写入。` +
          `本批次仍为“待确认”，请稍后重试确认——已写入的题目不会重复导入。`,
        { batchId: "分块写入失败，可重试" },
      );
    }
  }

  // Every chunk landed → flip to applied and persist the authoritative server-side report.
  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: "applied", appliedAt: new Date(), report: report as unknown as Prisma.InputJsonValue },
  });

  return {
    applied: report.accepted.length,
    rejected: report.counts.rejected,
    warned: report.counts.warned,
  };
}

/**
 * assertLoadableIds — the batch-loader ID safety gate (audit content-seed finding: validate.ts:439).
 * validateEnvelope only WARNS on within-file duplicate ids ("last-wins") and knows nothing about
 * existing rows, so a large hand-curated batch can (a) silently DROP a question when an id repeats
 * in the file, or (b) silently MIGRATE a question across banks when an id already exists in a
 * different bank (confirm upserts BY the global Question.id primary key). Both are data corruption,
 * not warnings. This gate — run on the SAME server-side report in prepare AND confirm — promotes
 * them to FILE-LEVEL ERRORS:
 *   1. within-file duplicate id      → always an error (reject the whole batch; fix to unique ids).
 *   2. id already in a DIFFERENT bank → always blocked, regardless of mergeMode. `replace` only
 *      archives questions WITHIN the target bank; it never authorizes a cross-bank move. Re-importing
 *      an id that already lives in THIS bank is the normal update path and stays allowed.
 * Mutation contract: on any conflict it appends error-level envelopeIssues (naming the offending
 * ids) and flips fileOk=false + accepted=[], mirroring validateEnvelope's own invariant that
 * fileOk===false ⟹ accepted===[] (so no downstream path can apply a batch that failed the gate).
 */
async function assertLoadableIds(report: ImportReport, bankId: string): Promise<void> {
  if (!report.fileOk) return; // already fatal — nothing to promote

  // 1. Within-file duplicates: count every record that carries an id (accepted or not).
  const idCounts = new Map<string, number>();
  for (const r of report.records) {
    if (r.id) idCounts.set(r.id, (idCounts.get(r.id) ?? 0) + 1);
  }
  const dupIds = [...idCounts].filter(([, n]) => n > 1).map(([id]) => id);

  // 2. Cross-bank collisions among the ids we would actually write.
  const acceptedIds = report.accepted.map((r) => r.id);
  let crossBankIds: string[] = [];
  if (acceptedIds.length > 0) {
    const existing = await prisma.question.findMany({
      where: { id: { in: acceptedIds }, bankId: { not: bankId } },
      select: { id: true },
    });
    crossBankIds = existing.map((e) => e.id);
  }

  if (dupIds.length === 0 && crossBankIds.length === 0) return;

  if (dupIds.length > 0) {
    report.envelopeIssues.push({
      level: "error",
      path: "$.questions",
      code: "dup_id_in_file",
      msg: `文件内存在重复题目 id（共 ${dupIds.length} 个），会静默丢题，已阻止导入。请改为唯一 id：${formatIdList(dupIds)}`,
    });
  }
  if (crossBankIds.length > 0) {
    report.envelopeIssues.push({
      level: "error",
      path: "$.questions",
      code: "id_in_other_bank",
      msg: `以下题目 id 已属于其它题库，导入会把它们串库/迁移，已阻止（共 ${crossBankIds.length} 个）：${formatIdList(crossBankIds)}`,
    });
  }

  report.fileOk = false;
  report.accepted = [];
}

/** Split into fixed-size chunks (order preserved). */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Render an id list for an error message, capping the count so the message stays bounded. */
function formatIdList(ids: string[], max = 10): string {
  const shown = ids.slice(0, max).join("、");
  return ids.length > max ? `${shown} 等 ${ids.length} 个` : shown;
}

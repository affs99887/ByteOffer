// prisma/seed.ts
// Idempotent seed (architecture.md §11). Every write is an upsert so it is safe to re-run in
// any environment. Run: `npx tsx prisma/seed.ts` (also wired as prisma.seed / db:seed).
//
// Plants (in order):
//   seedPlans()             → Plan(free/plus). Free-for-all release: both tiers grant every
//                             feature; Plus is a future placeholder (not for sale).
//   backfillFreeEntitlements() → widen previously-seeded free users to the new grants.
//   seedAdmin(password)     → bootstrap admin User (+ Subscription + Entitlement). In production
//                             a strong ADMIN_PASSWORD is MANDATORY (throws otherwise).
//   seedBank(adminId)       → QuestionBank("frontend-core") loaded from EVERY
//                             prisma/seed-data/*.json envelope through the SAME server write path
//                             the admin importer uses (validateEnvelope → questionRowFromRecord →
//                             upsert(published) → syncTags), chunked ~25 records per transaction.
//
// Why reuse the server pipeline (validate.ts + mapping.ts + tags.ts) instead of a bespoke adapter:
// gradingClass / stemText / tagsFlat and the media write-boundary invariant are derived in exactly
// ONE place (questionRowFromRecord), so seeded content can never drift from admin-imported content.
// The chain pulls in only pure kernel modules plus PrismaClient (tags.ts → lib/server/db, lazily
// instantiated — no connection until a query, no next/env), so it executes cleanly under tsx.

/* eslint-disable no-console -- seed is a CLI script; progress/summary logging is intentional. */

import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

import { validateEnvelope } from "@/lib/qbank/validate";
import type { ImportReport, RecordIssue } from "@/lib/qbank/validate";
import type { QuestionRecord } from "@/lib/qbank/types";
import { questionRowFromRecord } from "@/lib/server/qbank/mapping";
import type { QuestionRowInput } from "@/lib/server/qbank/mapping";
import { syncTags } from "@/lib/server/qbank/tags";

const prisma = new PrismaClient();

// ============================================================
//  Environment (seed is a standalone script; env.ts is an app-runtime concern)
// ============================================================

// "production" for the hardening rule = Vercel deploy OR NODE_ENV=production.
const IS_PROD = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
// The literal dev placeholder — never allowed to reach production.
const FALLBACK_ADMIN_PASSWORD = "change-me-strong-password";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@byteoffer.dev";
const PRICE_MONTHLY = process.env.STRIPE_PRICE_PLUS_MONTHLY || null;
const PRICE_YEARLY = process.env.STRIPE_PRICE_PLUS_YEARLY || null;

const BANK_SLUG = "frontend-core";
// PgBouncer/Neon serverless friendliness: keep each interactive transaction small so it never
// approaches the pooled statement/transaction timeout (§ content-seed audit). ~25 upserts +
// their syncTags per tx.
const CHUNK_SIZE = 25;

// ============================================================
//  Admin password hardening (§ bootstrap)
// ============================================================

/**
 * resolveAdminPassword — fail-fast bootstrap guard.
 *  - production (VERCEL || NODE_ENV=production): a real ADMIN_PASSWORD is MANDATORY. Missing or
 *    still the literal dev placeholder → throw (non-zero exit) with a clear Chinese message.
 *  - dev: keep the placeholder but warn loudly so nobody ships it by accident.
 * Called at the very top of main() so we never write plans/questions before failing on a bad env.
 */
function resolveAdminPassword(): string {
  const raw = process.env.ADMIN_PASSWORD;
  if (IS_PROD) {
    if (!raw || raw === FALLBACK_ADMIN_PASSWORD) {
      throw new Error(
        "生产环境必须配置强口令环境变量 ADMIN_PASSWORD（且不得沿用默认占位口令）。" +
          "请在部署平台的环境变量中设置后重新执行数据库种子。",
      );
    }
    return raw;
  }
  if (!raw) {
    console.warn(
      "[seed] ⚠️ 未设置 ADMIN_PASSWORD，开发环境回退为默认占位口令；切勿用于生产。",
    );
    return FALLBACK_ADMIN_PASSWORD;
  }
  if (raw === FALLBACK_ADMIN_PASSWORD) {
    console.warn("[seed] ⚠️ ADMIN_PASSWORD 仍为默认占位口令；切勿用于生产。");
  }
  return raw;
}

// ============================================================
//  Envelope discovery + validation (PURE — no DB)
//  Exported so the scratchpad dry-runner can exercise the real loader offline.
// ============================================================

/**
 * resolveSeedDataDir — locate prisma/seed-data independent of the invocation cwd. Prefers a path
 * relative to this file (tsx runs seed.ts as CommonJS, so __dirname is prisma/), falling back to
 * <cwd>/prisma/seed-data. Returns the first existing candidate, else the cwd-based default (which
 * yields a clear "no envelopes" error downstream).
 */
export function resolveSeedDataDir(): string {
  const candidates: string[] = [];
  // `typeof` guard is exception-safe even where __dirname is not defined (ESM).
  if (typeof __dirname !== "undefined") candidates.push(path.join(__dirname, "seed-data"));
  candidates.push(path.resolve(process.cwd(), "prisma", "seed-data"));
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[candidates.length - 1];
}

/** All *.json envelope files in `dir`, sorted for a deterministic load order. [] if dir absent. */
export function discoverEnvelopeFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));
}

/** Loud, non-blocking warning log for every warning issue in a report (envelope + per-record). */
function logEnvelopeWarnings(file: string, report: ImportReport): void {
  const base = path.basename(file);
  const warn = (iss: RecordIssue, idx?: number) => {
    if (iss.level !== "warning") return;
    const where = idx === undefined ? iss.path : `q[${idx}] ${iss.path}`;
    console.warn(`[seed:warn] ${base} ${where} (${iss.code}): ${iss.msg}`);
  };
  for (const iss of report.envelopeIssues) warn(iss);
  report.records.forEach((r) => r.issues.forEach((iss) => warn(iss, r.index)));
}

/** Collapse a record report's errors into a short, human-readable one-liner. */
function firstErrors(issues: RecordIssue[], limit = 3): string {
  const errs = issues.filter((i) => i.level === "error");
  const head = errs.slice(0, limit).map((e) => `${e.path}:${e.msg}`).join("；");
  return errs.length > limit ? `${head}（其余 ${errs.length - limit} 条略）` : head;
}

/**
 * loadAcceptedRecords — read → parse → validateEnvelope EVERY file, enforcing the seed contract:
 *   - JSON.parse failure                          → hard fail (with file context).
 *   - fileOk === false (format/version/media)     → hard fail; envelope not imported.
 *   - ANY record rejected (report.counts.rejected)→ hard fail; seed demands a clean bank.
 *   - duplicate id within a file OR across files  → hard fail (Question.id is a GLOBAL primary key;
 *                                                    a duplicate silently overwrites/loses a题).
 *   - zero accepted records across all files       → hard fail (an empty published bank is a bug).
 * Warnings are logged loudly but never block. Returns the flat accepted set + total warning count.
 */
export function loadAcceptedRecords(files: string[]): { records: QuestionRecord[]; warned: number } {
  if (files.length === 0) {
    throw new Error(
      "未在 prisma/seed-data/ 找到任何题库信封（*.json）。请放入至少一个 byteoffer.qbank 文件后重试。",
    );
  }

  const seenId = new Map<string, string>(); // id -> source file (for cross/within-file dup detection)
  const records: QuestionRecord[] = [];
  let warned = 0;

  for (const file of files) {
    const base = path.basename(file);

    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`无法解析题库信封 JSON（${base}）：${e instanceof Error ? e.message : String(e)}`);
    }

    const report = validateEnvelope(raw);
    logEnvelopeWarnings(file, report);
    warned += report.counts.warned;

    if (!report.fileOk) {
      const envErr = firstErrors(report.envelopeIssues);
      const recErr = firstErrors(report.records.flatMap((r) => r.issues));
      throw new Error(
        `题库信封校验未通过（${base}）：${[envErr, recErr].filter(Boolean).join("；") || "文件级错误"}`,
      );
    }

    if (report.counts.rejected > 0) {
      const rejected = report.records.filter((r) => !r.ok);
      const detail = rejected
        .slice(0, 5)
        .map((r) => `#${r.index}${r.id ? `(${r.id})` : ""}: ${firstErrors(r.issues)}`)
        .join("\n  ");
      throw new Error(
        `题库信封 ${base} 有 ${report.counts.rejected} 条记录被拒（seed 要求零拒绝）：\n  ${detail}`,
      );
    }

    for (const rec of report.accepted) {
      const prev = seenId.get(rec.id);
      if (prev !== undefined) {
        const where = prev === file ? `文件 ${base} 内部重复` : `${path.basename(prev)} 与 ${base} 之间重复`;
        throw new Error(
          `检测到重复题目 id "${rec.id}"（${where}）。Question.id 是全局主键，重复会静默丢题/串库，已中止。`,
        );
      }
      seenId.set(rec.id, file);
      records.push(rec);
    }
  }

  if (records.length === 0) {
    throw new Error("题库信封中没有任何通过校验的题目（accepted=0），seed 会得到空题库，已中止。");
  }

  return { records, warned };
}

/**
 * buildRows — map EVERY accepted record through the shared server write path BEFORE any DB write,
 * so a media write-boundary violation (mapping.ts requires every media.src to be a data:image/ URI)
 * fails fast with the offending id instead of half-writing chunks. Pure: questionRowFromRecord
 * touches no DB, so this is also exercised offline by the dry-runner (with a placeholder bankId).
 */
export function buildRows(
  records: QuestionRecord[],
  bankId: string,
  authorId: string,
): QuestionRowInput[] {
  return records.map((rec) => {
    try {
      return questionRowFromRecord(rec, bankId, { authorId });
    } catch (e) {
      throw new Error(
        `题目 "${rec.id}" 写入映射失败（很可能违反 media 必须为 data:image/* 的写入边界）：` +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  });
}

// ============================================================
//  Plans + entitlements (free-for-all release)
// ============================================================

/**
 * seedPlans — upsert the two Plan rows. Product decision (binding): this release is FREE for all
 * registered users — no paywall, no quota. Both tiers therefore grant every feature; `plus` is
 * kept ONLY as a future "即将推出" tier (not for sale) and carries the Stripe price ids if set.
 * aiExplain is false everywhere (no AI feature this release).
 */
async function seedPlans(): Promise<void> {
  const free = {
    name: "免费版",
    dailyQuota: null, // null = unlimited
    premiumBanks: true,
    examMode: true,
    aiExplain: false,
  };
  await prisma.plan.upsert({
    where: { tier: "free" },
    create: { tier: "free", ...free },
    update: free,
  });

  const plus = {
    name: "Plus 会员",
    dailyQuota: null,
    premiumBanks: true,
    examMode: true,
    aiExplain: false,
    stripePriceIdMonthly: PRICE_MONTHLY,
    stripePriceIdYearly: PRICE_YEARLY,
  };
  await prisma.plan.upsert({
    where: { tier: "plus" },
    create: { tier: "plus", ...plus },
    update: plus,
  });
}

/**
 * backfillFreeEntitlements — grant the new free-for-all entitlements to users seeded BEFORE this
 * release (they were created with dailyQuota=30 / premiumBanks=false). Idempotent updateMany.
 */
async function backfillFreeEntitlements(): Promise<void> {
  const res = await prisma.entitlement.updateMany({
    where: { tier: "free" },
    data: { dailyQuota: null, premiumBanks: true, examMode: true },
  });
  if (res.count > 0) {
    console.log(`[seed] 已回填 ${res.count} 位免费用户的权益（无限额度 + 全部题库/考试模式）。`);
  }
}

// ============================================================
//  Admin bootstrap
// ============================================================

/**
 * seedAdmin — bootstrap (or re-sync) the admin account. Idempotent: role/verified/passwordHash are
 * refreshed on every run. The admin's Subscription/Entitlement mirror the free-for-all grants.
 */
async function seedAdmin(password: string): Promise<string> {
  const now = new Date();
  // argon2id hash (default variant of @node-rs/argon2's hash()).
  const passwordHash = await hash(password);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin",
      role: "admin",
      passwordHash,
      emailVerified: now,
    },
    // Keep admin role + verified; refresh the password hash so seed re-runs re-sync it.
    update: {
      role: "admin",
      passwordHash,
      emailVerified: now,
    },
  });

  await prisma.subscription.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, tier: "free", status: "active" },
    update: {},
  });

  // Free-for-all grants (unlimited, every feature; no AI).
  const grants = { tier: "free" as const, dailyQuota: null, premiumBanks: true, examMode: true, aiExplain: false };
  await prisma.entitlement.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, ...grants },
    update: grants,
  });

  return admin.id;
}

// ============================================================
//  Bank seeding (envelope files → published questions)
// ============================================================

interface BankSummary {
  bankSlug: string;
  files: number;
  accepted: number;
  warned: number;
  publishedTotal: number;
  bankPublished: number;
}

/**
 * seedBank — load every prisma/seed-data/*.json envelope and publish it into the "frontend-core"
 * bank via the shared server write path. Order:
 *   1. discover + validate all envelopes (hard-fail on any error / rejected record / dup id).
 *   2. upsert the bank.
 *   3. map ALL accepted records to rows up-front (fail fast on the media boundary).
 *   4. chunk writes into ~CHUNK_SIZE-record $transactions: upsert(published) + syncTags per record.
 *   5. assert the published count is >= the accepted count (guards against silent quarantine).
 */
async function seedBank(authorId: string): Promise<BankSummary> {
  const now = new Date();

  const files = discoverEnvelopeFiles(resolveSeedDataDir());
  const { records, warned } = loadAcceptedRecords(files);

  const bank = await prisma.questionBank.upsert({
    where: { slug: BANK_SLUG },
    create: {
      slug: BANK_SLUG,
      title: "前端高频面试题库",
      description: "官方精选前端面试题库（可通过 prisma/seed-data 或 /admin/import 扩充）。",
      isPremium: false,
      sortOrder: 0,
    },
    update: { title: "前端高频面试题库" },
  });

  // Map first so a bad media.src aborts BEFORE any partial chunk is committed.
  const rows = buildRows(records, bank.id, authorId);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const slice = rows.slice(i, i + CHUNK_SIZE);
    await prisma.$transaction(
      async (tx) => {
        for (const row of slice) {
          await tx.question.upsert({
            where: { id: row.id },
            // Seed publishes directly (unlike admin import, which lands in_review): the bank must
            // be immediately practiceable.
            create: { ...row, status: "published", publishedAt: now },
            update: {
              bankId: row.bankId,
              type: row.type,
              difficulty: row.difficulty,
              gradingClass: row.gradingClass,
              stemText: row.stemText,
              tagsFlat: row.tagsFlat,
              payload: row.payload,
              schemaVersion: row.schemaVersion,
              authorId: row.authorId,
              status: "published",
              publishedAt: now,
            },
          });
          // Populate Tag/QuestionTag so the normalized tag tables match import output.
          await syncTags(tx, row.id, row.tagsFlat);
        }
      },
      // Generous timeout: a chunk is up to CHUNK_SIZE upserts each followed by a multi-query
      // syncTags, serialized over a single pooled Neon connection.
      { maxWait: 15_000, timeout: 60_000 },
    );
  }

  // Guard: every accepted record must be published. A shortfall means a payload was silently
  // dropped somewhere and the bank is incomplete.
  const publishedTotal = await prisma.question.count({ where: { status: "published" } });
  const bankPublished = await prisma.question.count({ where: { status: "published", bankId: bank.id } });
  if (publishedTotal < records.length) {
    throw new Error(
      `发布数校验失败：已发布题目 ${publishedTotal} 少于本次接受的 ${records.length} 条，可能有题目被静默丢弃。`,
    );
  }

  return {
    bankSlug: bank.slug,
    files: files.length,
    accepted: records.length,
    warned,
    publishedTotal,
    bankPublished,
  };
}

// ============================================================
//  Orchestration
// ============================================================

async function main(): Promise<void> {
  // Fail fast on a bad prod password before writing anything.
  const adminPassword = resolveAdminPassword();

  await seedPlans();
  await backfillFreeEntitlements();
  const adminId = await seedAdmin(adminPassword);
  const summary = await seedBank(adminId);

  console.log(
    [
      "",
      "──────────────────────────── Seed 完成 ────────────────────────────",
      `管理员账号 : ${ADMIN_EMAIL}`,
      `题库 slug   : ${summary.bankSlug}`,
      `信封文件数 : ${summary.files}`,
      `接受题目   : ${summary.accepted}（警告 ${summary.warned} 条，已放行）`,
      `本库已发布 : ${summary.bankPublished}`,
      `全站已发布 : ${summary.publishedTotal}`,
      "───────────────────────────────────────────────────────────────────",
    ].join("\n"),
  );
}

// Autorun on direct execution (tsx prisma/seed.ts / prisma db seed). The scratchpad dry-runner sets
// BYTEOFFER_SEED_NO_AUTORUN=1 to import the pure loader helpers WITHOUT connecting to the database.
if (process.env.BYTEOFFER_SEED_NO_AUTORUN !== "1") {
  main()
    .catch((e) => {
      console.error(e);
      (globalThis as { process?: { exitCode?: number } }).process!.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

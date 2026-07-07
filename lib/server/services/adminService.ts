// lib/server/services/adminService.ts
// Admin-only application service (architecture §3.3, §4.2) — one of the ONLY layers touching
// Prisma. Callers are already gated by requireAdmin at the action boundary; these functions add
// the domain-level invariants that a guard can't express — chiefly the LAST-ADMIN guard (§3.3),
// which forbids demoting the final remaining admin (self or otherwise), closing the "lock
// yourself out of admin" gap.

import { prisma } from "@/lib/server/db";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import type { PlanTier, Prisma, Role } from "@prisma/client";

const DEFAULT_TAKE = 25;
const MAX_TAKE = 100;

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: Date;
  /** Subscription tier if the user has a Subscription row; else null. */
  tier: PlanTier | null;
}

export interface ListUsersParams {
  cursor?: string;
  take?: number;
  /** Case-insensitive email substring filter (admin user search). Empty/blank → no filter. */
  search?: string;
}

export interface ListUsersResult {
  items: AdminUserRow[];
  nextCursor: string | null;
}

/**
 * listUsers — cursor-paginated user directory for the admin console. Joins the (cheap) 1:1
 * Subscription to surface each user's plan tier. Ownership is N/A (admin-only surface). Ordered
 * by createdAt desc, id desc (stable tiebreak) so the newest signups lead the list. An optional
 * `search` applies a case-insensitive email substring filter; it composes with the cursor (the
 * same WHERE is applied on every page) so paging within a search result stays consistent.
 */
export async function listUsers(params: ListUsersParams = {}): Promise<ListUsersResult> {
  const take = Math.min(Math.max(params.take ?? DEFAULT_TAKE, 1), MAX_TAKE);

  const search = params.search?.trim();
  const where: Prisma.UserWhereInput = search
    ? { email: { contains: search, mode: "insensitive" } }
    : {};

  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      subscription: { select: { tier: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1, // over-fetch one to compute nextCursor
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  const items: AdminUserRow[] = page.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt,
    tier: u.subscription?.tier ?? null,
  }));

  const nextCursor = hasMore ? page[page.length - 1].id : null;
  return { items, nextCursor };
}

/**
 * setUserRole — change a user's role with the LAST-ADMIN guard (§3.3).
 *
 * Invariant: the system must always retain at least one admin. When the requested change would
 * DEMOTE (admin → user) an existing admin AND that admin is the last one (`count(role=admin) <= 1`),
 * we throw ValidationError("LAST_ADMIN") — this also covers an admin demoting THEMSELVES as the
 * last admin (target === actingAdmin with no other admin left). Promotions and no-op writes are
 * always allowed. The acting admin id is accepted for auditing/self-demote reasoning; the guard at
 * the action boundary already proved the caller is an admin.
 */
export async function setUserRole(
  _actingAdminId: string,
  targetUserId: string,
  role: Role,
): Promise<{ ok: true; role: Role }> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true },
  });
  if (!target) throw new NotFoundError();

  // No-op: nothing to change (and no invariant to check).
  if (target.role === role) return { ok: true, role };

  // The only dangerous transition is demoting an admin. If the target is currently an admin and
  // is being moved off admin, ensure another admin would remain.
  if (target.role === "admin" && role !== "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      // The last (or only) admin — refuse. Covers self-demotion of the last admin too.
      throw new ValidationError("不能降级最后一名管理员", { role: "LAST_ADMIN" });
    }
  }

  await prisma.user.update({ where: { id: targetUserId }, data: { role } });
  return { ok: true, role };
}

export interface AdminBank {
  id: string;
  title: string;
  slug: string;
}

/**
 * listBanks — the (small) set of question banks for admin selects (import target, export source,
 * question-editor bank picker). Ordered by sortOrder then title. Admin-only; a lightweight
 * id/title/slug projection.
 */
export async function listBanks(): Promise<AdminBank[]> {
  return prisma.questionBank.findMany({
    select: { id: true, title: true, slug: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
}

/** The full admin-console view of a bank: metadata + a live question count (for the manage table). */
export interface AdminBankDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPremium: boolean;
  sortOrder: number;
  questionCount: number;
}

/**
 * listBanksDetailed — the bank-management table source (§ bank management). Same ordering as
 * listBanks, but carries description/isPremium/sortOrder plus a per-bank question count (via
 * _count) so the admin can see which banks are non-empty (and thus undeletable). Admin-only.
 */
export async function listBanksDetailed(): Promise<AdminBankDetail[]> {
  const banks = await prisma.questionBank.findMany({
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      isPremium: true,
      sortOrder: true,
      _count: { select: { questions: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
  return banks.map((b) => ({
    id: b.id,
    slug: b.slug,
    title: b.title,
    description: b.description,
    isPremium: b.isPremium,
    sortOrder: b.sortOrder,
    questionCount: b._count.questions,
  }));
}

export interface CreateBankArgs {
  title: string;
  slug: string;
  description?: string;
  isPremium?: boolean;
  sortOrder?: number;
}

/**
 * createBank — add a question bank. slug is the unique library key; we pre-check it for a friendly
 * per-field error (the DB @unique is the real guard against a race). Returns the created bank in
 * the same AdminBankDetail shape the table renders (questionCount is 0 for a fresh bank).
 */
export async function createBank(args: CreateBankArgs): Promise<AdminBankDetail> {
  const clash = await prisma.questionBank.findUnique({
    where: { slug: args.slug },
    select: { id: true },
  });
  if (clash) {
    throw new ValidationError("该 slug 已被占用，请换一个", { slug: "slug 已存在" });
  }

  const bank = await prisma.questionBank.create({
    data: {
      title: args.title,
      slug: args.slug,
      description: args.description ?? null,
      isPremium: args.isPremium ?? false,
      sortOrder: args.sortOrder ?? 0,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      isPremium: true,
      sortOrder: true,
    },
  });
  return { ...bank, questionCount: 0 };
}

export interface UpdateBankArgs {
  /** title/description/sortOrder/isPremium — each optional; slug is IMMUTABLE (not accepted). */
  title?: string;
  description?: string | null;
  sortOrder?: number;
  isPremium?: boolean;
}

/**
 * updateBank — edit a bank's display fields. slug is intentionally NOT editable (it is the stable
 * key used by export filenames / import round-trips; changing it would orphan references). Only the
 * fields actually present in `patch` are written, so a caller can touch just one. Throws NotFound
 * if the bank is gone.
 */
export async function updateBank(id: string, patch: UpdateBankArgs): Promise<AdminBankDetail> {
  const existing = await prisma.questionBank.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError();

  const data: Prisma.QuestionBankUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.isPremium !== undefined) data.isPremium = patch.isPremium;

  const bank = await prisma.questionBank.update({
    where: { id },
    data,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      isPremium: true,
      sortOrder: true,
      _count: { select: { questions: true } },
    },
  });
  return {
    id: bank.id,
    slug: bank.slug,
    title: bank.title,
    description: bank.description,
    isPremium: bank.isPremium,
    sortOrder: bank.sortOrder,
    questionCount: bank._count.questions,
  };
}

/**
 * deleteBank — remove an EMPTY bank only. We pre-count and raise a clear Chinese error naming the
 * residual question count (friendlier than a raw FK violation) — this is the message admins see in
 * the normal case. The Question→QuestionBank FK is onDelete: Restrict, so in the rare TOCTOU race (a
 * question inserted between the count and the delete) the DB is the authoritative backstop: the
 * delete fails safely (no cascade) rather than orphaning rows. Deleting a bank is only ever safe once
 * its questions are moved/removed.
 */
export async function deleteBank(id: string): Promise<{ ok: true }> {
  const bank = await prisma.questionBank.findUnique({
    where: { id },
    select: { _count: { select: { questions: true } } },
  });
  if (!bank) throw new NotFoundError();
  if (bank._count.questions > 0) {
    throw new ValidationError(
      `该题库仍有 ${bank._count.questions} 道题目，无法删除。请先删除或迁移这些题目后再试。`,
      { questions: "题库非空" },
    );
  }
  await prisma.questionBank.delete({ where: { id } });
  return { ok: true };
}

export interface DashboardStats {
  questions: {
    total: number;
    draft: number;
    inReview: number;
    published: number;
    archived: number;
  };
  users: number;
  banks: number;
  pendingImports: number;
  recentAttempts: number; // attempts in the last 7 days
}

const RECENT_ATTEMPTS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * dashboardStats — the counts backing the admin dashboard cards. Question counts are grouped by
 * status in a single groupBy; the rest are cheap indexed counts. recentAttempts is the last-7-days
 * attempt volume (uses the Attempt(userId, createdAt) index face).
 */
export async function dashboardStats(): Promise<DashboardStats> {
  const since = new Date(Date.now() - RECENT_ATTEMPTS_WINDOW_MS);

  const [byStatus, users, banks, pendingImports, recentAttempts] = await Promise.all([
    prisma.question.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.count(),
    prisma.questionBank.count(),
    prisma.importBatch.count({ where: { status: "pending" } }),
    prisma.attempt.count({ where: { createdAt: { gte: since } } }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of byStatus) counts[g.status] = g._count._all;

  const questions = {
    draft: counts.draft ?? 0,
    inReview: counts.in_review ?? 0,
    published: counts.published ?? 0,
    archived: counts.archived ?? 0,
    total:
      (counts.draft ?? 0) +
      (counts.in_review ?? 0) +
      (counts.published ?? 0) +
      (counts.archived ?? 0),
  };

  return { questions, users, banks, pendingImports, recentAttempts };
}

// Re-export Prisma type so callers needn't import from two places.
export type { Prisma };

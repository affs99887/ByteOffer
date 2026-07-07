// lib/validation/admin.ts
// Zod schemas for admin Server Actions (architecture §4.2). The QuestionRecord itself is a
// permissive object here — validateEnvelope in questionService/importService is the DEEP
// authority (§5.4), so these schemas only whitelist the envelope fields and let the record
// through as an opaque object. Mass-assignment guard: status is a closed enum; the record's
// gradingClass/mirror columns are never accepted from the client (recomputed server-side).

import { z } from "zod";
import { questionTypeEnum } from "@/lib/validation/qbank";

export const questionStatusEnum = z.enum(["draft", "in_review", "published", "archived"]);
export const mergeModeEnum = z.enum(["merge", "replace"]);

/** A permissive record: a plain object, validated deeply by validateEnvelope in the service. */
const recordObject = z.record(z.string(), z.unknown());

export const createQuestionSchema = z.object({
  bankId: z.string().min(1),
  record: recordObject,
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = z.object({
  id: z.string().min(1),
  record: recordObject,
});
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const deleteQuestionSchema = z.object({
  id: z.string().min(1),
});

export const setQuestionStatusSchema = z.object({
  id: z.string().min(1),
  status: questionStatusEnum,
});

/** Load a single question's full record (payload) for the admin JSON editor. */
export const getQuestionRecordSchema = z.object({
  id: z.string().min(1),
});

/** Import prepare: raw JSON envelope (opaque — validateEnvelope owns the deep check). */
export const prepareImportSchema = z.object({
  bankId: z.string().min(1),
  envelope: z.unknown(),
  mergeMode: mergeModeEnum.default("merge"),
});
export type PrepareImportInput = z.infer<typeof prepareImportSchema>;

export const confirmImportSchema = z.object({
  batchId: z.string().min(1),
});

export const listReviewQueueSchema = z.object({
  bankId: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  take: z.number().int().positive().max(100).optional(),
});

export const bulkPublishSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

// ---- Bank management ----

/**
 * A bank slug is the STABLE ASCII key (QuestionBank.slug @unique) — it appears in export filenames
 * and is the human-facing library handle, so we lock it to a kebab/alnum shape and never let it be
 * edited after creation (see updateBankSchema, which omits slug). Title is the display name.
 */
export const bankSlugSchema = z
  .string()
  .trim()
  .min(1, "slug 不能为空")
  .max(64, "slug 过长（≤64）")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能是小写字母、数字与连字符（例如 frontend-core）");

export const createBankSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(120, "标题过长（≤120）"),
  slug: bankSlugSchema,
  description: z.string().trim().max(2000).optional(),
  isPremium: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).max(100000).optional().default(0),
});
export type CreateBankInput = z.infer<typeof createBankSchema>;

/**
 * Edit is intentionally slug-LESS: title/description/sortOrder/isPremium only. Every field is
 * optional so a patch can touch just one; description accepts null to explicitly clear it. Slug is
 * immutable (changing the library key would orphan export references / import round-trips).
 */
export const updateBankSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "标题不能为空").max(120, "标题过长（≤120）").optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  isPremium: z.boolean().optional(),
});
export type UpdateBankInput = z.infer<typeof updateBankSchema>;

export const deleteBankSchema = z.object({
  id: z.string().min(1),
});

// ---- Users (Phase 4) ----

/** Role is a closed enum — the client may only pick user|admin (mass-assignment guard, §3.3). */
export const roleEnum = z.enum(["user", "admin"]);

export const listUsersSchema = z.object({
  cursor: z.string().min(1).optional(),
  take: z.number().int().positive().max(100).optional(),
  /** Case-insensitive email substring filter for the admin user search box. */
  search: z.string().trim().max(200).optional(),
});

/** setUserRole: the client is trusted ONLY for the target userId + the desired role. */
export const setUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: roleEnum,
});
export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>;

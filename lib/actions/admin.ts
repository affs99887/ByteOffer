"use server";

// lib/actions/admin.ts
// Thin admin Server Actions (architecture §4.2). Each is defineAction(schema, requireAdmin,
// handler): the guard is the authoritative security boundary, the schema whitelists input, and
// the handler delegates to a service (actions never import prisma directly). The record's deep
// validation lives in the service via validateEnvelope (§5.4).

import { defineAction } from "@/lib/server/action";
import { requireAdmin } from "@/lib/server/guards";
import { assertRateLimit } from "@/lib/server/ratelimit";
import * as questionService from "@/lib/server/services/questionService";
import * as importService from "@/lib/server/services/importService";
import * as adminService from "@/lib/server/services/adminService";
import type { ListResult } from "@/lib/server/services/questionService";
import type { ListUsersResult } from "@/lib/server/services/adminService";
import type { ImportReport } from "@/lib/qbank/validate";
import type { Role } from "@prisma/client";
import {
  bulkPublishSchema,
  confirmImportSchema,
  createQuestionSchema,
  deleteQuestionSchema,
  getQuestionRecordSchema,
  listReviewQueueSchema,
  listUsersSchema,
  prepareImportSchema,
  setQuestionStatusSchema,
  setUserRoleSchema,
  updateQuestionSchema,
} from "@/lib/validation/admin";

// ---- Question CRUD ----

export const createQuestionAction = defineAction(
  createQuestionSchema,
  requireAdmin,
  async (input, admin): Promise<{ id: string }> =>
    questionService.create(input.record, input.bankId, admin.id),
);

export const updateQuestionAction = defineAction(
  updateQuestionSchema,
  requireAdmin,
  async (input): Promise<{ ok: true }> => questionService.update(input.id, input.record),
);

export const deleteQuestionAction = defineAction(
  deleteQuestionSchema,
  requireAdmin,
  async (input): Promise<{ ok: true }> => questionService.remove(input.id),
);

export const setQuestionStatusAction = defineAction(
  setQuestionStatusSchema,
  requireAdmin,
  async (input): Promise<{ ok: true }> => questionService.setStatus(input.id, input.status),
);

/**
 * getQuestionRecordAction — load a single question's authoritative record (payload) for the admin
 * JSON editor. Admin-only; the payload IS the QuestionRecord (§2.1). Returns it as an opaque JSON
 * value (the client editor stringifies it into the textarea; edits go back through updateQuestion).
 */
export const getQuestionRecordAction = defineAction(
  getQuestionRecordSchema,
  requireAdmin,
  async (input): Promise<{ record: unknown }> => {
    const row = await questionService.getRowForAdmin(input.id);
    return { record: row.payload };
  },
);

// ---- Import (two-phase) ----

export const adminPrepareImportAction = defineAction(
  prepareImportSchema,
  requireAdmin,
  async (input, admin): Promise<{ report: ImportReport; batchId: string }> =>
    importService.prepare(input.envelope, admin.id, input.bankId, input.mergeMode),
);

export const adminConfirmImportAction = defineAction(
  confirmImportSchema,
  requireAdmin,
  async (input, admin): Promise<{ applied: number; rejected: number; warned: number }> => {
    // Low cap (§10): importing writes many rows in a tx; throttle to blunt accidental/abusive floods.
    await assertRateLimit("admin:import-confirm", admin.id, { limit: 10, windowSec: 60 });
    return importService.confirm(input.batchId, admin.id);
  },
);

// ---- Review queue / publish ----

export const listReviewQueueAction = defineAction(
  listReviewQueueSchema,
  requireAdmin,
  async (input): Promise<ListResult> =>
    questionService.list({
      bankId: input.bankId,
      status: "in_review",
      cursor: input.cursor,
      take: input.take,
    }),
);

export const bulkPublishAction = defineAction(
  bulkPublishSchema,
  requireAdmin,
  async (input): Promise<{ published: number }> => questionService.bulkPublish(input.ids),
);

// ---- Users (Phase 4) ----

export const listUsersAction = defineAction(
  listUsersSchema,
  requireAdmin,
  async (input): Promise<ListUsersResult> =>
    adminService.listUsers({ cursor: input.cursor, take: input.take }),
);

export const setUserRoleAction = defineAction(
  setUserRoleSchema,
  requireAdmin,
  // The acting admin id (ctx.id) is passed for the last-admin/self-demote reasoning; the client is
  // trusted only for userId + role. The service enforces the LAST_ADMIN guard (§3.3).
  async (input, admin): Promise<{ ok: true; role: Role }> =>
    adminService.setUserRole(admin.id, input.userId, input.role),
);

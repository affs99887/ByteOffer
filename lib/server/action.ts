// lib/server/action.ts
// defineAction — the Server Action wrapper (architecture.md §4.1). Fixed pipeline:
//   guard() → schema.parse(input) → handler(parsed, ctx)
// mapping typed AppErrors and zod errors to a safe { ok:false, error:{ code, fields? } }.
// Keep generic + type-safe: the handler sees fully-typed parsed input and the guard's ctx.

import { z } from "zod";
import { AppError, ValidationError, isAppError } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";

export interface ActionError {
  code: string;
  message?: string;
  fields?: Record<string, string>;
}
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

/** A guard produces the context (e.g. requireUser → SessionUser) or throws an AppError. */
export type Guard<Ctx> = () => Promise<Ctx>;

/** Guard that supplies no context (public actions). */
export const noGuard: Guard<undefined> = async () => undefined;

/** Flatten a ZodError into a { field: message } map for form display. */
function zodFields(err: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

/**
 * defineAction(schema, guard, handler) → (input) => Promise<ActionResult<T>>.
 * - `schema` validates the raw input (unknown) into `In`.
 * - `guard` runs first and yields `Ctx` (throw to reject before parsing).
 * - `handler(parsed, ctx)` contains the domain logic and returns `T`.
 */
export function defineAction<In, Ctx, T>(
  schema: z.ZodType<In>,
  guard: Guard<Ctx>,
  handler: (input: In, ctx: Ctx) => Promise<T>,
): (input: unknown) => Promise<ActionResult<T>> {
  return async (input: unknown): Promise<ActionResult<T>> => {
    try {
      const ctx = await guard();

      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: "VALIDATION", message: "输入有误", fields: zodFields(parsed.error) },
        };
      }

      const data = await handler(parsed.data, ctx);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: mapError(err) };
    }
  };
}

/** Map any thrown value to a safe ActionError; unknown errors become an opaque 500-style code. */
export function mapError(err: unknown): ActionError {
  if (err instanceof z.ZodError) {
    return { code: "VALIDATION", message: "输入有误", fields: zodFields(err) };
  }
  if (isAppError(err)) {
    const e = err as AppError;
    return { code: e.code, message: e.message, fields: e.fields };
  }
  if (err instanceof ValidationError) {
    return { code: err.code, message: err.message, fields: err.fields };
  }
  // Never leak internal error details (Prisma/SQL/stack). Log server-side only.
  logger.error("unhandled_action_error", {
    message: err instanceof Error ? err.message : String(err),
  });
  return { code: "INTERNAL", message: "服务器错误，请稍后再试" };
}

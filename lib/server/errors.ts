// lib/server/errors.ts
// Typed domain errors (architecture.md §10). Each carries a stable machine `code` that the
// action/handler boundary maps to the safe `{ ok:false, error:{ code, fields? } }` shape —
// stack traces / Prisma internals are never leaked to the client.

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "PAYMENT_REQUIRED"
  | "RATE_LIMITED";

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  /** Optional per-field messages (e.g. from zod) surfaced to forms. */
  readonly fields?: Record<string, string>;

  constructor(message?: string, fields?: Record<string, string>) {
    super(message);
    this.name = new.target.name;
    this.fields = fields;
    // Preserve prototype chain across TS/ES target down-leveling.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthError extends AppError {
  readonly code = "UNAUTHENTICATED" as const;
  constructor(message = "登录已失效，请重新登录") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN" as const;
  constructor(message = "无权访问") {
    super(message);
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION" as const;
  constructor(message = "输入有误", fields?: Record<string, string>) {
    super(message, fields);
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND" as const;
  constructor(message = "资源不存在") {
    super(message);
  }
}

export class PaymentRequiredError extends AppError {
  readonly code = "PAYMENT_REQUIRED" as const;
  constructor(message = "该功能需要升级会员") {
    super(message);
  }
}

export class RateLimitError extends AppError {
  readonly code = "RATE_LIMITED" as const;
  constructor(message = "操作过于频繁，请稍后再试") {
    super(message);
  }
}

/** Type guard for the AppError family. */
export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

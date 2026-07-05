// lib/server/logger.ts
// Minimal dependency-free structured logger (architecture.md §10 observability). Emits one
// JSON line per event to console so log aggregators can parse it. No PII policy enforced
// here — callers must not pass secrets in `meta`.

type Meta = Record<string, unknown>;
type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, meta?: Meta): void {
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...(meta ?? {}),
  });
  // Route to the matching console method so stderr/stdout separation is preserved.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, meta?: Meta) => emit("info", msg, meta),
  warn: (msg: string, meta?: Meta) => emit("warn", msg, meta),
  error: (msg: string, meta?: Meta) => emit("error", msg, meta),
};

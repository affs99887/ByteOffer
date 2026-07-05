// lib/server/db.ts
// Prisma client singleton (architecture.md §1 DATA ACCESS). Cached on globalThis in dev so
// Next's HMR does not exhaust the connection pool by re-instantiating on every reload.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

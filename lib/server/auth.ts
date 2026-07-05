// lib/server/auth.ts
// FULL Auth.js v5 (Node runtime): edge config + PrismaAdapter + Credentials(argon2id).
// This is the Node-only half of the edge/node split — it imports prisma and @node-rs/argon2,
// so it must NEVER be pulled into middleware.ts / auth.config.ts (architecture.md §3.1).

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { verify } from "@node-rs/argon2";
import authConfig from "@/auth.config";
import { prisma } from "@/lib/server/db";
import { credentialsSchema } from "@/lib/validation/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const u = await prisma.user.findUnique({ where: { email } });
        if (!u?.passwordHash) return null; // OAuth-only account or unknown email
        if (!u.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");
        if (!(await verify(u.passwordHash, password))) return null;

        return { id: u.id, email: u.email, name: u.name, role: u.role };
      },
    }),
  ],
});

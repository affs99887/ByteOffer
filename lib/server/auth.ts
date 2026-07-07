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
import { isEmailEnabled } from "@/lib/server/email";
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
        // Enforce email verification ONLY when email delivery is configured. When it is not,
        // registration never issues a verification link (accounts are born verified), and any
        // legacy emailVerified=null user created while Resend was configured-then-removed must not
        // be permanently locked out — so we allow the unverified credential login in that posture.
        if (!u.emailVerified && isEmailEnabled()) throw new Error("EMAIL_NOT_VERIFIED");
        if (!(await verify(u.passwordHash, password))) return null;

        return { id: u.id, email: u.email, name: u.name, role: u.role };
      },
    }),
  ],
});

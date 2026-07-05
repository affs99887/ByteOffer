// auth.config.ts (repo root)
// EDGE-SAFE Auth.js v5 config — the edge/node split point (architecture.md §3.1).
// CRITICAL: this file is imported by middleware.ts (edge runtime). It MUST NOT import
// prisma, @node-rs/argon2, the PrismaAdapter, or any Node-only module. The Credentials
// provider + adapter live in lib/server/auth.ts (Node runtime) only.

import type { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { env } from "@/lib/server/env";

const providers: Provider[] = [];

if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  );
}

if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  );
}

export default {
  providers,
  secret: env.AUTH_SECRET,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: "user" | "admin" }).role ?? "user";
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role ?? "user";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

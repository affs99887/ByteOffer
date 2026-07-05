// types/next-auth.d.ts
// Module augmentation for Auth.js v5 (architecture.md §3.1). Adds `id` + `role` to the
// session user and `role` to the JWT so callbacks and guards are type-safe. Picked up via
// tsconfig `include: ["**/*.ts"]`.

import type { DefaultSession } from "next-auth";

type Role = "user" | "admin";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  // The object returned by the Credentials `authorize` and stored on OAuth users.
  interface User {
    role?: Role;
  }
}

// next-auth/jwt re-exports @auth/core/jwt via `export *`, so the canonical JWT interface
// lives in @auth/core/jwt — augment there so the merge actually applies inside callbacks.
declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: Role;
  }
}

export {};

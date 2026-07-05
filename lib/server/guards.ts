// lib/server/guards.ts
// Authoritative auth guards (architecture.md §3.2 layer 2). middleware is a UX shortcut;
// requireUser/requireAdmin are the real security boundary — called at the top of every
// service entry before any logic runs.

import { auth } from "@/lib/server/auth";
import { AuthError, ForbiddenError } from "@/lib/server/errors";

export interface SessionUser {
  id: string;
  role: "user" | "admin";
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

/** Require an authenticated session; throws AuthError otherwise. Returns the session user. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new AuthError();
  return session.user as SessionUser;
}

/** Require an admin session; throws AuthError if anonymous, ForbiddenError if non-admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError();
  return user;
}

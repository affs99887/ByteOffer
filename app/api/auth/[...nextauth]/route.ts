// app/api/auth/[...nextauth]/route.ts
// Auth.js route handler (architecture.md §4.2). Runs on the Node runtime (default) since it
// pulls in the full auth stack (adapter + Credentials + argon2).

import { handlers } from "@/lib/server/auth";

export const { GET, POST } = handlers;

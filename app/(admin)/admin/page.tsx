// app/(admin)/admin/page.tsx
// Bare /admin → the dashboard. The layout already runs requireAdmin (404 for non-admins); this
// index just redirects to the default section. Dynamic so it is never prerendered at build time.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}

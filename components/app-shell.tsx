"use client";

// components/app-shell.tsx (3b-2)
// The authenticated client shell, extracted verbatim from the old app/page.tsx. It renders the
// AppProvider + Sidebar + MainArea + MobileDrawer tree and now accepts two optional props:
//   - initialData: RSC-fetched real data (user/entitlement/bank/progress) injected by app/page.tsx
//   - actions:     the Server Actions bundle the client calls (submit/favorite/exam/…)
// When BOTH are omitted (the /demo route) the provider falls back to the 3b-1 standalone behavior:
// the built-in sample envelope + local grading. No DB required for /demo (architecture §8.1).

import { AppProvider, type AppActionsBundle, type InitialData } from "@/lib/app-context";
import { Sidebar } from "@/components/sidebar";
import { MainArea } from "@/components/main-area";
import { MobileDrawer } from "@/components/mobile-drawer";

export interface AppShellProps {
  initialData?: InitialData;
  actions?: AppActionsBundle;
}

export function AppShell({ initialData, actions }: AppShellProps) {
  return (
    <AppProvider initialData={initialData} actions={actions}>
      <Sidebar />
      <MainArea />
      <MobileDrawer />
    </AppProvider>
  );
}

export default AppShell;

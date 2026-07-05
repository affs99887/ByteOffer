// app/demo/page.tsx (3b-2)
// The PUBLIC standalone demo — renders <AppShell/> with NO props. With no initialData.bank and no
// actions, AppProvider falls back to the 3b-1 behavior: the built-in 13-type sample envelope +
// local grading + synthesized progress. This route requires NO database and stays smoke-testable
// (hard constraint / VERIFY step). It is fully static.

import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "ByteOffer · 演示",
};

export default function DemoPage() {
  return <AppShell />;
}

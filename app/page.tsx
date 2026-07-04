"use client";

import { AppProvider } from "@/lib/app-context";
import { Sidebar } from "@/components/sidebar";
import { MainArea } from "@/components/main-area";
import { MobileDrawer } from "@/components/mobile-drawer";

export default function Page() {
  return (
    <AppProvider>
      <Sidebar />
      <MainArea />
      <MobileDrawer />
    </AppProvider>
  );
}

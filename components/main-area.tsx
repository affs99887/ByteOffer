"use client";

import { useApp } from "@/lib/app-context";
import { AppHeader, TopNav } from "./headers";
import { HomeScreen } from "./screens/home";
import { WrongbookScreen } from "./screens/wrongbook";
import { StatsScreen } from "./screens/stats";
import { SettingsScreen } from "./screens/settings";
import { QbankScreen } from "./screens/qbank";
// V2: the unified answering screen (刷题 practice + 模拟面试 exam both run here). Created by a sibling
// agent this stage under components/screens/session — the import resolves at the barrier.
import { SessionScreen } from "./screens/session";

export function MainArea() {
  const v = useApp();
  return (
    <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
      {v.layoutSidebar && <AppHeader />}
      {v.layoutTop && <TopNav />}
      <div
        className="bo-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          backgroundColor: "var(--canvas)",
          backgroundImage:
            "linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px)",
          backgroundSize: "30px 30px",
          padding: "26px 28px 48px",
        }}
      >
        {v.isHome && <HomeScreen />}
        {v.isWrong && <WrongbookScreen />}
        {v.isStats && <StatsScreen />}
        {v.isQbank && <QbankScreen />}
        {/* V2 unified session — launched from the 题库 hub / 错题本 / 收藏夹 (or resumed exam). */}
        {v.isSession && <SessionScreen />}
        {v.isSettings && <SettingsScreen />}
      </div>
    </main>
  );
}

"use client";

import { useApp } from "@/lib/app-context";
import { AppHeader, TopNav } from "./headers";
import { HomeScreen } from "./screens/home";
import { PracticeScreen } from "./screens/practice";
import { ExamScreen } from "./screens/exam";
import { WrongbookScreen } from "./screens/wrongbook";
import { StatsScreen } from "./screens/stats";
import { SettingsScreen } from "./screens/settings";

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
        {v.isPractice && <PracticeScreen />}
        {v.isExam && <ExamScreen />}
        {v.isWrong && <WrongbookScreen />}
        {v.isStats && <StatsScreen />}
        {v.isSettings && <SettingsScreen />}
      </div>
    </main>
  );
}

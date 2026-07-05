// app/(auth)/layout.tsx (3b-2)
// Shared chrome for the auth route group (login/register/reset/verify). A centered card floating on
// var(--canvas), reusing the app's inline-style + CSS-variable look (computeThemeVars — a pure
// function, safe in a server component). The default light theme + brand primary is applied to the
// wrapper so the auth pages match the app without pulling in the full AppProvider.

import type { CSSProperties, ReactNode } from "react";
import { computeThemeVars, PRIMARY_PRESETS } from "@/lib/theme";

const themeVars = computeThemeVars(PRIMARY_PRESETS[0], "light", "light");

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="bo-th"
      style={{
        ...(themeVars as unknown as CSSProperties),
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        color: "var(--ink)",
        fontSize: "14px",
        backgroundColor: "var(--canvas)",
        backgroundImage:
          "linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px)",
        backgroundSize: "30px 30px",
        fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif",
      }}
    >
      {children}
    </div>
  );
}

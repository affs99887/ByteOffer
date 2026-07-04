// Port of the design's applyTheme(): computes the full CSS-variable map for the
// root .bo-th element from the current primary color + sidebar theme + app theme.

export type ThemeMode = "dark" | "light";

export function rgba(hex: string, a: number): string {
  hex = hex || "#2D5BFF";
  let m = String(hex).replace("#", "");
  if (m.length === 3)
    m = m
      .split("")
      .map((c) => c + c)
      .join("");
  const r = parseInt(m.slice(0, 2), 16),
    g = parseInt(m.slice(2, 4), 16),
    b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export type CssVars = Record<string, string>;

export function computeThemeVars(
  primary: string[],
  sbTheme: ThemeMode,
  appTheme: ThemeMode,
): CssVars {
  const p = primary;
  const v: CssVars = {
    "--pri": p[0],
    "--pri-a": p[1] || p[0],
    "--pri-h": p[2] || p[0],
    "--pri-w": p[3] || "#EAEEFF",
    "--paper": "#F1F2F5",
  };

  if (sbTheme === "light") {
    Object.assign(v, {
      "--rail-bg": "#FFFFFF",
      "--rail-fg": "#5A6172",
      "--rail-strong": "#14171F",
      "--rail-active-fg": "var(--pri)",
      "--rail-hover": "#F4F5F8",
      "--rail-active-bg": "var(--pri-w)",
      "--rail-border": "#EAECEF",
      "--rail-muted": "#AAB1BE",
      "--rail-kbd-fg": "#98A2B2",
      "--rail-kbd-bd": "#E6E8EC",
      "--rail-sub": "#98A2B2",
      "--rail-wbg": "#F7F8FA",
      "--rail-wbd": "#EDEFF3",
    });
  } else {
    Object.assign(v, {
      "--rail-bg": "#14161C",
      "--rail-fg": "#9298A6",
      "--rail-strong": "#FFFFFF",
      "--rail-active-fg": "#FFFFFF",
      "--rail-hover": "rgba(255,255,255,.05)",
      "--rail-active-bg": "rgba(45,91,255,.16)",
      "--rail-border": "rgba(255,255,255,.07)",
      "--rail-muted": "#4C525F",
      "--rail-kbd-fg": "#565D6B",
      "--rail-kbd-bd": "rgba(255,255,255,.09)",
      "--rail-sub": "#5B6270",
      "--rail-wbg": "rgba(255,255,255,.035)",
      "--rail-wbd": "rgba(255,255,255,.09)",
    });
  }

  if (appTheme === "dark") {
    Object.assign(v, {
      "--canvas": "#0C0E13",
      "--surface": "#161A23",
      "--surface-2": "#1E232E",
      "--surface-3": "#1A1E28",
      "--divider": "#242A36",
      "--track": "#272D3A",
      "--chip": "#222836",
      "--grid": "rgba(255,255,255,.03)",
      "--avatar": "#2A303E",
      "--line": "#262C3A",
      "--ink": "#ECEEF3",
      "--ink2": "#A6AEBE",
      "--ink3": "#6C7484",
    });
    v["--pri-w"] = rgba(p[0], 0.18);
    v["--pri-w2"] = rgba(p[0], 0.44);
  } else {
    Object.assign(v, {
      "--canvas": "#F1F2F5",
      "--surface": "#FFFFFF",
      "--surface-2": "#F7F8FA",
      "--surface-3": "#FAFBFC",
      "--divider": "#F1F2F5",
      "--track": "#EEF0F3",
      "--chip": "#F4F5F8",
      "--grid": "rgba(20,26,45,.032)",
      "--avatar": "#14161C",
      "--line": "#E6E8EC",
      "--ink": "#14171F",
      "--ink2": "#565E70",
      "--ink3": "#8A92A2",
    });
    v["--pri-w"] = p[3] || "#EAEEFF";
    v["--pri-w2"] = rgba(p[0], 0.22);
  }

  return v;
}

/** The 4 primary-color presets offered in Settings (pri, pri-active, pri-hover, pri-wash). */
export const PRIMARY_PRESETS: string[][] = [
  ["#2D5BFF", "#1E45E0", "#4E74FF", "#EAEEFF"],
  ["#4F46E5", "#3730B3", "#6D66EC", "#ECEBFE"],
  ["#0EA968", "#0A7D4E", "#2FC486", "#E6F6EE"],
  ["#EA580C", "#C2410C", "#F97316", "#FDECE1"],
];

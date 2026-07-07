import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// FONTS — self-hosted at BUILD time (architecture §11, landing surface). `next/font` downloads +
// subsets the woff2 into our own bundle, so the brand faces load from OUR origin — no
// fonts.googleapis.com / fonts.gstatic.com round-trip, which is frequently blocked or painfully slow
// in mainland China (our primary market). They are exposed as CSS variables so any page/component can
// reference `var(--font-space-grotesk)` / `var(--font-jetbrains-mono)`.
//
// Chinese glyphs deliberately come from the SYSTEM CJK stack (PingFang SC / Microsoft YaHei / Source
// Han Sans …) rather than a self-hosted Noto Sans SC: a full simplified-Chinese webfont is several MB
// and would dominate first paint, whereas modern OS CJK fonts are excellent, instant, and equally
// reachable in China. Latin display + mono are the brand-critical faces, so those are worth hosting.
// Both are variable fonts, so `weight` is omitted (the full range is loaded).
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
  fallback: ["PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans SC", "system-ui", "sans-serif"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

/**
 * metadataBase powers absolute Open Graph / canonical URLs. Derive it from AUTH_URL (the canonical app
 * origin — see lib/server/env.ts) with a SAFE fallback: we read process.env directly and parse
 * defensively so a missing or oddly-shaped value at `next build` time falls back rather than throwing
 * (the build runs with a placeholder env and must never crash on metadata).
 */
function resolveMetadataBase(): URL {
  const raw = process.env.AUTH_URL?.trim();
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      /* malformed AUTH_URL → fall through to the neutral default. */
    }
  }
  return new URL("https://byteoffer.example.com");
}

const SITE_NAME = "ByteOffer";
const SITE_DESC =
  "ByteOffer — 面向前端工程师的面试刷题系统：12 种题型、客观题自动判分、主观题参考答案 + 自评、模拟面试、错题本、收藏夹与数据统计。注册即用，全部功能免费开放。";

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  // `%s · ByteOffer` — a page that sets `title: "定价"` renders as "定价 · ByteOffer". The landing page
  // opts out with `title.absolute` since it is the brand root.
  title: {
    default: "ByteOffer · 前端面试刷题系统",
    template: "%s · ByteOffer",
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "ByteOffer · 前端面试刷题系统",
    description: SITE_DESC,
    locale: "zh_CN",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "ByteOffer · 前端面试刷题系统",
    description: SITE_DESC,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body>
        {/* Make the self-hosted Space Grotesk (+ system CJK) the default body font. `html body` (0,0,2)
            beats the `html,body` rule in globals.css (0,0,1) regardless of stylesheet order, so the
            whole app inherits the brand sans without touching globals.css. Elements that set their own
            font-family (the authed screens still use literal 'Space Grotesk' names) fall back to the
            system stack until they migrate to the var(--font-*) tokens. */}
        <style>{`html body{font-family:var(--font-space-grotesk),"PingFang SC","Microsoft YaHei","Source Han Sans SC","Noto Sans SC",system-ui,sans-serif}`}</style>
        {children}
      </body>
    </html>
  );
}

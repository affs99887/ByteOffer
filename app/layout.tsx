import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ByteOffer · 前端面试刷题系统",
  description:
    "ByteOffer — 面向前端工程师的面试刷题系统：刷题练习、模拟面试、错题本、收藏夹、数据统计与学习设置。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

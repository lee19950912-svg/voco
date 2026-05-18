import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Extra candidates for the /fonts demo page. Loaded once here so they're
// available everywhere, but only the /fonts page actually opts each into
// the rendered text — no runtime cost on the main page beyond a small
// header-parse pass.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "VoCo — 说出来，写下去。",
  description:
    "Windows 上为中文母语者重新设计的语音输入。按住右 Alt 说话，松开后文字直接出现在光标位置。任意软件都能用。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${notoSansSC.variable} h-full antialiased`}
    >
      <head>
        {/* Satoshi (Indian Type Foundry, free for commercial use via
            Fontshare). Carries the brand mark + display headings; CJK
            falls back to Noto Sans SC. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap"
        />
        {/* HarmonyOS Sans SC + AlibabaPuHuiTi 3 — only used by the /fonts
            demo page. cn-fontsource on jsdelivr ships them split by
            unicode-range, so only the glyphs we use download. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/cn-fontsource-harmony-os-sans-sc-regular/font.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/cn-fontsource-alibaba-pu-hui-ti-3-65-medium/font.css"
        />
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}

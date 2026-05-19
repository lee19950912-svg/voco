// Two-row brand-logo marquee. Logos pulled from Google's public favicon
// service (`s2/favicons?domain=…&sz=128`) for full-color brand marks. A
// couple of Microsoft Office products share office.com's favicon, so for
// Word + Excel we fall back to simple-icons single-color marks tinted with
// the brand color. Hover any tile → both rows pause and the name shows.
type App = {
  name: string;
  // Provide either `domain` (preferred — full color favicon) or
  // `slug`+`color` (single-color simple-icons fallback).
  domain?: string;
  slug?: string;
  color?: string;
};

const FAVICON = (d: string) =>
  `https://www.google.com/s2/favicons?domain=${d}&sz=128`;

// Row 1 — chat & messaging (13 icons)
const row1: App[] = [
  { name: "微信", domain: "wechat.com" },
  { name: "Telegram", domain: "telegram.org" },
  { name: "Discord", domain: "discord.com" },
  // Google favicons returns Kakao's corp logo (small "k") instead of
  // KakaoTalk's yellow speech-bubble — fall back to simple-icons.
  { name: "KakaoTalk", slug: "kakaotalk", color: "FFCD00" },
  // Favicon comes back low-res / blurry — simple-icons SVG is crisp at any size.
  { name: "WhatsApp", slug: "whatsapp", color: "25D366" },
  { name: "LINE", domain: "line.me" },
  { name: "Messenger", domain: "messenger.com" },
  // Gmail / iMessage favicons resolve to parent brand (Google G / Apple
  // logo), not the product mark. Use simple-icons instead.
  { name: "Gmail", slug: "gmail", color: "EA4335" },
  { name: "iMessage", slug: "imessage", color: "0B93F6" },
  { name: "Slack", domain: "slack.com" },
  { name: "X", slug: "x", color: "000000" },
  { name: "Reddit", domain: "reddit.com" },
  { name: "Threads", domain: "threads.net" },
];

// Row 2 — docs / dev / AI surfaces (13 icons)
const row2: App[] = [
  // Word + Excel share office.com favicon → keep them on simple-icons so
  // each renders with its own brand color and the row visually differentiates.
  { name: "Word", slug: "microsoftword", color: "2B579A" },
  { name: "Excel", slug: "microsoftexcel", color: "217346" },
  { name: "Outlook", domain: "outlook.com" },
  // docs.google.com favicon also resolves to the generic Google G —
  // use simple-icons blue doc mark instead.
  { name: "Google Docs", slug: "googledocs", color: "4285F4" },
  { name: "Notion", domain: "notion.so" },
  { name: "Cursor", domain: "cursor.com" },
  { name: "VS Code", domain: "code.visualstudio.com" },
  // Favicons for GitHub / OpenAI come with significant padding around the
  // mark, so they render visually smaller than other tiles. simple-icons
  // SVG paths fill the viewBox edge-to-edge → equal visual weight.
  { name: "GitHub", slug: "github", color: "181717" },
  { name: "OpenAI", slug: "openai", color: "412991" },
  { name: "Claude", domain: "claude.ai" },
  { name: "Figma", domain: "figma.com" },
  { name: "Obsidian", domain: "obsidian.md" },
  { name: "Linear", domain: "linear.app" },
];

function logoSrc(app: App): string {
  if (app.domain) return FAVICON(app.domain);
  return `https://api.iconify.design/simple-icons:${app.slug}.svg?color=%23${app.color}`;
}

export default function AppsAnywhere() {
  // Duplicate each row so the -50% / 0% keyframe loops seamlessly.
  const s1 = [...row1, ...row1];
  const s2 = [...row2, ...row2];

  return (
    <section className="border-b border-hairline bg-canvas">
      <div className="mx-auto max-w-[1200px] px-6 pt-24 sm:pt-28">
        <div className="text-center max-w-[820px] mx-auto">
          <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            能打字的地方<br />
            都能用 VoCo
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[640px] mx-auto">
            不用切软件，不用换输入法。按住快捷键，说完直接出现在光标位置。
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {["全局快捷键", "光标处输入", "聊天 · 邮件 · 文档 · 代码 都能用"].map(
              (tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center h-7 px-3 rounded-full border border-[#E5E7EB] bg-[#FAFBFC] text-[12px] text-body font-mono tracking-wider"
                >
                  {tag}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Two-row marquee. Wrapper has marquee-pause-on-hover so hovering any
          tile pauses both rows; mask-fade-x softens the left/right edges. */}
      <div className="relative pt-14 pb-20 overflow-hidden mask-fade-x marquee-pause-on-hover">
        <div className="flex flex-col gap-6">
          {/* Each tile carries its own `mr-5` (no flex gap) so the second
              duplicate aligns flush with the first — flex gap would leave a
              20px hole between copies and break the loop. */}
          <div className="marquee-track flex">
            {s1.map((app, i) => (
              <LogoTile key={`r1-${app.name}-${i}`} app={app} />
            ))}
          </div>
          {/* Row 2 runs 1.4× faster than row 1 so the two streams visibly
              offset over time — a "speed gradient" trick used by Vercel /
              Linear marketing pages to make a logo wall feel less mechanical. */}
          <div
            className="marquee-track-rev flex"
            style={{ animationDuration: "28s" }}
          >
            {s2.map((app, i) => (
              <LogoTile key={`r2-${app.name}-${i}`} app={app} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LogoTile({ app }: { app: App }) {
  const src = logoSrc(app);
  return (
    <span
      className="group/tile shrink-0 mr-8 relative grid place-items-center w-[64px] h-[64px] opacity-[0.92] hover:opacity-100 hover:-translate-y-1 transition-all duration-200"
    >
      {/* Larger inner box than the tile size lets oddly-padded favicons
          (some are 90% glyph, some are 60%) all render at a visually
          similar weight via object-contain inside a fixed square. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={app.name}
        width={56}
        height={56}
        loading="lazy"
        className="w-[56px] h-[56px] object-contain"
      />
      {/* Hover label — floats below the tile. */}
      <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[11px] font-mono bg-ink text-white whitespace-nowrap opacity-0 group-hover/tile:opacity-100 transition-opacity duration-150">
        {app.name}
      </span>
    </span>
  );
}

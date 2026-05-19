// App strip with verified brand logos. Each slug here returns an accurate
// monochrome SVG on Iconify's simple-icons set; chips we couldn't verify
// (QQ comes out wrong rendered single-color, 钉钉 / 飞书 / 小红书 have
// either no logo asset or aren't the right surface for text input) are
// intentionally dropped.
type App = { name: string; slug: string; color: string };

// Domestic Chinese — places people type text.
const domestic: App[] = [
  { name: "微信", slug: "wechat", color: "07C160" },
  { name: "知乎", slug: "zhihu", color: "0084FF" },
  { name: "微博", slug: "sinaweibo", color: "E6162D" },
  { name: "B 站", slug: "bilibili", color: "00A1D6" },
  { name: "豆瓣", slug: "douban", color: "007722" },
];

// International — chat / docs / mail / IDEs.
const intl: App[] = [
  { name: "Slack", slug: "slack", color: "4A154B" },
  { name: "Discord", slug: "discord", color: "5865F2" },
  { name: "Telegram", slug: "telegram", color: "26A5E4" },
  { name: "Notion", slug: "notion", color: "000000" },
  { name: "Word", slug: "microsoftword", color: "2B579A" },
  { name: "Outlook", slug: "microsoftoutlook", color: "0078D4" },
  { name: "Gmail", slug: "gmail", color: "EA4335" },
  { name: "VS Code", slug: "visualstudiocode", color: "007ACC" },
  { name: "Cursor", slug: "cursor", color: "000000" },
];

// Interleave the two streams so the marquee mixes Chinese + international
// chips visually rather than running through them in blocks.
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

export default function AppsAnywhere() {
  const apps = interleave(domestic, intl);
  // Duplicate for the seamless -50% loop.
  const stream = [...apps, ...apps];
  return (
    <section className="border-b border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 pt-24 sm:pt-28 pb-6">
        <div className="max-w-[720px]">
          <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
            Anywhere
          </div>
          <h2 className="mt-4 text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            在你写字的<br />
            任何地方都能用。
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[560px]">
            不挑应用、不需要切输入法。任何接受键盘输入的地方，按一下快捷键就能说话。
          </p>
        </div>
      </div>

      <div className="relative pb-20 overflow-hidden mask-fade-x">
        <div className="marquee-track flex gap-3 px-6">
          {stream.map((app, i) => (
            <AppChip key={`${app.name}-${i}`} app={app} />
          ))}
        </div>
      </div>
    </section>
  );
}

function AppChip({ app }: { app: App }) {
  return (
    <span className="inline-flex items-center gap-2.5 h-11 pl-3 pr-5 rounded-full border border-hairline bg-canvas text-[14px] text-ink whitespace-nowrap card-elev-2">
      <Glyph app={app} />
      {app.name}
    </span>
  );
}

function Glyph({ app }: { app: App }) {
  const src = `https://api.iconify.design/simple-icons:${app.slug}.svg?color=%23${app.color}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={18}
      height={18}
      className="shrink-0"
      loading="lazy"
    />
  );
}

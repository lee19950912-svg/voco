// Privacy feature block — 3 numbered cards with line-icons + a trust
// supplement line below. Icons are inlined Lucide SVG paths (MIT) to
// avoid pulling in lucide-react just for three glyphs.
import Reveal from "./Reveal";

const BRAND = "#2563EB";

const items = [
  {
    icon: "cloud-off" as const,
    title: "零云保留",
    body: "识别完成即结束，不在云端保存录音和文本。",
  },
  {
    icon: "shield-check" as const,
    title: "不用于训练",
    body: "你的语音和文字不会被拿去训练模型。",
  },
  {
    icon: "hard-drive" as const,
    title: "历史只在本机",
    body: "词库、记录、配置都保存在你的电脑里，可一键删除。",
  },
];

type IconName = (typeof items)[number]["icon"];

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "cloud-off") {
    return (
      <svg {...common}>
        <path d="M22 17.5a4.5 4.5 0 0 0-1.96-3.73C20.66 12.34 21 10.69 21 9c0-3.87-3.13-7-7-7-2.86 0-5.27 1.71-6.34 4.16" />
        <path d="M2 2l20 20" />
        <path d="M5.8 5.8C2.9 7.1 1 9.8 1 13a8 8 0 0 0 8 8h11.5c1 0 1.9-.4 2.5-1.1" />
      </svg>
    );
  }
  if (name === "shield-check") {
    return (
      <svg {...common}>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  // hard-drive
  return (
    <svg {...common}>
      <line x1="22" y1="12" x2="2" y2="12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <line x1="6" y1="16" x2="6.01" y2="16" />
      <line x1="10" y1="16" x2="10.01" y2="16" />
    </svg>
  );
}

export default function FeaturePrivacy() {
  return (
    <section className="relative bg-[#F7F8FA] border-y border-[#E5E7EB] overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 70% 30%, rgba(37,99,235,0.04) 0%, transparent 55%)",
        }}
      />

      <div className="relative mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="max-w-[820px]">
          <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            隐私优先<br />
            默认不留痕
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[680px]">
            你说的话只用于当次识别和输出，不进入我们的服务器保存。
          </p>
          <p className="mt-2 text-[12px] font-mono text-mute tracking-wider">
            麦克风 → 识别 → 光标输入，全程不做云端留存
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-3 gap-4">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 140}>
              <div
                className="rounded-[16px] bg-canvas border border-[#E5E7EB] p-7 flex flex-col gap-4 h-full transition-all duration-300 hover:-translate-y-1"
                style={{
                  boxShadow:
                    "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.10)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="grid place-items-center w-11 h-11 rounded-full"
                    style={{
                      background: "rgba(37,99,235,0.08)",
                      color: BRAND,
                    }}
                  >
                    <Icon name={it.icon} />
                  </span>
                  <span className="font-mono text-[11px] tracking-wider text-mute">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="text-[20px] font-bold tracking-tight text-ink">
                  {it.title}
                </div>
                <div className="text-[14.5px] leading-[1.65] text-body">
                  {it.body}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Trust supplement — small reassurance line under the three cards. */}
        <p className="mt-8 text-center text-[13px] text-body">
          你可以随时清除本地历史，也可以关闭历史记录。
        </p>
      </div>
    </section>
  );
}

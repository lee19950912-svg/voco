import EmailForm from "./components/EmailForm";
import LiveDemo from "./components/LiveDemo";
import SpeedCompare from "./components/SpeedCompare";
import FeatureAutoList from "./components/FeatureAutoList";
import FeatureTranslate from "./components/FeatureTranslate";
import AppsAnywhere from "./components/AppsAnywhere";
import Faq from "./components/Faq";
import Reveal from "./components/Reveal";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <SpeedCompare />
        <FeatureAutoList />
        <FeatureContext />
        <FeatureTranslate />
        <AppsAnywhere />
        <FeaturePrivacy />
        <FaqSection />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Nav                                                                 */
/* ------------------------------------------------------------------ */
function Nav() {
  return (
    <header className="sticky top-0 z-40 h-16 bg-canvas/85 backdrop-blur border-b border-hairline">
      <div className="mx-auto h-full max-w-[1200px] px-6 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2 text-ink">
          <span className="grid place-items-center w-6 h-6 rounded-md bg-ink text-white text-[11px] font-semibold">
            V
          </span>
          <span className="voco-brand text-[15px]">VoCo</span>
        </a>
        <div className="flex items-center gap-2">
          <a
            href="#faq"
            className="hidden sm:inline-flex h-8 px-3 items-center text-[13px] text-body hover:text-ink rounded-full transition"
          >
            常见问题
          </a>
          <a
            href="#beta"
            className="inline-flex h-8 px-3 items-center text-[13px] font-semibold text-white bg-ink rounded-md hover:opacity-90 transition"
          >
            申请内测
          </a>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 mesh-bg-animated pointer-events-none" />
      <div className="relative mx-auto max-w-[1200px] px-6 pt-24 pb-28 sm:pt-28 sm:pb-32">
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 h-7 rounded-full bg-canvas-soft border border-hairline text-[12px] font-mono text-body">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0070f3] live-dot" />
              内测中 · Windows 10 / 11
            </div>

            <h1 className="mt-7 text-[56px] sm:text-[88px] font-normal leading-[1.02] tracking-[-0.02em] text-ink">
              说出来<br />写下去
            </h1>

            <p className="mt-7 max-w-[520px] text-[19px] leading-[1.55] text-body">
              按住一个键说话，松开瞬间文字到光标。
              AI 顺手帮你去口水话、修标点、整理分点。
              <span className="text-ink" style={{ fontWeight: 500 }}>中文母语者用得最顺。</span>
            </p>

            <div className="mt-9" id="beta">
              <EmailForm />
              <p className="mt-3 text-[12px] text-mute">
                内测期免费 · 仅用来通知发布 · 不会打扰你
              </p>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <LiveDemo />
          </div>
        </div>
      </div>
    </section>
  );
}


/* ------------------------------------------------------------------ */
/* Feature block: context-aware                                        */
/* ------------------------------------------------------------------ */
function FeatureContext() {
  const cases = [
    {
      app: "Cursor",
      tag: "代码编辑器",
      out: "fix the auth bug, remove the redundant token check",
      note: "极简风、技术词保留英文",
    },
    {
      app: "微信",
      tag: "聊天",
      out: "fix 一下那个 auth bug 哈，把多余的 token check 删了～",
      note: "口语 register、保留语气词",
    },
    {
      app: "Outlook",
      tag: "邮件",
      out: "请修复认证模块的 bug，并移除冗余的 token 校验逻辑。",
      note: "书面语、完整句、严谨标点",
    },
  ];

  return (
    <section className="border-b border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="max-w-[720px]">
          <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            懂你在哪<br />懂你在说什么
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body">
            看你在哪个软件，自动调输出风格。
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3 rounded-[12px] bg-canvas-soft border border-hairline px-5 py-4">
            <div className="font-mono text-[11px] uppercase tracking-wider text-mute mb-1">
              你说的话
            </div>
            <div className="text-[15px] text-ink italic">
              "fix 一下那个 auth bug 哈，把多余的 token check 删了"
            </div>
          </div>

          {cases.map((c, idx) => (
            <Reveal key={c.app} delay={idx * 140}>
              <div className="rounded-[12px] bg-canvas border border-hairline p-5 card-elev-2 flex flex-col gap-3 h-full transition hover:-translate-y-0.5 hover:card-elev-3">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-medium text-ink">
                    {c.app}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
                    {c.tag}
                  </span>
                </div>
                <div className="text-[14px] leading-[1.6] text-ink">{c.out}</div>
                <div className="text-[12px] text-mute">{c.note}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Feature block: privacy                                              */
/* ------------------------------------------------------------------ */
function FeaturePrivacy() {
  const items = [
    {
      title: "零云保留",
      body: "录音识别完即丢，VoCo 不在自己服务器存任何东西。",
    },
    {
      title: "不用于训练",
      body: "你的语音和文字不会被任何人拿去训练模型。",
    },
    {
      title: "历史只在本机",
      body: "词典、记录、配置全是你电脑里的文件，要删一键删。",
    },
  ];
  return (
    <section className="bg-canvas-soft border-y border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="max-w-[720px]">
          <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            隐私<br />优先
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[560px]">
            你说的话只走麦克风 → 引擎 → 剪贴板。
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-3 gap-px bg-hairline rounded-[12px] overflow-hidden border border-hairline">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 140}>
              <div className="bg-canvas p-7 flex flex-col gap-3 h-full">
                <div className="font-mono text-[11px] tracking-wider text-mute">
                  {String(i + 1).padStart(2, "0")}
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
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */
function FaqSection() {
  return (
    <section id="faq" className="border-b border-hairline">
      <div className="mx-auto max-w-[860px] px-6 py-24 sm:py-32">
        <h2 className="text-[44px] sm:text-[60px] font-bold leading-[1.0] tracking-[-0.02em] text-ink">
          常见问题
        </h2>
        <div className="mt-12">
          <Faq />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom CTA band                                                     */
/* ------------------------------------------------------------------ */
function CtaBand() {
  return (
    <section className="relative overflow-hidden border-b border-hairline">
      <div className="absolute inset-0 mesh-bg-animated pointer-events-none opacity-80" />
      <div className="relative mx-auto max-w-[1200px] px-6 py-24 sm:py-32 text-center">
        <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
          准备好了？
        </div>
        <h2 className="mt-4 text-[44px] sm:text-[60px] font-bold leading-[1.05] tracking-[-0.02em] text-ink">
          让说话回到写字
        </h2>
        <p className="mt-4 text-[16px] text-body max-w-[520px] mx-auto">
          留个邮箱，正式版上线时第一时间告诉你。
        </p>
        <div className="mt-8 flex justify-center">
          <EmailForm />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */
function Footer() {
  return (
    <footer className="bg-canvas">
      <div className="mx-auto max-w-[1200px] px-6 py-14 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-[13px] text-body">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-6 h-6 rounded-md bg-ink text-white text-[11px] font-semibold">
            V
          </span>
          <span className="voco-brand text-ink">VoCo</span>
          <span className="text-mute">· Made for Windows · Voice + Compose</span>
        </div>
        <div className="font-mono text-[12px] text-mute">
          © 2026 VoCo
        </div>
      </div>
    </footer>
  );
}

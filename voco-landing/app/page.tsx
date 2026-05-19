import EmailForm from "./components/EmailForm";
import LiveDemo from "./components/LiveDemo";
import SpeedCompare from "./components/SpeedCompare";
import FeatureTranslate from "./components/FeatureTranslate";
import AppsAnywhere from "./components/AppsAnywhere";
import Faq from "./components/Faq";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <FeatureTriple />
        <FeatureOneKey />
        <SpeedCompare />
        <FeatureContext />
        <FeatureTranslate />
        <AppsAnywhere />
        <DarkBand />
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
              说出来，<br />写下去。
            </h1>

            <p className="mt-7 max-w-[520px] text-[19px] leading-[1.55] text-body">
              按住右 Alt 说话，松开瞬间文字到光标。
              <span className="text-ink" style={{ fontWeight: 500 }}>为中文母语者重新设计。</span>
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
/* 3-up feature row                                                    */
/* ------------------------------------------------------------------ */
function FeatureTriple() {
  const items = [
    {
      eyebrow: "01",
      title: "中文专项",
      body: "短句、口语、夹英文术语都能准识别，标点自动补。",
    },
    {
      eyebrow: "02",
      title: "懂场景",
      body: "代码编辑器极简、聊天口语、邮件书面——AI 看应用自动切风格。",
    },
    {
      eyebrow: "03",
      title: "本地优先",
      body: "录音用完即丢，历史只在你电脑里，不上传。",
    },
  ];

  return (
    <section className="border-t border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-20 sm:py-24">
        <div className="grid sm:grid-cols-3 gap-px bg-hairline rounded-[12px] overflow-hidden border border-hairline">
          {items.map((it) => (
            <div
              key={it.title}
              className="bg-canvas p-7 flex flex-col gap-3 transition hover:bg-canvas-soft"
            >
              <div className="font-mono text-[11px] tracking-wider text-mute">
                {it.eyebrow}
              </div>
              <div className="text-[20px] font-bold tracking-tight text-ink">
                {it.title}
              </div>
              <div className="text-[14.5px] leading-[1.65] text-body">
                {it.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Feature block: one key, any app                                     */
/* ------------------------------------------------------------------ */
function FeatureOneKey() {
  return (
    <section className="bg-canvas-soft border-y border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-16 items-center">
          <div>
            <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
              One key. Anywhere.
            </div>
            <h2 className="mt-4 text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
              一个键。<br />任何软件。
            </h2>
            <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[520px]">
              按住右 Alt 说话，松开瞬间文字到光标。
              不挑应用、不切输入法——发消息、写代码、回邮件一个键搞定。
            </p>
            <ul className="mt-8 space-y-3 text-[15px] text-ink">
              <KeyValueRow label="录音方式" value="按住说，松开止" />
              <KeyValueRow label="出字方式" value="自动粘贴到当前光标" />
              <KeyValueRow label="冷启动" value="< 200 ms" />
              <KeyValueRow label="安装包" value="约 20 MB · 单 exe" />
            </ul>
          </div>

          <div className="relative">
            <div className="rounded-[16px] bg-canvas border border-hairline p-8 card-elev-3 transition hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.10),0_2px_2px_rgba(0,0,0,0.04)]">
              <div className="font-mono text-[11px] tracking-wider text-mute mb-4">
                EXAMPLE
              </div>
              <div className="space-y-5">
                <SayLine
                  raw="嗯那个、帮我把这个 PR 改成 draft 状态吧 啊不对 changed back 就行"
                  out="帮我把这个 PR 改成 draft 状态。改回 changed back 就行。"
                />
                <div className="border-t border-hairline" />
                <SayLine
                  raw="哥们儿明天三点能见一面吗 那个 关于上次说的那个事"
                  out="哥们儿，明天三点能见一面吗？关于上次说的那个事。"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between border-b border-hairline pb-3">
      <span className="text-[13px] font-mono tracking-wide text-mute uppercase">
        {label}
      </span>
      <span className="text-[15px] text-ink">{value}</span>
    </li>
  );
}

function SayLine({ raw, out }: { raw: string; out: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className="font-mono text-[10px] mt-1 text-mute uppercase tracking-wider shrink-0">
          说
        </span>
        <span className="text-[14px] leading-relaxed text-body italic">
          {raw}
        </span>
      </div>
      <div className="flex items-start gap-2">
        <span className="font-mono text-[10px] mt-1 text-ink uppercase tracking-wider shrink-0">
          出
        </span>
        <span className="text-[14.5px] leading-relaxed text-ink font-medium">
          {out}
        </span>
      </div>
    </div>
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
          <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
            Context-aware polish
          </div>
          <h2 className="mt-4 text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            懂你在哪、<br />懂你在说什么。
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body">
            VoCo 看你当前在哪个软件，自动调输出风格。同一句话，在代码编辑器、聊天、邮件里出来完全不一样。
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

          {cases.map((c) => (
            <div
              key={c.app}
              className="rounded-[12px] bg-canvas border border-hairline p-5 card-elev-2 flex flex-col gap-3 transition hover:-translate-y-0.5 hover:card-elev-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-ink">{c.app}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
                  {c.tag}
                </span>
              </div>
              <div className="text-[14px] leading-[1.6] text-ink">{c.out}</div>
              <div className="text-[12px] text-mute">{c.note}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Dark band — philosophy                                              */
/* ------------------------------------------------------------------ */
function DarkBand() {
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto max-w-[1200px] px-6 py-28 sm:py-36">
        <div className="font-mono text-[12px] tracking-wider text-white/50 uppercase">
          Principles
        </div>
        <h2 className="mt-4 text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] max-w-[820px]">
          让你忘了在用一个软件，<br />只剩下"说话即写字"。
        </h2>
        <div className="mt-14 grid sm:grid-cols-3 gap-10 max-w-[1000px]">
          <Principle
            n="01"
            title="不打扰"
            body="只在你按下快捷键时工作。不监听、不截屏、不预录。"
          />
          <Principle
            n="02"
            title="不锁死"
            body="API Key 可以填你自己的，词典在本地，历史在本地，要换软件随时换。"
          />
          <Principle
            n="03"
            title="不端着"
            body="收到反馈就改。bug 自己用得上的也会先修，再轮到别人。"
          />
        </div>
      </div>
    </section>
  );
}

function Principle({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="font-mono text-[11px] tracking-wider text-white/40">
        {n}
      </div>
      <div className="mt-3 text-[20px] font-bold tracking-tight">
        {title}
      </div>
      <div className="mt-2 text-[14.5px] leading-[1.65] text-white/65">
        {body}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */
function FaqSection() {
  return (
    <section id="faq" className="border-b border-hairline">
      <div className="mx-auto max-w-[860px] px-6 py-24 sm:py-32">
        <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
          FAQ
        </div>
        <h2 className="mt-4 text-[44px] sm:text-[60px] font-bold leading-[1.0] tracking-[-0.02em] text-ink">
          常见问题。
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
          让说话回到写字。
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

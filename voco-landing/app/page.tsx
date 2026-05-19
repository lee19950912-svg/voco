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
/* 3-up feature row                                                    */
/* ------------------------------------------------------------------ */
function FeatureTriple() {
  const items = [
    {
      eyebrow: "01",
      title: "去口水话 · 修标点",
      body: "「嗯/啊/那个/就是」自动删，标点不用想，AI 补好。",
    },
    {
      eyebrow: "02",
      title: "自动分点",
      body: "说「先 A 再 B 最后 C」自动出 1./2./3. 清单，结构化笔记一句话搞定。",
    },
    {
      eyebrow: "03",
      title: "按场景调风格",
      body: "代码极简、聊天口语、邮件书面——同一句话在不同软件里出来不一样。",
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
/* Feature block: auto-list (messy speech -> clean numbered list)      */
/* ------------------------------------------------------------------ */
function FeatureAutoList() {
  return (
    <section className="bg-canvas-soft border-y border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-16 items-center">
          <div>
            <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
              Auto list
            </div>
            <h2 className="mt-4 text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
              讲三件事<br />自动出三行
            </h2>
            <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[520px]">
              说「先 A 再 B 最后 C」或者「第一第二第三」，VoCo 自动整理成编号清单——粘到光标位置直接是结构化的笔记。
            </p>
            <ul className="mt-7 space-y-2 text-[14.5px] text-body">
              <li className="flex gap-2"><span className="text-mute">·</span>检测「先 / 再 / 然后 / 最后」「第一 / 第二 / 第三」等口语连接词</li>
              <li className="flex gap-2"><span className="text-mute">·</span>3 件以上独立事项才编号，日常聊天不会被误判</li>
              <li className="flex gap-2"><span className="text-mute">·</span>代码编辑器场景自动关闭，保持单行</li>
            </ul>
          </div>

          <div className="relative">
            <div className="rounded-[16px] bg-canvas border border-hairline p-7 card-elev-3">
              <div className="font-mono text-[11px] tracking-wider text-mute mb-3">
                你说的
              </div>
              <p className="text-[15px] leading-[1.7] text-body italic">
                "嗯今天有三个事要搞啊，先把那个 bug 修一下，然后开个会同步一下进度，对了，最后还要写个周报发给老板"
              </p>
              <div className="my-6 flex items-center gap-3 text-mute">
                <div className="flex-1 border-t border-hairline" />
                <span className="font-mono text-[10px] tracking-wider uppercase">VoCo</span>
                <div className="flex-1 border-t border-hairline" />
              </div>
              <div className="font-mono text-[11px] tracking-wider text-mute mb-3">
                出在光标位置
              </div>
              <ol className="space-y-2 text-[15.5px] leading-[1.55] text-ink">
                <li><span className="font-mono text-mute mr-2">1.</span>把那个 bug 修一下</li>
                <li><span className="font-mono text-mute mr-2">2.</span>开个会同步一下进度</li>
                <li><span className="font-mono text-mute mr-2">3.</span>写个周报发给老板</li>
              </ol>
            </div>
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
          <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
            Context-aware polish
          </div>
          <h2 className="mt-4 text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            懂你在哪<br />懂你在说什么
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
/* Feature block: privacy                                              */
/* ------------------------------------------------------------------ */
function FeaturePrivacy() {
  const items = [
    {
      title: "不经过我们",
      body: "录音和文字直接发给你选的引擎（火山 / DeepSeek / OpenAI），不绕道 VoCo 自己的服务器——我们想存档都存不到。",
    },
    {
      title: "引擎承诺不训练",
      body: "火山、DeepSeek、OpenAI 的 API 协议都明确：客户数据不会用于模型训练。VoCo 默认走 API，不走有训练义务的免费方案。",
    },
    {
      title: "历史在本地",
      body: "词典、识别记录、配置全是你电脑里的文件，要删一键删。换电脑也是你自己拷过去。",
    },
  ];
  return (
    <section className="bg-canvas-soft border-y border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="max-w-[720px]">
          <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
            Privacy
          </div>
          <h2 className="mt-4 text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            你的声音<br />不外传
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[560px]">
            VoCo 是直连工具，不开自己的中转服务，也不会偷偷收集。你说的话只在三个地方走过：你的麦克风、你选的引擎、你的剪贴板。
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-3 gap-px bg-hairline rounded-[12px] overflow-hidden border border-hairline">
          {items.map((it, i) => (
            <div key={it.title} className="bg-canvas p-7 flex flex-col gap-3">
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
        <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
          FAQ
        </div>
        <h2 className="mt-4 text-[44px] sm:text-[60px] font-bold leading-[1.0] tracking-[-0.02em] text-ink">
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

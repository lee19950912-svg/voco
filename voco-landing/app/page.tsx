import LiveDemo from "./components/LiveDemo";
import SpeedCompare from "./components/SpeedCompare";
import FeatureAutoList from "./components/FeatureAutoList";
import FeatureContext from "./components/FeatureContext";
import FeatureTranslate from "./components/FeatureTranslate";
import AppsAnywhere from "./components/AppsAnywhere";
import FeaturePrivacy from "./components/FeaturePrivacy";
import Faq from "./components/Faq";

// Open-source project — CTA points at the public GitHub repo instead of the
// old email-signup flow. The /releases page carries the Windows installer.
const REPO_URL = "https://github.com/lee19950912-svg/voco";

function DownloadCta({ center = false }: { center?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-3 ${center ? "justify-center" : ""}`}>
      <a
        href={`${REPO_URL}/releases`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-12 px-6 items-center gap-2 rounded-full bg-ink text-white text-[15px] font-semibold hover:bg-[#1a1a1a] hover:-translate-y-px hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.25)] active:translate-y-0 transition"
      >
        <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 1v8m0 0L3.5 5.5M7 9l3.5-3.5M2 12h10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        下载 Windows 版
      </a>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-12 px-6 items-center gap-2 rounded-full border border-hairline bg-canvas text-ink text-[15px] font-semibold hover:border-ink/30 hover:-translate-y-px transition"
      >
        在 GitHub 看源码
      </a>
    </div>
  );
}

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
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 px-4 items-center text-[13px] font-semibold text-white bg-ink rounded-full hover:opacity-90 hover:-translate-y-px transition"
          >
            GitHub
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
            <h1 className="hero-in text-[56px] sm:text-[88px] leading-[0.98] tracking-[-0.02em] text-ink">
              别打字了<br />直接说
            </h1>

            <p className="hero-in hero-in-delay-1 mt-7 max-w-[560px] text-[19px] leading-[1.55] text-body font-normal">
              <span style={{ color: "#2563EB", fontWeight: 600 }}>VoCo</span>{" "}
              把你的语音变成可直接发送的文字。自动去口水话、修标点、润色表达，还能一键翻译。
            </p>

            <div className="hero-in hero-in-delay-2 mt-9" id="beta">
              <DownloadCta />
              <p className="mt-3 text-[12px] text-mute">
                开源免费 · MIT 许可 · Windows 10 / 11
              </p>
            </div>
          </div>

          <div className="hero-in hero-in-delay-2 flex justify-center lg:justify-end">
            <div className="float-soft w-full max-w-[440px]">
              <LiveDemo />
            </div>
          </div>
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
    <section
      id="faq"
      className="border-b border-hairline scroll-mt-20"
    >
      <div className="mx-auto max-w-[860px] px-6 py-24 sm:py-32">
        <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
          你可能<br />还想知道
        </h2>
        <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[640px]">
          关于识别、隐私、兼容性，这里一次说明白。
        </p>
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
      <div className="absolute inset-0 mesh-bg-animated pointer-events-none opacity-50" />
      <div className="relative mx-auto max-w-[1200px] px-6 py-20 sm:py-24 text-center">
        <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.025em] text-ink">
          用说话<br />代替打字
        </h2>
        <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[560px] mx-auto">
          完全开源、免费使用。源码和 Windows 安装包都在 GitHub 上。
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <DownloadCta center />
          <p className="text-[12px] text-mute">
            MIT 许可 · 欢迎 Star 和贡献
          </p>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12px] font-mono text-mute tracking-wider">
          <span>Windows 优先</span>
          <span className="text-hairline">·</span>
          <span>全局快捷键</span>
          <span className="text-hairline">·</span>
          <span>AI 润色 / 翻译</span>
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
    <footer className="bg-canvas border-t border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-[13px] text-body">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-6 h-6 rounded-md bg-ink text-white text-[11px] font-semibold">
            V
          </span>
          <span className="voco-brand text-ink">VoCo</span>
          <span className="text-mute">· Made for Windows · Voice + Compose</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="mailto:hi@voco.app" className="hover:text-ink transition">
            Contact
          </a>
          <span className="font-mono text-[12px] text-mute">© 2026 VoCo</span>
        </div>
      </div>
    </footer>
  );
}

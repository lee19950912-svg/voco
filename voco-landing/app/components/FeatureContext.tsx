"use client";

// Context-aware demo. Once the section scrolls into view: types the raw
// speech char-by-char, briefly cycles which app is "current", then drops
// in the three style-adapted outputs one by one. One-shot — looping was
// noisy when stacked next to the AutoList animation above.
import { useEffect, useRef, useState } from "react";

const BRAND = "#2563EB";

const RAW = "fix 一下那个 auth bug 哈，把多余的 token check 删了";

const cases: { app: string; tag: string; out: string; note: string }[] = [
  {
    app: "Cursor",
    tag: "代码编辑器",
    out: "fix auth bug，把多余 token check 删了",
    note: "极简风，删口水词，中英混排原样",
  },
  {
    app: "微信",
    tag: "聊天",
    out: "fix 一下 auth bug 哈，把多余 token check 删了",
    note: "口语化，保留「哈」等语气词",
  },
  {
    app: "Outlook",
    tag: "邮件",
    out: "请修复 auth bug，并删除多余的 token check。",
    note: "书面语，严谨标点，技术词保留英文",
  },
];

const TYPE_INTERVAL_MS = 32;
const DETECT_PAUSE_MS = 700;
const REVEAL_GAP_MS = 380;

type Phase = "idle" | "typing" | "detecting" | "revealing" | "done";

export default function FeatureContext() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState("");
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setPhase("typing");
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== "typing") return;
    if (typed.length >= RAW.length) {
      const t = setTimeout(() => setPhase("detecting"), 200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setTyped(RAW.slice(0, typed.length + 1)),
      TYPE_INTERVAL_MS,
    );
    return () => clearTimeout(t);
  }, [phase, typed]);

  useEffect(() => {
    if (phase !== "detecting") return;
    const t = setTimeout(() => setPhase("revealing"), DETECT_PAUSE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "revealing") return;
    if (shown >= cases.length) {
      setPhase("done");
      return;
    }
    const t = setTimeout(
      () => setShown((n) => n + 1),
      shown === 0 ? 80 : REVEAL_GAP_MS,
    );
    return () => clearTimeout(t);
  }, [phase, shown]);

  const typingActive = phase === "typing";
  const detected = phase === "detecting" || phase === "revealing" || phase === "done";

  return (
    <section
      ref={sectionRef}
      className="relative bg-[#F7F8FA] border-b border-[#E5E7EB] overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 70% 70%, rgba(37,99,235,0.05) 0%, transparent 55%)",
        }}
      />

      <div className="relative mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="max-w-[820px]">
          <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            在哪说话<br />
            就用哪种语气
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[680px]">
            VoCo 识别你当前在哪个软件，把同一句话改成代码、聊天、邮件各自合适的表达。
          </p>
        </div>

        {/* Input card */}
        <div
          className="mt-12 rounded-[16px] bg-canvas overflow-hidden"
          style={{
            border: "1px solid rgba(37,99,235,0.18)",
            boxShadow:
              "0 0 0 1px rgba(37,99,235,0.06), 0 1px 2px rgba(15,23,42,0.04), 0 16px 36px -16px rgba(37,99,235,0.22), 0 8px 24px -12px rgba(15,23,42,0.10)",
          }}
        >
          <div className="px-7 py-5">
            <div className="font-mono text-[10px] tracking-wider text-mute uppercase mb-2">
              你说的话
            </div>
            <p className="text-[17px] leading-[1.7] text-ink italic min-h-[2em]">
              &ldquo;{typed}
              {typingActive && <span className="caret" />}
              {phase === "idle" && (
                <span className="text-mute not-italic">
                  （滚到这里开始演示）
                </span>
              )}
              &rdquo;
            </p>
          </div>
          <div
            className="px-7 py-3 border-t flex items-center gap-3"
            style={{
              borderColor: "rgba(37,99,235,0.14)",
              background:
                "linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0.02) 100%)",
            }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${detected ? "live-dot" : ""}`}
              style={{ background: BRAND }}
            />
            <span
              className="font-mono text-[11px] tracking-wider"
              style={{
                color: BRAND,
                textShadow: "0 0 14px rgba(37,99,235,0.25)",
              }}
            >
              {detected ? "已识别当前窗口" : "正在识别窗口…"}
            </span>
            <span className="text-[12px] text-mute font-mono">
              Cursor · 微信 · Outlook
            </span>
          </div>
        </div>

        {/* Three style outputs */}
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          {cases.map((c, idx) => {
            const visible = phase === "revealing" || phase === "done";
            const itemVisible = visible && shown > idx;
            return (
              <div
                key={c.app}
                className="rounded-[16px] bg-canvas border border-[#E5E7EB] p-6 flex flex-col gap-4 h-full transition-all duration-500 hover:-translate-y-0.5"
                style={{
                  opacity: itemVisible ? 1 : 0,
                  transform: itemVisible
                    ? "translateY(0)"
                    : "translateY(12px)",
                  boxShadow:
                    "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.10)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#E5E7EB";
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[16px] font-semibold"
                    style={{ color: BRAND }}
                  >
                    {c.app}
                  </span>
                  <span className="text-[11px] font-mono text-mute uppercase tracking-wider">
                    {c.tag}
                  </span>
                </div>
                <div className="text-[15px] leading-[1.65] text-ink flex-1">
                  {c.out}
                </div>
                <div
                  className="text-[12px] text-mute pt-3 border-t border-[#E5E7EB]"
                  style={{ borderColor: "#EFF1F4" }}
                >
                  风格 · {c.note}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

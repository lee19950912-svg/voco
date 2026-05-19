"use client";

// Translate demo. Once the section scrolls into view: types the Chinese
// source line, briefly cycles a "translating…" beat, then drops in the
// three target-language outputs one by one. Bottom row shows the 8 most
// common targets + a button to expand the remaining 9 (full 17 are
// supported by the product). One-shot animation.
import { useEffect, useRef, useState } from "react";

const BRAND = "#2563EB";

const SOURCE = "明天下午三点有空吗？想跟你聊一下产品反馈。";

const cases: {
  lang: string;
  flag: string;
  out: string;
  tag: string;
}[] = [
  {
    lang: "English",
    flag: "US",
    out: "Are you free at 3 PM tomorrow? I'd like to chat about product feedback.",
    tag: "可直接发送",
  },
  {
    lang: "日本語",
    flag: "JP",
    out: "明日の午後 3 時、お時間ありますか？製品のフィードバックについて少しお話ししたいです。",
    tag: "礼貌表达",
  },
  {
    lang: "한국어",
    flag: "KR",
    out: "내일 오후 3시에 시간 괜찮으세요? 제품 피드백에 대해 잠깐 이야기하고 싶어요.",
    tag: "礼貌表达",
  },
];

// Top 8 displayed by default; rest expand when "更多语言" is clicked.
// Order mirrors src/types.ts::TRANSLATION_TARGETS.
const COMMON_TARGETS: { code: string; name: string }[] = [
  { code: "US", name: "英语" },
  { code: "JP", name: "日语" },
  { code: "KR", name: "韩语" },
  { code: "FR", name: "法语" },
  { code: "DE", name: "德语" },
  { code: "ES", name: "西班牙语" },
  { code: "RU", name: "俄语" },
  { code: "SA", name: "阿拉伯语" },
];

const MORE_TARGETS: { code: string; name: string }[] = [
  { code: "PT", name: "葡萄牙语" },
  { code: "IT", name: "意大利语" },
  { code: "TH", name: "泰语" },
  { code: "VN", name: "越南语" },
  { code: "IN", name: "印地语" },
  { code: "TR", name: "土耳其语" },
  { code: "ID", name: "印尼语" },
  { code: "MY", name: "马来语" },
  { code: "CN", name: "中文" },
];

const TYPE_INTERVAL_MS = 35;
const TRANSLATE_PAUSE_MS = 800;
const REVEAL_GAP_MS = 400;

type Phase = "idle" | "typing" | "translating" | "revealing" | "done";

export default function FeatureTranslate() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState("");
  const [shown, setShown] = useState(0);
  const [expanded, setExpanded] = useState(false);

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
    if (typed.length >= SOURCE.length) {
      const t = setTimeout(() => setPhase("translating"), 200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setTyped(SOURCE.slice(0, typed.length + 1)),
      TYPE_INTERVAL_MS,
    );
    return () => clearTimeout(t);
  }, [phase, typed]);

  useEffect(() => {
    if (phase !== "translating") return;
    const t = setTimeout(() => setPhase("revealing"), TRANSLATE_PAUSE_MS);
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
  const translating = phase === "translating";
  const reveal = phase === "revealing" || phase === "done";

  return (
    <section
      ref={sectionRef}
      className="bg-[#F7F8FA] border-y border-[#E5E7EB]"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="max-w-[820px]">
          <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            说中文<br />
            直接发外语
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[680px]">
            按住快捷键说中文，VoCo 自动翻译，并粘贴到当前输入框。
          </p>
          <p className="mt-2 text-[12px] font-mono text-mute tracking-wider">
            默认快捷键：右 Alt + 右 Ctrl
          </p>
        </div>

        {/* Source input card */}
        <div
          className="mt-12 rounded-[16px] bg-canvas overflow-hidden"
          style={{
            border: "1px solid rgba(37,99,235,0.18)",
            boxShadow:
              "0 0 0 1px rgba(37,99,235,0.06), 0 1px 2px rgba(15,23,42,0.04), 0 16px 36px -16px rgba(37,99,235,0.22), 0 8px 24px -12px rgba(15,23,42,0.10)",
          }}
        >
          <div className="px-7 py-5">
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-[10px] tracking-wider text-mute uppercase">
                你说的中文
              </div>
              <div className="font-mono text-[10px] tracking-wider text-mute">
                ZH
              </div>
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
            <div className="flex items-center gap-[3px]">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={`inline-block w-[3px] h-[12px] rounded-full ${
                    translating ? "voco-bar" : ""
                  }`}
                  style={{
                    background: translating ? BRAND : "rgba(37,99,235,0.25)",
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
            <span
              className="font-mono text-[11px] tracking-wider"
              style={{
                color: BRAND,
                textShadow: "0 0 14px rgba(37,99,235,0.25)",
              }}
            >
              {translating
                ? "翻译中…"
                : reveal
                  ? "✓ 已翻译，已粘贴到光标"
                  : "中文 → English · 日本語 · 한국어"}
            </span>
          </div>
        </div>

        {/* Three target-language outputs */}
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          {cases.map((c, idx) => {
            const itemVisible = reveal && shown > idx;
            return (
              <div
                key={c.lang}
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
                    {c.lang}
                  </span>
                  <span className="text-[11px] font-mono text-mute uppercase tracking-wider">
                    {c.flag}
                  </span>
                </div>
                <div className="text-[15px] leading-[1.65] text-ink flex-1">
                  {c.out}
                </div>
                <div className="pt-3 border-t" style={{ borderColor: "#EFF1F4" }}>
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium"
                    style={{
                      background: "rgba(37,99,235,0.08)",
                      color: BRAND,
                    }}
                  >
                    <span
                      className="w-1 h-1 rounded-full"
                      style={{ background: BRAND }}
                    />
                    {c.tag}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Language directory — common 8 by default + expandable */}
        <div className="mt-14">
          <div className="flex items-baseline justify-between mb-4">
            <div className="font-mono text-[11px] tracking-wider text-mute uppercase">
              支持 17 种目标语言
            </div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[12px] font-medium transition hover:opacity-80"
              style={{ color: BRAND }}
            >
              {expanded ? "收起" : `+ 其他 ${MORE_TARGETS.length} 种`}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {COMMON_TARGETS.map((t) => (
              <LangChip key={t.code} code={t.code} name={t.name} />
            ))}
            {expanded &&
              MORE_TARGETS.map((t) => (
                <LangChip key={t.code} code={t.code} name={t.name} />
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LangChip({ code, name }: { code: string; name: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 h-9 pl-2.5 pr-3.5 rounded-full text-[13px] text-ink whitespace-nowrap transition"
      style={{
        background: "#FAFBFC",
        border: "1px solid #E5E7EB",
      }}
      title={name}
    >
      <span className="font-mono text-[10px] tracking-wider text-mute uppercase">
        {code}
      </span>
      {name}
    </span>
  );
}

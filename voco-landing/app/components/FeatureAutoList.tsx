"use client";

// Animated demo of the auto-list feature. Once the section scrolls into
// view: types the messy speech char-by-char, runs a brief "整理中" beat,
// then reveals three numbered list items one by one. One-shot — looping
// was distracting when tested.
import { useEffect, useRef, useState } from "react";

const BRAND = "#2563EB";

const RAW =
  "嗯今天有三个事要搞啊，先把那个 bug 修一下，然后开个会同步一下进度，对了，最后还要写个周报发给老板";

const ITEMS = [
  "把那个 bug 修一下",
  "开个会同步一下进度",
  "写个周报发给老板",
];

const TYPE_INTERVAL_MS = 38;
const PROCESS_MS = 700;          // brief "整理中" beat before items drop
const PER_ITEM_GAP_MS = 320;

type Phase = "idle" | "typing" | "processing" | "items" | "done";

export default function FeatureAutoList() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState("");
  const [itemsShown, setItemsShown] = useState(0);

  // Kick off when the section first scrolls into view.
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

  // Typing loop.
  useEffect(() => {
    if (phase !== "typing") return;
    if (typed.length >= RAW.length) {
      const t = setTimeout(() => setPhase("processing"), 200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setTyped(RAW.slice(0, typed.length + 1)),
      TYPE_INTERVAL_MS,
    );
    return () => clearTimeout(t);
  }, [phase, typed]);

  // Processing beat — let the user feel the "AI is thinking" moment.
  useEffect(() => {
    if (phase !== "processing") return;
    const t = setTimeout(() => setPhase("items"), PROCESS_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Item reveal loop.
  useEffect(() => {
    if (phase !== "items") return;
    if (itemsShown >= ITEMS.length) {
      setPhase("done");
      return;
    }
    const t = setTimeout(
      () => setItemsShown((n) => n + 1),
      itemsShown === 0 ? 100 : PER_ITEM_GAP_MS,
    );
    return () => clearTimeout(t);
  }, [phase, itemsShown]);

  const typingActive = phase === "typing";
  const processing = phase === "processing";
  const showItems = phase === "items" || phase === "done";

  return (
    <section
      ref={sectionRef}
      className="bg-[#F7F8FA] border-y border-[#E5E7EB]"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-16 items-center">
          <div>
            <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
              想到哪说到哪<br />
              VoCo 替你列清单
            </h2>
            <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[520px]">
              一口气说三件事，AI 自动整理成编号清单，直接发给同事。
            </p>
            <ul className="mt-7 space-y-3 text-[15px] text-body">
              <li className="flex items-start gap-3">
                <span
                  className="mt-[8px] w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: BRAND }}
                />
                3 件以上独立事项才编号，日常聊天不会被误判
              </li>
              <li className="flex items-start gap-3">
                <span
                  className="mt-[8px] w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: BRAND }}
                />
                代码编辑器场景自动关闭，保持原样不动
              </li>
            </ul>
          </div>

          <div
            className="rounded-[16px] bg-canvas overflow-hidden"
            style={{
              border: "1px solid rgba(37,99,235,0.18)",
              boxShadow:
                "0 0 0 1px rgba(37,99,235,0.06), 0 1px 2px rgba(15,23,42,0.04), 0 16px 36px -16px rgba(37,99,235,0.22), 0 8px 24px -12px rgba(15,23,42,0.10)",
            }}
          >
            {/* Top — raw speech with macOS chrome */}
            <div className="h-10 px-4 flex items-center border-b border-[#E5E7EB] bg-[#FAFBFC]">
              <div className="flex gap-[6px]">
                <span className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]/70" />
                <span className="w-[10px] h-[10px] rounded-full bg-[#febc2e]/70" />
                <span className="w-[10px] h-[10px] rounded-full bg-[#28c840]/70" />
              </div>
              <div className="flex-1 text-center text-[12px] font-mono text-mute truncate px-4">
                微信 — 给同事
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-mute w-[120px] text-right">
                {phase === "done" ? "✓ 整理完成" : "光标在这里"}
              </div>
            </div>

            <div className="px-7 pt-6 pb-5 bg-[#FAFBFC]">
              <div className="font-mono text-[10px] tracking-wider text-mute uppercase mb-2">
                你说的（一口气）
              </div>
              <p className="text-[15px] leading-[1.75] text-body italic min-h-[4.5em]">
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

            {/* Middle — process indicator */}
            <div
              className="px-7 py-3 flex items-center gap-3 border-y border-[#E5E7EB]"
              style={{
                background:
                  "linear-gradient(90deg, rgba(37,99,235,0.05) 0%, rgba(37,99,235,0.02) 100%)",
              }}
            >
              <div className="flex items-center gap-[4px]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block w-[3px] h-[12px] rounded-full ${
                      processing ? "voco-bar" : ""
                    }`}
                    style={{
                      background: processing ? BRAND : "rgba(37,99,235,0.25)",
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                ))}
              </div>
              <span
                className="font-mono text-[11px] tracking-wider"
                style={{ color: BRAND }}
              >
                {processing
                  ? "VoCo 整理中…"
                  : phase === "done" || phase === "items"
                    ? "VoCo 已整理"
                    : "VoCo"}
              </span>
            </div>

            {/* Bottom — clean numbered output */}
            <div className="px-7 pt-6 pb-7 bg-canvas">
              <div className="font-mono text-[10px] tracking-wider text-mute uppercase mb-3">
                出在光标位置
              </div>
              <ol className="space-y-3 text-[16px] leading-[1.5] text-ink min-h-[160px]">
                {ITEMS.map((it, idx) => {
                  const visible = showItems && itemsShown > idx;
                  return (
                    <li
                      key={it}
                      className="flex items-start gap-3 transition-all duration-500"
                      style={{
                        opacity: visible ? 1 : 0,
                        transform: visible ? "translateY(0)" : "translateY(8px)",
                      }}
                    >
                      <span
                        className="shrink-0 grid place-items-center w-6 h-6 rounded-full text-[12px] font-mono font-semibold"
                        style={{
                          background: "rgba(37,99,235,0.10)",
                          color: BRAND,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span>{it}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Footer label — mirror SpeedCompare card style */}
            <div
              className="px-7 py-4 border-t flex items-center justify-between"
              style={{
                borderColor: "rgba(37,99,235,0.14)",
                background:
                  "linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0.02) 100%)",
              }}
            >
              <span
                className="text-[14px] font-semibold"
                style={{
                  color: BRAND,
                  textShadow: "0 0 18px rgba(37,99,235,0.30)",
                }}
              >
                自动分点
              </span>
              <span className="text-[12px] font-mono text-mute">
                3 件以上自动触发
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

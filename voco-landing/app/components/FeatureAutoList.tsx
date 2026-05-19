"use client";

// Animated demo of the auto-list feature. Once the section scrolls into
// view: types the messy speech char-by-char, pauses, then reveals the
// three numbered list items one by one. One-shot — looping was distracting
// when tested.
import { useEffect, useRef, useState } from "react";

const RAW =
  "嗯今天有三个事要搞啊，先把那个 bug 修一下，然后开个会同步一下进度，对了，最后还要写个周报发给老板";

const ITEMS = [
  "把那个 bug 修一下",
  "开个会同步一下进度",
  "写个周报发给老板",
];

const TYPE_INTERVAL_MS = 38;
const PAUSE_BEFORE_ITEMS_MS = 600;
const PER_ITEM_GAP_MS = 320;

type Phase = "idle" | "typing" | "items" | "done";

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
      const t = setTimeout(() => setPhase("items"), PAUSE_BEFORE_ITEMS_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setTyped(RAW.slice(0, typed.length + 1)),
      TYPE_INTERVAL_MS,
    );
    return () => clearTimeout(t);
  }, [phase, typed]);

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
  const showItems = phase === "items" || phase === "done";

  return (
    <section
      ref={sectionRef}
      className="bg-canvas-soft border-y border-hairline"
    >
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
              说「先 A 再 B 最后 C」或者「第一第二第三」，VoCo
              自动整理成编号清单——粘到光标位置直接是结构化的笔记。
            </p>
            <ul className="mt-7 space-y-2 text-[14.5px] text-body">
              <li className="flex gap-2">
                <span className="text-mute">·</span>
                检测「先 / 再 / 然后 / 最后」「第一 / 第二 / 第三」等口语连接词
              </li>
              <li className="flex gap-2">
                <span className="text-mute">·</span>
                3 件以上独立事项才编号，日常聊天不会被误判
              </li>
              <li className="flex gap-2">
                <span className="text-mute">·</span>
                代码编辑器场景自动关闭，保持单行
              </li>
            </ul>
          </div>

          <div className="relative">
            <div className="rounded-[16px] bg-canvas border border-hairline p-7 card-elev-3 min-h-[360px]">
              <div className="font-mono text-[11px] tracking-wider text-mute mb-3">
                你说的
              </div>
              <p className="text-[15px] leading-[1.7] text-body italic min-h-[5em]">
                &ldquo;{typed}
                {typingActive && <span className="caret" />}
                {!typingActive && phase === "idle" && (
                  <span className="text-mute not-italic">
                    （滚到这里开始演示）
                  </span>
                )}
                &rdquo;
              </p>
              <div className="my-6 flex items-center gap-3 text-mute">
                <div className="flex-1 border-t border-hairline" />
                <span className="font-mono text-[10px] tracking-wider uppercase">
                  VoCo
                </span>
                <div className="flex-1 border-t border-hairline" />
              </div>
              <div className="font-mono text-[11px] tracking-wider text-mute mb-3">
                出在光标位置
              </div>
              <ol className="space-y-2 text-[15.5px] leading-[1.55] text-ink">
                {ITEMS.map((it, idx) => {
                  const visible = showItems && itemsShown > idx;
                  return (
                    <li
                      key={it}
                      className="transition-all duration-500"
                      style={{
                        opacity: visible ? 1 : 0,
                        transform: visible
                          ? "translateY(0)"
                          : "translateY(8px)",
                      }}
                    >
                      <span className="font-mono text-mute mr-2">
                        {idx + 1}.
                      </span>
                      {it}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

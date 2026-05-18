"use client";

import { useEffect, useState } from "react";

type Phase = "listening" | "polishing" | "settled";

// Three examples that auto-cycle. Picked to span the registers VoCo's
// context-aware polish handles: chat / code / email. The raw lines are
// peppered with fillers + self-corrections that the polish layer cleans.
const lines: { ctx: string; raw: string; out: string }[] = [
  {
    ctx: "微信 · 给朋友",
    raw: "嗯那个 哥们儿明天三点能见一面吗 那个 关于上次说的那个事",
    out: "哥们儿，明天三点能见一面吗？关于上次说的那个事。",
  },
  {
    ctx: "Cursor · 写代码",
    raw: "fix 一下那个 auth bug 哈 那个 把多余的 token check 删了",
    out: "Fix the auth bug. Remove the redundant token check.",
  },
  {
    ctx: "Outlook · 写邮件",
    raw: "麻烦 嗯 帮我查一下 Q4 那个销售数据 那个 老张那边发过来的",
    out: "麻烦帮我查一下 Q4 的销售数据，是老张那边发过来的。",
  },
];

// Per-phase durations. Tuned so the user sees:
//   ~2s   listening (waveform alive, raw text fading in)
//   ~1.4s polishing (waveform quiet, shimmer placeholder in 出区)
//   ~3.5s settled  (clean line visible, hold time long enough to read)
//   ~0.1s pause    (cycle to next, key change re-triggers fade-up)
const LISTEN_MS = 2000;
const POLISH_MS = 1400;
const HOLD_MS = 3500;

export default function LiveDemo() {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("listening");

  useEffect(() => {
    setPhase("listening");
    const t1 = setTimeout(() => setPhase("polishing"), LISTEN_MS);
    const t2 = setTimeout(() => setPhase("settled"), LISTEN_MS + POLISH_MS);
    const t3 = setTimeout(
      () => setIdx((i) => (i + 1) % lines.length),
      LISTEN_MS + POLISH_MS + HOLD_MS,
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [idx]);

  const line = lines[idx];
  const listening = phase === "listening";

  return (
    <div className="rounded-[20px] bg-canvas/85 backdrop-blur border border-hairline p-7 card-elev-3 w-full max-w-[440px]">
      {/* Status row */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-[11px] font-mono text-mute uppercase tracking-wider">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              listening ? "bg-[#0070f3] live-dot" : "bg-mute"
            }`}
          />
          {phase === "listening" && "听写中"}
          {phase === "polishing" && "整理中"}
          {phase === "settled" && "已完成"}
        </div>
        <div className="text-[11px] font-mono text-mute">{line.ctx}</div>
      </div>

      {/* HUD pill */}
      <div className="flex items-center justify-center mb-7">
        <div className="flex items-center gap-[5px] h-[44px] w-[120px] rounded-full bg-ink shadow-[0_8px_24px_-6px_rgba(0,0,0,0.25)] justify-center">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={`inline-block w-[4px] rounded-full bg-white ${
                listening ? "voco-bar" : ""
              }`}
              style={{
                height: listening ? "22px" : "4px",
                transition: "height 380ms ease",
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Raw */}
      <div key={`raw-${idx}`} className="fade-up">
        <div className="text-[10px] font-mono text-mute uppercase tracking-wider mb-1.5">
          说
        </div>
        <div className="text-[14px] leading-relaxed text-body italic">
          {line.raw}
        </div>
      </div>

      <div className="my-4 border-t border-hairline" />

      {/* Out */}
      <div className="min-h-[64px]">
        <div className="text-[10px] font-mono text-ink uppercase tracking-wider mb-1.5">
          出
        </div>
        {phase === "settled" ? (
          <div
            key={`out-${idx}`}
            className="text-[15px] leading-relaxed text-ink font-medium fade-up"
          >
            {line.out}
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="h-[10px] w-4/5 rounded shimmer" />
            <div className="h-[10px] w-3/5 rounded shimmer" />
          </div>
        )}
      </div>
    </div>
  );
}

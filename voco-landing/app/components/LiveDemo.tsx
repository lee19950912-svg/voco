"use client";

import { useEffect, useState } from "react";

type Phase = "listening" | "polishing" | "settled";
type Mode = "polish" | "translate";

// Four canonical scenes that auto-cycle in the Hero LiveDemo. Each scene
// runs the full listening → polishing → settled animation, then advances
// to the next. Span the four registers VoCo handles: chat polish, EN
// translate, code polish, KR translate — so a visitor sees all of "去
// 口水话 / 修标点 / 润色 / 翻译" within one 20s loop.
const lines: {
  mode: Mode;
  ctx: string;
  modeTag?: string;
  raw: string;
  out: string;
}[] = [
  {
    mode: "polish",
    ctx: "微信 · 给朋友",
    raw: "嗯那个 哥们儿明天三点能见一面吗 那个 关于上次说的那个事",
    out: "哥们儿，明天三点能见一面吗？关于上次说的那个事。",
  },
  {
    mode: "translate",
    ctx: "Slack · 给同事",
    modeTag: "翻译 → English",
    raw: "明天下午能开个 Q3 复盘会吗 那个 把数据也带上",
    out: "Can we do a Q3 review tomorrow afternoon? Please bring the data too.",
  },
  {
    mode: "polish",
    ctx: "Cursor · 写代码",
    raw: "fix 一下那个 auth bug 哈 那个 把多余的 token check 删了",
    out: "Fix the auth bug. Remove the redundant token check.",
  },
  {
    mode: "polish",
    ctx: "飞书 · 同步进度",
    raw: "这周三件事 一个是把文档整理完 然后开个对齐会 最后把 demo 跑通",
    out: "这周三件事：\n1. 把文档整理完\n2. 开对齐会\n3. 跑通 demo",
  },
];

const LISTEN_MS = 1200;
const POLISH_MS = 700;
const HOLD_MS = 3000;

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
    <div className="rounded-[24px] bg-canvas/75 backdrop-blur-xl border border-white/60 p-7 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_24px_60px_-20px_rgba(15,23,42,0.18),0_8px_20px_-8px_rgba(15,23,42,0.08)] w-full max-w-[440px]">
      {/* Status row */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-[11px] font-mono text-mute uppercase tracking-wider">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              listening ? "bg-[#0070f3] live-dot" : "bg-mute"
            }`}
          />
          {phase === "listening" && "听写中"}
          {phase === "polishing" &&
            (line.mode === "translate" ? "翻译中" : "整理中")}
          {phase === "settled" && "已完成"}
        </div>
        <div className="text-[11px] font-mono text-mute">{line.ctx}</div>
      </div>

      {/* HUD pill */}
      <div className="flex items-center justify-center mb-7">
        <div className="hud-breath flex items-center gap-[5px] h-[44px] w-[120px] rounded-full bg-ink justify-center">
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
      <div key={`raw-${idx}`} className="fade-up min-h-[60px]">
        <div className="text-[10px] font-mono text-mute uppercase tracking-wider mb-1.5">
          说
        </div>
        <div className="text-[14px] leading-relaxed text-body italic">
          {line.raw}
        </div>
      </div>

      <div className="my-4 border-t border-hairline" />

      {/* Out */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-mono text-ink uppercase tracking-wider">
            出
          </div>
          {line.modeTag && (
            <div className="text-[10px] font-mono text-[#0070f3] tracking-wider">
              {line.modeTag}
            </div>
          )}
        </div>
        {/* Reserve space matching the eventual settled text so phase
            transitions (shimmer → text) don't pop the card height. Card
            still adapts per-scene because each line.out has its own
            natural height. */}
        <div className="relative">
          <div
            aria-hidden
            className="invisible whitespace-pre-line text-[15px] leading-relaxed font-medium"
          >
            {line.out}
          </div>
          <div className="absolute inset-0">
            {phase === "settled" ? (
              <div
                key={`out-${idx}`}
                className="text-[15px] leading-relaxed text-ink font-medium fade-up whitespace-pre-line"
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
      </div>
    </div>
  );
}

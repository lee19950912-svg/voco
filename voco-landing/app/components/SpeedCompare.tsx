"use client";

import { useEffect, useState } from "react";

// VoCo brand blue used only within this section. Picked to match the
// design-system requirement; we keep the global --link (#0070f3) for
// other places so this swap stays local.
const BRAND = "#2563EB";

// Single shared sentence both sides converge on. Picked to feel like a real
// quick message a person might dictate at work — not too short, not too long.
const TARGET = "明天下午三点开个会，把昨天那份材料一起带过来。";

// Frame-based clock — one tick every TICK_MS. Both sides derive what to
// show from the current frame so they stay in lock-step on the same loop.
const TICK_MS = 50;
const TOTAL = 320;            // 16 s loop
const VOICE_LISTEN_END = 50;  // 2.5 s — VoCo "listens" then drops the line
const KB_CHAR_FRAMES = 8;     // 400 ms per typed char — natural typing
const RESET_AT = 290;         // both sides blank at the very end

export default function SpeedCompare() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let f = 0;
    const id = setInterval(() => {
      f = (f + 1) % TOTAL;
      setFrame(f);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Keyboard: types char-by-char from frame 0 until done.
  const kbCharsRaw = Math.floor(frame / KB_CHAR_FRAMES);
  const kbChars = frame > RESET_AT ? 0 : Math.min(TARGET.length, kbCharsRaw);
  const kbText = TARGET.slice(0, kbChars);
  const kbDone = kbChars >= TARGET.length;

  // Voice: listening → text drops in → settled.
  const voicePhase: "listening" | "done" | "reset" =
    frame > RESET_AT ? "reset" : frame < VOICE_LISTEN_END ? "listening" : "done";

  return (
    <section className="relative border-y border-hairline bg-[#F7F8FA] overflow-hidden">
      {/* Subtle blue glow plate behind everything */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 70% 30%, rgba(37,99,235,0.06) 0%, transparent 55%)",
        }}
      />

      <div className="relative mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="max-w-[820px]">
          <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            你说完一段话<br />
            别人还在打第一行
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[640px]">
            按住快捷键说话，VoCo 自动整理成可发送的文字。
          </p>
        </div>

        <div className="mt-14 grid lg:grid-cols-2 gap-6">
          <KeyboardMock text={kbText} done={kbDone} reset={frame > RESET_AT} />
          <VoiceMock phase={voicePhase} text={TARGET} />
        </div>

        {/* Verdict — sits in the middle below both cards, ties the visual
            comparison together with a single number + a one-line explanation. */}
        <div className="mt-14 flex flex-col items-center text-center">
          <div className="flex items-baseline gap-3">
            <span
              className="text-[88px] font-bold tracking-[-0.05em] leading-none pop-in"
              style={{ color: BRAND }}
            >
              4×
            </span>
            <span className="text-[24px] font-medium text-ink">更快</span>
          </div>
          <p className="mt-3 text-[15px] text-body max-w-[480px]">
            同样一段话，VoCo 用时约为键盘输入的 1/4。
          </p>
        </div>
      </div>
    </section>
  );
}

/* ----- Left: fake notepad with character-by-character typing ----- */
function KeyboardMock({
  text,
  done,
  reset,
}: {
  text: string;
  done: boolean;
  reset: boolean;
}) {
  return (
    <div className="rounded-[16px] bg-canvas border border-[#E5E7EB] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] overflow-hidden">
      <WindowChrome title="笔记.txt" subtle="未保存" />
      <div className="px-7 py-7 min-h-[200px] bg-canvas">
        <div className="text-[17px] leading-[1.85] text-ink whitespace-pre-wrap">
          {reset ? "" : text}
          <span
            className={`inline-block w-[1.5px] h-[1.05em] align-[-2px] ml-[1px] bg-ink ${
              done || reset ? "" : "animate-pulse"
            }`}
          />
        </div>
      </div>
      <div className="px-7 py-4 border-t border-[#E5E7EB] flex items-center justify-between bg-[#FAFBFC]">
        <span className="text-[14px] font-semibold text-body">
          键盘输入
        </span>
        <span className="text-[12px] font-mono text-mute">
          约 50 字 / 分钟
        </span>
      </div>
    </div>
  );
}

/* ----- Right: fake chat window with VoCo HUD listening + paste-in ----- */
function VoiceMock({
  phase,
  text,
}: {
  phase: "listening" | "done" | "reset";
  text: string;
}) {
  return (
    <div
      className="rounded-[16px] bg-canvas border overflow-hidden relative transition"
      style={{
        borderColor: "rgba(37,99,235,0.18)",
        boxShadow:
          "0 0 0 1px rgba(37,99,235,0.06), 0 1px 2px rgba(15,23,42,0.04), 0 16px 36px -16px rgba(37,99,235,0.22), 0 8px 24px -12px rgba(15,23,42,0.10)",
      }}
    >
      <WindowChrome
        title="微信 — 给同事"
        subtle={phase === "done" ? "✓ 自动润色完成" : "光标在这里"}
        subtleColor={phase === "done" ? BRAND : undefined}
      />

      {/* Output area — content drops in fully when voice finishes */}
      <div className="px-7 py-7 min-h-[200px] bg-canvas relative">
        {phase === "done" && (
          <div className="text-[17px] leading-[1.85] text-ink whitespace-pre-wrap fade-up">
            {text}
            <span className="inline-block w-[1.5px] h-[1.05em] align-[-2px] ml-[1px] bg-ink animate-pulse" />
          </div>
        )}
        {phase === "listening" && (
          <div className="text-[17px] leading-[1.85] text-mute italic">
            <span className="inline-block w-[1.5px] h-[1.05em] align-[-2px] ml-[1px] bg-ink animate-pulse" />
          </div>
        )}
        {phase === "reset" && (
          <div>
            <span className="inline-block w-[1.5px] h-[1.05em] align-[-2px] ml-[1px] bg-ink animate-pulse" />
          </div>
        )}

        {/* Floating HUD pill — sits over the text area while listening */}
        {phase === "listening" && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div
              className="flex items-center gap-[5px] h-[36px] w-[100px] rounded-full bg-ink justify-center"
              style={{
                boxShadow:
                  "0 8px 24px -6px rgba(15,23,42,0.40), 0 0 24px rgba(37,99,235,0.30)",
              }}
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className="voco-bar inline-block w-[3px] h-[16px] rounded-full bg-white"
                  style={{ animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

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
          VoCo 语音输入
        </span>
        <span className="text-[12px] font-mono text-mute">
          约 200 字 / 分钟
        </span>
      </div>
    </div>
  );
}

/* Reusable mac-style window chrome with traffic lights + title. */
function WindowChrome({
  title,
  subtle,
  subtleColor,
}: {
  title: string;
  subtle?: string;
  subtleColor?: string;
}) {
  return (
    <div className="h-10 px-4 flex items-center border-b border-[#E5E7EB] bg-[#FAFBFC]">
      <div className="flex gap-[6px]">
        <span className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]/70" />
        <span className="w-[10px] h-[10px] rounded-full bg-[#febc2e]/70" />
        <span className="w-[10px] h-[10px] rounded-full bg-[#28c840]/70" />
      </div>
      <div className="flex-1 text-center text-[12px] font-mono text-mute truncate px-4">
        {title}
      </div>
      <div
        className="text-[10px] font-mono uppercase tracking-wider w-[140px] text-right"
        style={{ color: subtleColor ?? "var(--mute)" }}
      >
        {subtle ?? ""}
      </div>
    </div>
  );
}

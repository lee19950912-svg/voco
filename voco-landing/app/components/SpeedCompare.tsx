"use client";

import { useEffect, useState } from "react";

// Single shared sentence both sides converge on. Picked to feel like a real
// quick message a person might dictate at work — not too short, not too long.
const TARGET = "明天下午三点开个会，把昨天那份材料一起带过来。";

// Frame-based clock — one tick every TICK_MS. Both sides derive what to
// show from the current frame so they stay in lock-step on the same loop.
const TICK_MS = 50;
const TOTAL = 320;            // 16 s loop
const VOICE_LISTEN_END = 50;  // 2.5 s — VoCo "listens" then drops the line
const VOICE_FADE_END = 56;    // 0.3 s fade for the voice text
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
    <section className="border-y border-hairline bg-canvas-soft">
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="max-w-[720px]">
          <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
            Speed
          </div>
          <h2 className="mt-4 text-[36px] sm:text-[44px] leading-[1.1] tracking-[-0.03em] text-ink">
            说一段话的时间，<br />
            键盘只打到 1/4。
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[640px]">
            同一句话，看看谁先写完。
          </p>
        </div>

        <div className="mt-14 grid lg:grid-cols-2 gap-6">
          <KeyboardMock text={kbText} done={kbDone} reset={frame > RESET_AT} />
          <VoiceMock phase={voicePhase} text={TARGET} />
        </div>

        <div className="mt-14 flex items-baseline gap-3">
          <span className="text-[78px] font-bold tracking-[-0.05em] text-ink leading-none pop-in">
            4×
          </span>
          <span className="text-[14px] text-mute">更快 · 同样一段话</span>
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
    <div className="rounded-[14px] bg-canvas border border-hairline card-elev-3 overflow-hidden">
      <WindowChrome title="笔记.txt — 键盘输入" subtle="未保存" />
      <div className="px-7 py-6 min-h-[180px] bg-canvas">
        <div className="text-[16px] leading-[1.8] text-ink whitespace-pre-wrap">
          {reset ? "" : text}
          <span
            className={`inline-block w-[1.5px] h-[1.05em] align-[-2px] ml-[1px] bg-ink ${
              done || reset ? "" : "animate-pulse"
            }`}
          />
        </div>
      </div>
      <div className="px-7 py-3 border-t border-hairline flex items-center justify-between">
        <span className="text-[11px] font-mono text-mute uppercase tracking-wider">
          Keyboard
        </span>
        <span className="text-[11px] font-mono text-mute">
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
    <div className="rounded-[14px] bg-canvas border border-hairline card-elev-3 overflow-hidden relative">
      <WindowChrome title="微信 — 给同事" subtle="光标在这里" />

      {/* Output area — content drops in fully when voice finishes */}
      <div className="px-7 py-6 min-h-[180px] bg-canvas relative">
        {phase === "done" && (
          <div className="text-[16px] leading-[1.8] text-ink whitespace-pre-wrap fade-up">
            {text}
            <span className="inline-block w-[1.5px] h-[1.05em] align-[-2px] ml-[1px] bg-ink" />
          </div>
        )}
        {phase === "listening" && (
          <div className="text-[16px] leading-[1.8] text-mute italic">
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
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div className="flex items-center gap-[5px] h-[36px] w-[100px] rounded-full bg-ink justify-center shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)]">
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

      <div className="px-7 py-3 border-t border-hairline flex items-center justify-between">
        <span className="text-[11px] font-mono text-[#0070f3] uppercase tracking-wider">
          Voice · VoCo
        </span>
        <span className="text-[11px] font-mono text-mute">
          约 200 字 / 分钟
        </span>
      </div>
    </div>
  );
}

/* Reusable mac-style window chrome with traffic lights + title. */
function WindowChrome({ title, subtle }: { title: string; subtle?: string }) {
  return (
    <div className="h-9 px-4 flex items-center border-b border-hairline bg-canvas-soft">
      <div className="flex gap-[6px]">
        <span className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]/70" />
        <span className="w-[10px] h-[10px] rounded-full bg-[#febc2e]/70" />
        <span className="w-[10px] h-[10px] rounded-full bg-[#28c840]/70" />
      </div>
      <div className="flex-1 text-center text-[12px] font-mono text-mute truncate px-4">
        {title}
      </div>
      <div className="text-[10px] font-mono text-mute uppercase tracking-wider w-[80px] text-right">
        {subtle ?? ""}
      </div>
    </div>
  );
}

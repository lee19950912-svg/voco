// HUD entry — listens for Tauri events from the Rust backend and drives the
// pill animation. Mirrors hud_demo.html exactly (5 bars, 30 FPS, ease per
// frame so motion looks like a CSS transition).
import { listen } from "@tauri-apps/api/event";

const BAR_COUNT = 5;
const FRAME_MS = 33;
const LISTEN_RETARGET_EVERY = 4;
const LISTEN_EASE = 0.18;
const PROC_T_STEP = 0.45;
const PROC_EASE = 0.30;

type State = "hidden" | "listening" | "processing";

const hud = document.getElementById("hud")!;
const bars: HTMLDivElement[] = [];
for (let i = 0; i < BAR_COUNT; i++) {
  const b = document.createElement("div");
  b.className = "bar";
  b.style.height = "4px";
  hud.appendChild(b);
  bars.push(b);
}

let state: State = "hidden";
let timer: number | null = null;
let audioLevel = 0;
let procT = 0;
let listenFrame = 0;
const listenTargets = new Array(BAR_COUNT).fill(4);
const listenHeights = new Array(BAR_COUNT).fill(4);

function stopTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function listening() {
  listenFrame++;
  if (listenFrame >= LISTEN_RETARGET_EVERY) {
    listenFrame = 0;
    const volume = 0.45 + audioLevel * 0.55;
    const mid = (BAR_COUNT - 1) / 2;
    for (let i = 0; i < BAR_COUNT; i++) {
      const distance = Math.abs(i - mid) / mid;
      const base = (1 - distance * 0.5) * 16 * volume;
      listenTargets[i] = Math.max(4, Math.min(20, base + Math.random() * 3));
    }
  }
  for (let i = 0; i < BAR_COUNT; i++) {
    listenHeights[i] += (listenTargets[i] - listenHeights[i]) * LISTEN_EASE;
    bars[i].style.height = listenHeights[i].toFixed(1) + "px";
  }
}

function processing() {
  procT += PROC_T_STEP;
  for (let i = 0; i < BAR_COUNT; i++) {
    if (i === 0 || i === BAR_COUNT - 1) {
      bars[i].style.height = "4px";
    } else {
      const offset = (i - 1) * 0.9;
      const h = 6 + (Math.sin(procT - offset) * 0.5 + 0.5) * 14;
      bars[i].style.height = h.toFixed(1) + "px";
    }
  }
  // Bars themselves don't need easing here — sine wave is already smooth.
  void PROC_EASE; // reserved for future use
}

function applyState(next: State) {
  if (state === next) return;
  stopTimer();
  state = next;
  if (next === "hidden") {
    hud.classList.remove("show");
    return;
  }
  listenFrame = 0;
  procT = 0;
  hud.classList.add("show");
  timer = window.setInterval(() => {
    if (state === "listening") listening();
    else if (state === "processing") processing();
  }, FRAME_MS);
}

// Wire Tauri events.
listen<{ state: State }>("hud:state", (e) => applyState(e.payload.state)).catch(() => {
  // standalone preview fallback
  applyState("listening");
});
listen<{ level: number }>("hud:level", (e) => {
  audioLevel = e.payload.level;
});

// Always start hidden — Rust will tell us when to show.
applyState("hidden");

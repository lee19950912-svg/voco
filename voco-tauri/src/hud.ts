// HUD entry — listens for Tauri events from the Rust backend and drives the
// pill animation. Mirrors hud_demo.html exactly (5 bars, 30 FPS, ease per
// frame so motion looks like a CSS transition).
//
// Audio cues used to live here but were moved to the Rust backend (sound.rs)
// because WebView2's AudioContext racing the window-show clipped the first
// frames of the start cue. This file is now visual-only.
import { listen } from "@tauri-apps/api/event";

window.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
  if (e.key === "F5" || e.key === "F12") return e.preventDefault();
  if (e.ctrlKey && (e.key === "r" || e.key === "R")) return e.preventDefault();
  if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j")) return e.preventDefault();
});

const BAR_COUNT = 5;
const FRAME_MS = 33;
const LISTEN_EASE = 0.32;          // higher = snappier follow
const SILENCE_LEVEL = 0.04;        // below this we hold the resting baseline
const REST_HEIGHT = 3;             // px — flat line when silent
const MAX_HEIGHT = 20;             // px — pill inner height cap
const PROC_T_STEP = 0.45;
const PROC_EASE = 0.30;

type State = "hidden" | "listening" | "processing";

const hud = document.getElementById("hud")!;
const bars: HTMLDivElement[] = [];
for (let i = 0; i < BAR_COUNT; i++) {
  const b = document.createElement("div");
  b.className = "bar";
  b.style.height = REST_HEIGHT + "px";
  hud.appendChild(b);
  bars.push(b);
}

let state: State = "hidden";
let timer: number | null = null;
let audioLevel = 0;
let procT = 0;
const listenTargets = new Array(BAR_COUNT).fill(REST_HEIGHT);
const listenHeights = new Array(BAR_COUNT).fill(REST_HEIGHT);

function stopTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

// Recompute targets directly from the most-recent audio level — no random
// jitter, no minimum baseline. Center bar grows tallest, edges grow less.
// Silence (level below SILENCE_LEVEL) collapses everything to REST_HEIGHT,
// so the HUD looks dead-flat when the mic is not picking anything up.
function retargetFromLevel() {
  if (audioLevel < SILENCE_LEVEL) {
    for (let i = 0; i < BAR_COUNT; i++) listenTargets[i] = REST_HEIGHT;
    return;
  }
  const mid = (BAR_COUNT - 1) / 2;
  const v = Math.min(1, audioLevel);
  for (let i = 0; i < BAR_COUNT; i++) {
    const distance = Math.abs(i - mid) / mid;
    const shape = 1 - distance * 0.45;
    const h = REST_HEIGHT + shape * (MAX_HEIGHT - REST_HEIGHT) * v;
    listenTargets[i] = Math.max(REST_HEIGHT, Math.min(MAX_HEIGHT, h));
  }
}

function listening() {
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
  procT = 0;
  // Reset to flat baseline when (re)entering listening; otherwise we'd ease
  // down from the last "processing" tall shape.
  if (next === "listening") {
    audioLevel = 0;
    for (let i = 0; i < BAR_COUNT; i++) {
      listenTargets[i] = REST_HEIGHT;
      listenHeights[i] = REST_HEIGHT;
    }
  }
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
// Each level update from the backend (~20 Hz) re-aims the bar targets to the
// real volume immediately; the per-frame easing in listening() smooths the
// motion to the actual height. No random padding.
listen<{ level: number }>("hud:level", (e) => {
  audioLevel = e.payload.level;
  if (state === "listening") retargetFromLevel();
});

// Always start hidden — Rust will tell us when to show.
applyState("hidden");

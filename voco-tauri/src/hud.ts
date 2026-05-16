// HUD entry — listens for Tauri events from the Rust backend and drives the
// pill animation. Mirrors hud_demo.html exactly (5 bars, 30 FPS, ease per
// frame so motion looks like a CSS transition).
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

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

// --- Audio cues ---------------------------------------------------------
// Five WAV cues shipped from /public/sounds/. Decoded once at startup so
// playback is gap-free. Volume + on/off are read from voco.toml on startup
// and refreshed whenever the settings page emits "voco:sound_config".
type CueName = "start" | "stop" | "processing" | "success" | "error";

const CUE_FILES: Record<CueName, string> = {
  start: "/sounds/voco_record_start.wav",
  stop: "/sounds/voco_record_stop.wav",
  processing: "/sounds/voco_processing.wav",
  success: "/sounds/voco_success.wav",
  error: "/sounds/voco_error.wav",
};

let audioCtx: AudioContext | null = null;
const buffers: Partial<Record<CueName, AudioBuffer>> = {};
let soundEnabled = true;
let soundVolume = 0.7;

async function loadCue(name: CueName, url: string) {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const res = await fetch(url);
    if (!res.ok) return;
    const arr = await res.arrayBuffer();
    buffers[name] = await audioCtx.decodeAudioData(arr);
  } catch {
    // Missing or malformed file: leave the slot empty. play() no-ops.
  }
}

function preloadCues() {
  for (const [name, url] of Object.entries(CUE_FILES)) {
    void loadCue(name as CueName, url);
  }
}

function play(name: CueName) {
  if (!soundEnabled) return;
  const buf = buffers[name];
  if (!buf || !audioCtx) return;
  const ctx = audioCtx;
  const start = () => {
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = soundVolume;
      src.connect(gain).connect(ctx.destination);
      src.start();
    } catch {
      // Source creation failed — silent failure is fine, HUD visual is
      // primary feedback.
    }
  };
  // WebView2 keeps the AudioContext "suspended" until the user has gestured
  // inside the HUD window — which never happens because the HUD is a
  // click-through overlay. Calling start() while suspended schedules the
  // source at currentTime=0, and once resume() finally lands the playhead
  // jumps past the start time so the cue is silently dropped. So we wait
  // for resume to land before scheduling. Subsequent cues find the context
  // already "running" and play with no delay.
  if (ctx.state === "suspended") {
    ctx.resume().then(start).catch(() => {});
  } else {
    start();
  }
}

// Pull current sound config from the backend on startup, then keep it in
// sync via an event the settings page emits whenever the user toggles or
// drags the volume slider.
interface SoundConfig {
  sound_enabled?: boolean;
  sound_volume?: number;
}
function applySoundConfig(cfg: SoundConfig) {
  if (typeof cfg.sound_enabled === "boolean") soundEnabled = cfg.sound_enabled;
  if (typeof cfg.sound_volume === "number") {
    soundVolume = Math.max(0, Math.min(1, cfg.sound_volume));
  }
}
invoke<SoundConfig>("get_config")
  .then(applySoundConfig)
  .catch(() => {});
listen<SoundConfig>("voco:sound_config", (e) => applySoundConfig(e.payload)).catch(() => {});

// Delayed "still processing" cue — fires only if the pipeline takes long
// enough that the user might wonder whether the app froze.
const PROCESSING_DELAY_MS = 400;
let processingDelayTimer: number | null = null;
function clearProcessingDelay() {
  if (processingDelayTimer !== null) {
    clearTimeout(processingDelayTimer);
    processingDelayTimer = null;
  }
}

// Result/error cues replace the generic "stop" close-out. If one of these
// arrives we suppress the otherwise automatic close-out cue.
let resultCuePending: CueName | null = null;
listen("voco:result", () => {
  resultCuePending = "success";
}).catch(() => {});
listen("voco:error", () => {
  resultCuePending = "error";
}).catch(() => {});

preloadCues();

function applyState(next: State) {
  if (state === next) return;
  const prev = state;
  stopTimer();
  clearProcessingDelay();
  state = next;
  if (next === "hidden") {
    // Closing out a real session. If the backend just told us the outcome
    // (success / error), play that specific cue and clear it. Otherwise
    // (e.g. an empty recording cancelled before processing) the "stop" cue
    // we already played on listening→processing is the only one — don't
    // double-beep.
    if (resultCuePending) {
      play(resultCuePending);
      resultCuePending = null;
    }
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
    // Fresh open. Clear any stale result flag so an old session's success
    // beep can't leak into this one.
    resultCuePending = null;
    if (prev === "hidden") play("start");
  } else if (next === "processing") {
    // User just released the hotkey — immediate "stop" feedback, then a
    // delayed "still working" cue if the pipeline is taking a moment.
    play("stop");
    processingDelayTimer = window.setTimeout(() => {
      if (state === "processing") play("processing");
    }, PROCESSING_DELAY_MS);
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

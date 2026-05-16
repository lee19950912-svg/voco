import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FileText, Sparkles, Globe, Mic, AlertTriangle } from "lucide-react";
import type { VoCoConfig } from "./types";

const TOTAL_STEPS = 5;
const STEP_LABELS = ["欢迎", "地区", "麦克风", "快捷键", "完成"];

export function SetupWizard({
  onDone,
  initialCfg,
}: {
  onDone: () => void;
  initialCfg: VoCoConfig;
}) {
  const [step, setStep] = useState<number>(1);
  const [cfg, setCfg] = useState<VoCoConfig>(initialCfg);
  const [mics, setMics] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<string>("");
  const [testError, setTestError] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [koreanIme, setKoreanIme] = useState(false);

  useEffect(() => {
    invoke<string[]>("list_microphones").then(setMics).catch(() => {});
    invoke<boolean>("has_korean_ime").then(setKoreanIme).catch(() => {});
    // Smart default for region: if the user's browser locale isn't a
    // Chinese variant, flip from the "china" default to "overseas". They
    // can still flip back on the region step. Only runs on first launch
    // (wizard mount) so existing users keep whatever they had.
    const lang = (navigator.language || "").toLowerCase();
    if (cfg.region !== "overseas" && !lang.startsWith("zh")) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      update("region", "overseas");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wizard-only event subscriptions. App.tsx ignores these events while the
  // wizard is on screen (because wizardDone=false), so there's no double-
  // handling. Backend's dry_run also skips persisting test results.
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    listen<{ state: string }>("hud:state", (e) => {
      if (e.payload.state === "listening") setRecording(true);
      if (e.payload.state === "hidden") setRecording(false);
    }).then((u) => unsubs.push(u));
    listen<{ level: number }>("hud:level", (e) => setAudioLevel(e.payload.level)).then(
      (u) => unsubs.push(u),
    );
    listen<{ raw: string; text: string }>("voco:result", (e) => {
      setTestResult(e.payload.text);
      setTestError("");
    }).then((u) => unsubs.push(u));
    listen<{ message: string }>("voco:error", (e) => {
      setTestError(e.payload.message);
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  async function next() {
    if (step === TOTAL_STEPS) {
      const final = { ...cfg, first_run_completed: true };
      await invoke("save_config", { cfg: final });
      onDone();
      return;
    }
    setStep(step + 1);
  }

  function prev() {
    if (step > 1) setStep(step - 1);
  }

  // Enter advances; Esc goes back. Skip while focused on a text input or
  // capturing a key (KeyCapture sets its own keydown listener), so we don't
  // double-trigger.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if (e.key === "Enter") {
        e.preventDefault();
        void next();
      } else if (e.key === "Escape" && step > 1) {
        e.preventDefault();
        prev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cfg]);

  async function update<K extends keyof VoCoConfig>(k: K, v: VoCoConfig[K]) {
    const nextCfg = { ...cfg, [k]: v };
    setCfg(nextCfg);
    await invoke("save_config", { cfg: nextCfg });
  }

  async function runTest() {
    setTestResult("");
    setTestError("");
    invoke("manual_recognize", { mode: "polish", dryRun: true }).catch((e) =>
      setTestError(String(e)),
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="w-[680px] p-12 rounded-2xl border border-black/[0.05] shadow-sm">
        <Steps step={step} total={TOTAL_STEPS} labels={STEP_LABELS} />

        {step === 1 && (
          <div className="mt-10 voco-step-fade">
            <img
              src="/voco-logo.png"
              alt="VoCo"
              className="w-16 h-16 mx-auto rounded-2xl"
              draggable={false}
            />
            <h1 className="mt-6 text-center text-2xl font-semibold">
              欢迎使用 VoCo
            </h1>
            <p className="mt-3 text-center text-black/55 text-sm leading-relaxed">
              按住快捷键说话，AI 自动把你说的话写到光标位置。
              <br />
              下面 3 步搞定设置，大约 1 分钟。
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <ModeCard
                Icon={FileText}
                title="直接转文字"
                desc="松开快捷键，原话出字"
              />
              <ModeCard
                Icon={Sparkles}
                title="AI 润色"
                desc="去口水话、修语法、整理列表"
              />
              <ModeCard
                Icon={Globe}
                title="翻译"
                desc="说中文，写韩 / 英 / 日"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-10 voco-step-fade">
            <h2 className="text-xl font-semibold">你在哪？</h2>
            <p className="mt-2 text-black/55 text-sm">
              VoCo 会根据你的位置自动用最快的 AI 服务。以后能在设置里改。
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <WizardRegionCard
                label="中国大陆"
                desc="国内引擎，中文最准"
                selected={cfg.region !== "overseas"}
                onSelect={() => update("region", "china")}
              />
              <WizardRegionCard
                label="海外"
                desc="OpenAI 引擎，多语强，跨境可达"
                selected={cfg.region === "overseas"}
                onSelect={() => update("region", "overseas")}
              />
            </div>
            {cfg.region === "overseas" && (
              <p className="mt-4 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                海外档需要在 <span className="voco-mono">%APPDATA%\VoCo\.env</span> 里设置
                <span className="voco-mono"> OVERSEAS_API_KEY=...</span>，然后重启 VoCo。
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="mt-10 voco-step-fade">
            <h2 className="text-xl font-semibold">选麦克风</h2>
            <p className="mt-2 text-black/55 text-sm">
              先挑你常用的那个麦，下面录一句话试试能不能听清。
            </p>
            <div className="mt-5 relative">
              <Mic
                size={16}
                strokeWidth={2}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-black/45 pointer-events-none"
              />
              <select
                value={cfg.input_device}
                onChange={(e) => update("input_device", e.target.value)}
                className="w-full border border-black/[0.08] rounded-lg pl-9 pr-3 py-2.5 text-sm bg-white"
              >
                <option value="">系统默认</option>
                {mics.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={runTest}
              disabled={recording}
              className="mt-5 w-full bg-[#2563EB] text-white py-2.5 rounded-lg font-medium hover:bg-[#1D4ED8] transition-colors disabled:bg-black/15"
            >
              {recording ? "录音中…（3 秒）" : "录一句话试识别"}
            </button>

            {/* 5-bar level visualizer (HUD-style, but blue). Heights scale
                with audioLevel directly — silence collapses to 4px. */}
            <div className="mt-5 flex items-end justify-center gap-1.5 h-12">
              {[0, 1, 2, 3, 4].map((i) => {
                const mid = 2;
                const dist = Math.abs(i - mid) / mid;
                const shape = 1 - dist * 0.45;
                const v = Math.min(1, audioLevel);
                const h = v < 0.04 ? 4 : 4 + shape * 36 * v;
                return (
                  <div
                    key={i}
                    className="w-2.5 bg-[#2563EB] rounded-full"
                    style={{ height: h + "px" }}
                  />
                );
              })}
            </div>
            <div className="mt-1 text-center text-[11px] text-black/40">
              {recording
                ? "听到了，对着麦再说一句…"
                : audioLevel > 0.04
                  ? "麦克风工作中"
                  : "点上面按钮试一下，看条形会不会跳动"}
            </div>

            {testResult && (
              <div className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
                ✅ 识别结果: {testResult}
              </div>
            )}
            {testError && (
              <div className="mt-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                ⚠️ {testError}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="mt-10 voco-step-fade">
            <h2 className="text-xl font-semibold">快捷键</h2>
            <p className="mt-2 text-black/55 text-sm">
              点按钮 → 按一下你想用的键。之后能改。
            </p>

            {/* Visual demo of how the shortcut feels */}
            <div className="mt-5 rounded-xl bg-[#EFF6FF]/60 border border-[#2563EB]/15 px-4 py-3 flex items-center justify-center gap-3 text-[12px] text-black/65">
              按住 <Kbd>{prettyKey(cfg.trigger_polish)}</Kbd>
              <span className="text-[#2563EB]">→</span>
              说话
              <span className="text-[#2563EB]">→</span>
              松开
              <span className="text-[#2563EB]">→</span>
              <span className="text-black/85 font-medium">字自动出现</span>
            </div>

            {/* Korean IME conflict — right Alt is stolen by 한/영 toggle */}
            {koreanIme && cfg.trigger_polish === "alt_r" && (
              <div className="mt-4 flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-400/40 bg-amber-50/80">
                <AlertTriangle
                  size={18}
                  strokeWidth={2}
                  className="text-amber-600 shrink-0 mt-[2px]"
                />
                <div className="flex-1 text-[13px] leading-relaxed text-black/75">
                  <div className="font-medium text-black/85 mb-0.5">
                    检测到韩文输入法 — 右Alt 会被它截走
                  </div>
                  <div className="text-black/60">
                    韩文 IME 把右Alt 当成「韩/英」切换键，VoCo 收不到。建议改成不冲突的 F9。
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => update("trigger_polish", "f9")}
                      className="bg-[#0A0A0B] text-white px-3 py-1.5 rounded-md text-[12px] font-medium hover:bg-[#27272A] transition-colors"
                    >
                      一键切到 F9
                    </button>
                    <span className="text-[12px] text-black/40">或下方手动选</span>
                  </div>
                </div>
              </div>
            )}

            {/* Windows IME-switch conflict — Alt/Ctrl + Shift defaults */}
            {(() => {
              const isAltOrCtrl = /^(alt|ctrl)_/.test(cfg.trigger_polish);
              const isShiftMod = /^shift_/.test(cfg.trigger_translate_modifier);
              if (!(isAltOrCtrl && isShiftMod)) return null;
              return (
                <div className="mt-4 flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-400/40 bg-amber-50/80">
                  <AlertTriangle
                    size={18}
                    strokeWidth={2}
                    className="text-amber-600 shrink-0 mt-[2px]"
                  />
                  <div className="flex-1 text-[13px] leading-relaxed text-black/75">
                    <div className="font-medium text-black/85 mb-0.5">
                      {prettyKey(cfg.trigger_polish)} + {prettyKey(cfg.trigger_translate_modifier)} 跟 Windows「切换输入法」热键撞了
                    </div>
                    <div className="text-black/60">
                      按翻译时会顺便切一下输入法。把翻译附加键换成右Ctrl 就不撞了。
                    </div>
                    <div className="mt-2">
                      <button
                        onClick={() => update("trigger_translate_modifier", "ctrl_r")}
                        className="bg-[#0A0A0B] text-white px-3 py-1.5 rounded-md text-[12px] font-medium hover:bg-[#27272A] active:scale-[0.96] transition-all duration-150"
                      >
                        一键切到 右Ctrl
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-black/[0.06] bg-white">
                <div className="text-sm text-black/75">按住录音 + AI 润色</div>
                <KeyCapture
                  value={cfg.trigger_polish}
                  onChange={(v) => update("trigger_polish", v)}
                />
              </div>
              <div className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-black/[0.06] bg-white">
                <div className="text-sm text-black/75">
                  加按这个键 = 翻译模式
                </div>
                <KeyCapture
                  value={cfg.trigger_translate_modifier}
                  onChange={(v) => update("trigger_translate_modifier", v)}
                />
              </div>
              <div className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-black/[0.06] bg-white">
                <div className="text-sm text-black/75">翻译目标语言</div>
                <select
                  value={cfg.translate_target}
                  onChange={(e) => update("translate_target", e.target.value)}
                  className="border border-black/[0.08] rounded-lg px-3 py-2 min-w-[160px] text-sm bg-white"
                >
                  <option value="ko">韩语</option>
                  <option value="en">英语</option>
                  <option value="zh">中文</option>
                  <option value="ja">日语</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="mt-10 voco-step-fade text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500 grid place-items-center text-white text-3xl shadow-[0_8px_24px_-8px_rgba(16,185,129,0.5)]">
              ✓
            </div>
            <h2 className="mt-6 text-2xl font-semibold">都设置好了</h2>
            <p className="mt-3 text-black/55 text-sm leading-relaxed">
              VoCo 会一直在后台候命。需要说话时按下面这个键就行：
            </p>

            <div className="mt-6 inline-flex flex-col items-center gap-3 px-8 py-5 rounded-2xl bg-[#EFF6FF] border border-[#2563EB]/15">
              <div className="text-[12px] text-black/55">按住</div>
              <Kbd>{prettyKey(cfg.trigger_polish)}</Kbd>
              <div className="text-[12px] text-black/55">
                说话 · 松开 · 字自动写到光标
              </div>
            </div>

            <p className="mt-6 text-[12px] text-black/40 leading-relaxed">
              关掉主窗口不会退出 — VoCo 会留在任务栏托盘里。需要时左键托盘图标打开。
            </p>
          </div>
        )}

        <div className="mt-10 flex items-center justify-between">
          <button
            onClick={prev}
            disabled={step === 1}
            className="text-sm text-black/55 py-2 px-4 rounded-lg hover:bg-black/5 disabled:opacity-0"
          >
            ← 上一步
          </button>
          <button
            onClick={next}
            className="bg-[#2563EB] text-white py-2.5 px-8 rounded-lg font-medium hover:bg-[#1D4ED8] transition-colors"
          >
            {step === TOTAL_STEPS ? "开始使用" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WizardRegionCard({
  label,
  desc,
  selected,
  onSelect,
}: {
  label: string;
  desc: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "text-left p-5 rounded-xl border transition-colors " +
        (selected
          ? "border-[#2563eb] bg-[#2563eb]/[0.04] ring-1 ring-[#2563eb]/30"
          : "border-black/[0.08] hover:bg-black/[0.02]")
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium text-black/85">{label}</span>
        {selected && (
          <span className="text-[11px] text-[#2563eb] font-medium">已选</span>
        )}
      </div>
      <div className="text-[12px] text-black/55 mt-1.5">{desc}</div>
    </button>
  );
}

function Steps({
  step,
  total,
  labels,
}: {
  step: number;
  total: number;
  labels: string[];
}) {
  return (
    <div className="flex items-start justify-center gap-1">
      {Array.from({ length: total }, (_, idx) => {
        const i = idx + 1;
        const reached = i <= step;
        const active = i === step;
        return (
          <div key={i} className="flex items-start gap-1">
            <div className="flex flex-col items-center gap-2 w-14">
              <div
                className={
                  "w-7 h-7 rounded-full grid place-items-center text-xs font-medium transition-colors " +
                  (reached
                    ? "bg-[#2563EB] text-white"
                    : "bg-black/8 text-black/45")
                }
              >
                {i}
              </div>
              <div
                className={
                  "text-[11px] transition-colors text-center " +
                  (active
                    ? "text-[#2563EB] font-medium"
                    : reached
                      ? "text-black/55"
                      : "text-black/35")
                }
              >
                {labels[idx]}
              </div>
            </div>
            {i < total && (
              <div
                className={
                  "w-8 h-px mt-3.5 transition-colors " +
                  (i < step ? "bg-[#2563EB]" : "bg-black/10")
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ModeCard({
  Icon,
  title,
  desc,
}: {
  Icon: typeof FileText;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-3.5 hover:border-[#2563EB]/30 hover:shadow-[0_4px_14px_-6px_rgba(37,99,235,0.18)] transition-all">
      <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-[#2563EB]">
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="mt-2.5 text-[13px] font-medium text-black/85">{title}</div>
      <div className="mt-1 text-[11px] text-black/50 leading-relaxed">{desc}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-2.5 py-1 rounded-md border border-black/[0.12] bg-white text-[12px] font-medium text-black/75">
      {children}
    </kbd>
  );
}

function prettyKey(code: string | undefined): string {
  if (!code) return "?";
  const m: Record<string, string> = {
    alt_r: "右 Alt",
    alt_l: "左 Alt",
    ctrl_r: "右 Ctrl",
    ctrl_l: "左 Ctrl",
    shift_r: "右 Shift",
    shift_l: "左 Shift",
    caps_lock: "CapsLock",
  };
  if (m[code]) return m[code];
  if (/^f([1-9]|1[0-2])$/.test(code)) return code.toUpperCase();
  return code;
}

function codeFromKeyboardEvent(e: KeyboardEvent): string | null {
  switch (e.code) {
    case "AltRight":
      return "alt_r";
    case "AltLeft":
      return "alt_l";
    case "ControlRight":
      return "ctrl_r";
    case "ControlLeft":
      return "ctrl_l";
    case "ShiftRight":
      return "shift_r";
    case "ShiftLeft":
      return "shift_l";
    case "CapsLock":
      return "caps_lock";
    default:
      if (/^F([1-9]|1[0-2])$/.test(e.code)) return e.code.toLowerCase();
      return null;
  }
}

function KeyCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      if (e.code === "Escape") {
        setCapturing(false);
        return;
      }
      const mapped = codeFromKeyboardEvent(e);
      if (mapped) {
        onChange(mapped);
        setCapturing(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capturing, onChange]);

  return (
    <button
      onClick={() => setCapturing(true)}
      className={
        "inline-flex items-center justify-center min-w-[160px] px-3 py-2 rounded-lg text-sm font-medium transition-colors " +
        (capturing
          ? "bg-[#EFF6FF] border border-[#2563EB]/40 text-[#2563EB] animate-pulse"
          : "bg-white border border-black/[0.08] text-black/75 hover:bg-black/[0.04]")
      }
    >
      {capturing ? "请按下任意键…（Esc 取消）" : prettyKey(value)}
    </button>
  );
}

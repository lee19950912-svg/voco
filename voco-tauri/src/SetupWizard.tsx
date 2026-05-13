import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openPath } from "@tauri-apps/plugin-opener";

interface VoCoConfig {
  recognize_engine: string;
  recognize_language: string;
  polish_model: string;
  translate_model: string;
  translate_target: string;
  trigger_polish: string;
  trigger_translate_modifier: string;
  trigger_mode: string;
  input_device: string;
  first_run_completed: boolean;
  [k: string]: any;
}

interface ApiKeyStatus {
  volc: boolean;
  deepseek: boolean;
  relay: boolean;
  openai: boolean;
}

const TOTAL_STEPS = 5;

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
  const [keys, setKeys] = useState<ApiKeyStatus | null>(null);
  const [configDir, setConfigDir] = useState<string>("");

  useEffect(() => {
    invoke<string[]>("list_microphones").then(setMics).catch(() => {});
    invoke<ApiKeyStatus>("check_api_keys").then(setKeys).catch(() => {});
    invoke<string>("get_config_dir").then(setConfigDir).catch(() => {});
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

  async function refreshKeys() {
    const k = await invoke<ApiKeyStatus>("check_api_keys").catch(() => null);
    if (k) setKeys(k);
  }

  function openConfigFolder() {
    if (configDir) openPath(configDir).catch(() => {});
  }

  const allCoreKeysSet = !!keys && keys.volc && keys.deepseek;

  return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="w-[600px] p-12 rounded-2xl border border-black/[0.06] shadow-sm">
        <Steps step={step} total={TOTAL_STEPS} />

        {step === 1 && (
          <div className="mt-10">
            <img
              src="/voco-logo.png"
              alt="VoCo"
              className="w-16 h-16 mx-auto rounded-full"
              draggable={false}
            />
            <h1 className="mt-6 text-center text-2xl font-semibold">
              欢迎使用 VoCo
            </h1>
            <p className="mt-3 text-center text-black/55 text-sm leading-relaxed">
              语音输入法 — 按住快捷键说话，AI 把你说的话自动写到光标位置。
              <br />
              几步完成设置，大概 1 分钟。
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="mt-10">
            <h2 className="text-xl font-semibold">API 密钥</h2>
            <p className="mt-2 text-black/55 text-sm">
              VoCo 需要语音识别和 AI 润色的密钥才能工作。把 <code className="bg-black/5 px-1 py-0.5 rounded text-[11px]">.env</code> 文件放进下面这个文件夹：
            </p>

            <div className="mt-5 rounded-xl bg-black/[0.04] p-4 text-[12px] font-mono break-all text-black/75">
              {configDir || "正在解析…"}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={openConfigFolder}
                disabled={!configDir}
                className="text-sm px-3 py-1.5 rounded-lg border border-black/15 hover:bg-black/5 disabled:opacity-40"
              >
                打开文件夹
              </button>
              <button
                onClick={refreshKeys}
                className="text-sm px-3 py-1.5 rounded-lg border border-black/15 hover:bg-black/5"
              >
                重新检查
              </button>
            </div>

            <div className="mt-6 space-y-2">
              <KeyStatus label="火山引擎语音识别" ok={!!keys?.volc} />
              <KeyStatus label="DeepSeek 润色" ok={!!keys?.deepseek} />
              <KeyStatus label="翻译服务" ok={!!(keys?.relay || keys?.openai)} optional />
            </div>

            {!allCoreKeysSet && keys && (
              <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                ⚠️ 关键密钥尚未配置，下一步的麦克风测试可能失败。
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="mt-10">
            <h2 className="text-xl font-semibold">选麦克风</h2>
            <p className="mt-2 text-black/55 text-sm">
              对着麦克风说一句话，看下面音量条是否有反应。
            </p>
            <select
              value={cfg.input_device}
              onChange={(e) => update("input_device", e.target.value)}
              className="mt-5 w-full border border-black/15 rounded-lg px-3 py-2"
            >
              <option value="">系统默认</option>
              {mics.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <button
              onClick={runTest}
              disabled={recording}
              className="mt-5 w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:bg-black/15"
            >
              {recording ? "录音中…（3 秒）" : "录一句话试识别"}
            </button>

            <div className="mt-3 h-2 bg-black/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, audioLevel * 100)}%` }}
              />
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
          <div className="mt-10">
            <h2 className="text-xl font-semibold">快捷键</h2>
            <p className="mt-2 text-black/55 text-sm">
              点下方按钮然后按一下你想用的键。可以之后再改。
            </p>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between py-3 border-b border-black/[0.06]">
                <div className="text-sm text-black/75">按住录音 + 润色</div>
                <KeyCapture
                  value={cfg.trigger_polish}
                  onChange={(v) => update("trigger_polish", v)}
                />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-black/[0.06]">
                <div className="text-sm text-black/75">加按这个键时翻译</div>
                <KeyCapture
                  value={cfg.trigger_translate_modifier}
                  onChange={(v) => update("trigger_translate_modifier", v)}
                />
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="text-sm text-black/75">翻译目标语言</div>
                <select
                  value={cfg.translate_target}
                  onChange={(e) => update("translate_target", e.target.value)}
                  className="border border-black/15 rounded-lg px-3 py-2 min-w-[160px]"
                >
                  <option value="ko">韩语</option>
                  <option value="en">英语</option>
                  <option value="zh">中文</option>
                  <option value="ja">日语</option>
                </select>
              </div>
            </div>
            <p className="mt-5 text-xs text-black/40">
              提示：右 Alt 在 Windows 默认是切换输入法的键，建议到「设置 → 时间和语言 → 输入语言热键」把那项改成「未分配」，否则每次说话会顺便切一下输入法。
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="mt-10 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500 grid place-items-center text-white text-3xl">
              ✓
            </div>
            <h2 className="mt-6 text-2xl font-semibold">设置完成</h2>
            <p className="mt-3 text-black/55 text-sm leading-relaxed">
              现在按住 <Kbd>{prettyKey(cfg.trigger_polish)}</Kbd> 说话试试 — VoCo 会把你说的话写到光标位置。
              <br />
              主窗口可以最小化到任务栏托盘，需要时再打开。
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
            className="bg-blue-600 text-white py-2.5 px-8 rounded-lg font-medium hover:bg-blue-700"
          >
            {step === TOTAL_STEPS ? "开始使用" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Steps({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, idx) => {
        const i = idx + 1;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className={
                "w-7 h-7 rounded-full grid place-items-center text-xs font-medium " +
                (i <= step ? "bg-blue-600 text-white" : "bg-black/8 text-black/45")
              }
            >
              {i}
            </div>
            {i < total && (
              <div
                className={"w-8 h-px " + (i < step ? "bg-blue-600" : "bg-black/10")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function KeyStatus({ label, ok, optional }: { label: string; ok: boolean; optional?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-black/[0.02]">
      <div className="text-sm text-black/75">
        {label}
        {optional && <span className="ml-2 text-[11px] text-black/40">（可选）</span>}
      </div>
      <span
        className={
          "text-[11px] font-medium px-2 py-0.5 rounded-full " +
          (ok
            ? "bg-emerald-100 text-emerald-700"
            : optional
              ? "bg-black/5 text-black/45"
              : "bg-red-100 text-red-700")
        }
      >
        {ok ? "已配置" : "未配置"}
      </span>
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
          ? "bg-blue-50 border border-blue-300 text-blue-700 animate-pulse"
          : "bg-white border border-black/15 text-black/75 hover:bg-black/5")
      }
    >
      {capturing ? "请按下任意键…（Esc 取消）" : prettyKey(value)}
    </button>
  );
}

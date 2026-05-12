import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

export function SetupWizard({
  onDone,
  initialCfg,
}: {
  onDone: () => void;
  initialCfg: VoCoConfig;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [cfg, setCfg] = useState<VoCoConfig>(initialCfg);
  const [mics, setMics] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  useEffect(() => {
    invoke<string[]>("list_microphones").then(setMics).catch(() => {});
  }, []);

  // Subscribe to HUD events so we can show recording feedback in-wizard.
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
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  async function next() {
    if (step === 4) {
      const final = { ...cfg, first_run_completed: true };
      await invoke("save_config", { cfg: final });
      onDone();
      return;
    }
    setStep((step + 1) as 1 | 2 | 3 | 4);
  }

  async function update<K extends keyof VoCoConfig>(k: K, v: VoCoConfig[K]) {
    const next = { ...cfg, [k]: v };
    setCfg(next);
    await invoke("save_config", { cfg: next });
  }

  async function runTest() {
    setTestResult("");
    invoke("manual_recognize", { mode: "polish" }).catch((e) => setTestResult(`错误: ${e}`));
  }

  return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="w-[560px] p-12 rounded-2xl border border-black/[0.06] shadow-sm">
        <Steps step={step} />

        {step === 1 && (
          <div className="mt-10">
            <div className="w-16 h-16 mx-auto rounded-full bg-black grid place-items-center text-white text-2xl font-bold">
              V
            </div>
            <h1 className="mt-6 text-center text-2xl font-semibold">
              欢迎使用 VoCo
            </h1>
            <p className="mt-3 text-center text-black/55 text-sm leading-relaxed">
              语音输入法 — 按住快捷键说话，AI 把你说的话自动写到光标位置。
              <br />
              3 步完成设置，大概 30 秒。
            </p>
          </div>
        )}

        {step === 2 && (
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
              {recording ? "录音中…" : "录一句话试识别（3 秒）"}
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
          </div>
        )}

        {step === 3 && (
          <div className="mt-10">
            <h2 className="text-xl font-semibold">快捷键</h2>
            <p className="mt-2 text-black/55 text-sm">
              VoCo 用以下快捷键，你可以之后改：
            </p>
            <div className="mt-5 space-y-3">
              <KeyRow label="按住录音 + 润色" value={prettyKey(cfg.trigger_polish)} />
              <KeyRow
                label="加按这个键时翻译"
                value={prettyKey(cfg.trigger_translate_modifier)}
              />
              <KeyRow label="翻译目标语言" value={cfg.translate_target === "ko" ? "韩语" : cfg.translate_target} />
            </div>
            <p className="mt-5 text-xs text-black/40">
              提示：右 Alt + 右 Shift 在 Windows 默认是切换输入法，建议先到「设置 → 时间和语言 → 输入语言热键」改成「未分配」。
            </p>
          </div>
        )}

        {step === 4 && (
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

        <div className="mt-10 flex justify-end">
          <button
            onClick={next}
            className="bg-blue-600 text-white py-2.5 px-8 rounded-lg font-medium hover:bg-blue-700"
          >
            {step === 4 ? "开始使用" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Steps({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className={
              "w-7 h-7 rounded-full grid place-items-center text-xs font-medium " +
              (i <= step
                ? "bg-blue-600 text-white"
                : "bg-black/8 text-black/45")
            }
          >
            {i}
          </div>
          {i < 4 && (
            <div
              className={
                "w-12 h-px " + (i < step ? "bg-blue-600" : "bg-black/10")
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}

function KeyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-black/[0.06] last:border-b-0">
      <div className="text-sm text-black/75">{label}</div>
      <Kbd>{value}</Kbd>
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
  return m[code] || code;
}

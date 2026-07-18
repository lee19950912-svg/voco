import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, ChevronRight, Loader2, Check, X } from "lucide-react";
import type { VoCoConfig } from "./types";

// Shared "bring your own key" form — used by both the settings page and the
// setup wizard so the two never drift. Renders the chat endpoint (address /
// key / model) plus an optional collapsible ASR override, and a "test
// connection" button that round-trips a tiny chat request to the backend.
export function ApiKeyFields({
  cfg,
  update,
}: {
  cfg: VoCoConfig;
  update: <K extends keyof VoCoConfig>(k: K, v: VoCoConfig[K]) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(
    !!(cfg.asr_base_url || cfg.asr_key),
  );
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; msg: string }>(
    null,
  );

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      // Tauri maps snake_case command args to camelCase on the JS side.
      await invoke("test_api", {
        baseUrl: cfg.api_base_url,
        apiKey: cfg.api_key,
        model: cfg.chat_model,
      });
      setResult({ ok: true, msg: "连接正常" });
    } catch (e) {
      setResult({ ok: false, msg: friendlyTestError(String(e)) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field label="服务地址">
        <input
          type="text"
          value={cfg.api_base_url}
          onChange={(e) => update("api_base_url", e.target.value)}
          placeholder="https://api.openai.com/v1"
          spellCheck={false}
          className={INPUT}
        />
      </Field>

      <Field label="API Key">
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={cfg.api_key}
            onChange={(e) => update("api_key", e.target.value)}
            placeholder="sk-..."
            spellCheck={false}
            className={INPUT + " pr-10"}
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 hover:text-black/70"
            aria-label={showKey ? "隐藏 Key" : "显示 Key"}
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>

      <Field label="聊天模型">
        <input
          type="text"
          value={cfg.chat_model}
          onChange={(e) => update("chat_model", e.target.value)}
          placeholder="gpt-4o-mini"
          spellCheck={false}
          className={INPUT}
        />
      </Field>

      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="flex items-center gap-1 text-[12px] text-black/50 hover:text-black/75 pt-1"
      >
        <ChevronRight
          size={14}
          className={"transition-transform " + (showAdvanced ? "rotate-90" : "")}
        />
        语音识别用不同的地址？（高级，可不管）
      </button>

      {showAdvanced && (
        <div className="ml-1.5 border-l-2 border-black/[0.06] pl-3 space-y-3">
          <Field label="识别地址">
            <input
              type="text"
              value={cfg.asr_base_url}
              onChange={(e) => update("asr_base_url", e.target.value)}
              placeholder="留空 = 跟上面服务地址一样"
              spellCheck={false}
              className={INPUT}
            />
          </Field>
          <Field label="识别 Key">
            <input
              type="password"
              value={cfg.asr_key}
              onChange={(e) => update("asr_key", e.target.value)}
              placeholder="留空 = 跟上面 Key 一样"
              spellCheck={false}
              className={INPUT}
            />
          </Field>
          <Field label="识别模型">
            <input
              type="text"
              value={cfg.asr_model}
              onChange={(e) => update("asr_model", e.target.value)}
              placeholder="gpt-4o-mini-transcribe"
              spellCheck={false}
              className={INPUT}
            />
          </Field>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={runTest}
          disabled={testing || !cfg.api_key.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white border border-black/[0.1] text-black/75 hover:bg-black/[0.03] disabled:opacity-40 transition-colors"
        >
          {testing && <Loader2 size={15} className="animate-spin" />}
          测试连接
        </button>
        {result && (
          <span
            className={
              "inline-flex items-center gap-1.5 text-[13px] " +
              (result.ok ? "text-emerald-600" : "text-red-600")
            }
          >
            {result.ok ? <Check size={15} /> : <X size={15} />}
            {result.msg}
          </span>
        )}
      </div>
    </div>
  );
}

const INPUT =
  "w-full border border-black/[0.1] rounded-lg px-3 py-2 text-sm bg-white voco-mono focus:outline-none focus:border-[#2563EB]/60 transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] text-black/55 mb-1">{label}</span>
      {children}
    </label>
  );
}

// Turn a raw backend error into a short, human line. The full error is only
// this useful on the most common misconfigurations; anything else we truncate.
function friendlyTestError(err: string): string {
  const s = err.toLowerCase();
  if (s.includes("401") || s.includes("unauthorized") || s.includes("api key"))
    return "Key 不对或没权限";
  if (s.includes("403")) return "这个 Key 没有该模型的权限";
  if (s.includes("404") || s.includes("not found"))
    return "地址或模型名不对";
  if (
    s.includes("connect") ||
    s.includes("timeout") ||
    s.includes("timed out") ||
    s.includes("dns") ||
    s.includes("resolve")
  )
    return "连不上这个地址（检查网络 / 地址是否正确）";
  return "连接失败：" + err.slice(0, 80);
}

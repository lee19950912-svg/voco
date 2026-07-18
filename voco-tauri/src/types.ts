// Single source of truth for backend-shared types. If you change a field here,
// match it in src-tauri/src/config.rs (AppConfig) and stats.rs (Session/Stats).

export interface VoCoConfig {
  recognize_language: string;
  // AI service (OpenAI-compatible, bring-your-own-key). The chat endpoint
  // drives polish + translate; the asr_* fields fall back to it when blank.
  api_base_url: string;
  api_key: string;
  chat_model: string;
  asr_base_url: string;
  asr_key: string;
  asr_model: string;
  translate_target: string;
  trigger_polish: string;
  trigger_translate_modifier: string;
  trigger_mode: string;
  ui_language: string;
  input_device: string;
  first_run_completed: boolean;
  mute_others_while_recording: boolean;
  sound_enabled: boolean;
  sound_volume: number;
  default_action?: string;
}

export interface VoCoResult {
  raw: string;
  text: string;
  mode: string;
}

export interface Session {
  at: string;
  mode: string;
  raw: string;
  text: string;
  translate_target: string | null;
  duration_ms: number;
  app_name?: string | null;
  window_title?: string | null;
}

export interface VoCoStats {
  total_sessions: number;
  total_chars: number;
  today_chars: number;
  translate_count: number;
}

export interface ApiKeyStatus {
  chat: boolean;
  asr: boolean;
}

export interface DictEntry {
  term: string;
  note: string;
}

// Languages exposed in the translation-target dropdown (settings page + setup
// wizard). Keep ISO codes — they flow through to the Rust side
// (ai.rs::lang_name) and into prompt strings. Order matches how a Chinese
// user typically picks targets: native, neighbors, business EU, frontier
// trade markets.
export const TRANSLATION_TARGETS: { code: string; label: string }[] = [
  { code: "zh", label: "中文" },
  { code: "en", label: "英语" },
  { code: "ja", label: "日语" },
  { code: "ko", label: "韩语" },
  { code: "fr", label: "法语" },
  { code: "de", label: "德语" },
  { code: "es", label: "西班牙语" },
  { code: "ru", label: "俄语" },
  { code: "pt", label: "葡萄牙语" },
  { code: "it", label: "意大利语" },
  { code: "th", label: "泰语" },
  { code: "vi", label: "越南语" },
  { code: "ar", label: "阿拉伯语" },
  { code: "hi", label: "印地语" },
  { code: "tr", label: "土耳其语" },
  { code: "id", label: "印尼语" },
  { code: "ms", label: "马来语" },
];

export const TRANSLATION_TARGET_LABEL: Record<string, string> =
  Object.fromEntries(TRANSLATION_TARGETS.map((t) => [t.code, t.label]));

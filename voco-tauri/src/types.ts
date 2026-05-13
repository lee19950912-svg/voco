// Single source of truth for backend-shared types. If you change a field here,
// match it in src-tauri/src/config.rs (AppConfig) and stats.rs (Session/Stats).

export interface VoCoConfig {
  recognize_engine: string;
  recognize_language: string;
  polish_engine: string;
  polish_base_url: string;
  polish_model: string;
  translate_engine: string;
  translate_base_url: string;
  translate_model: string;
  translate_target: string;
  trigger_polish: string;
  trigger_translate_modifier: string;
  trigger_mode: string;
  ui_language: string;
  input_device: string;
  first_run_completed: boolean;
  mute_others_while_recording: boolean;
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
}

export interface VoCoStats {
  total_sessions: number;
  total_chars: number;
  today_chars: number;
  translate_count: number;
}

export interface ApiKeyStatus {
  volc: boolean;
  deepseek: boolean;
  relay: boolean;
  openai: boolean;
}

export interface DictEntry {
  term: string;
  note: string;
}

//! VoCo configuration — read from voco.toml + .env.
//! Replaces the YAML-based config.yaml of the PyQt prototype.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    // Recognition
    pub recognize_engine: String, // "volcengine" | "local"
    pub recognize_language: String, // "zh" | "ko"

    // Polish (DeepSeek)
    pub polish_engine: String,        // "deepseek" | "openai" | "relay"
    pub polish_base_url: String,
    pub polish_model: String,

    // Translate (OpenAI via relay)
    pub translate_engine: String,
    pub translate_base_url: String,
    pub translate_model: String,
    pub translate_target: String, // "ko" | "en" | ...

    // Hotkeys
    pub trigger_polish: String,             // "alt_r"
    pub trigger_translate_modifier: String, // "ctrl_r" — chosen over shift_r
    // because shift_r combined with alt_r/ctrl_r is Windows's default
    // "switch IME" hotkey. Defaulting to ctrl_r side-steps that conflict
    // entirely without asking users to change OS-level settings.
    pub trigger_mode: String,              // "hold" | "toggle"

    pub ui_language: String,
    pub input_device: String,
    pub first_run_completed: bool,

    /// Mute the default speakers while a recording is in progress, restore on
    /// release. Mirrors Wispr Flow's Windows default. On by default.
    pub mute_others_while_recording: bool,

    /// HUD audio cues (start / stop / processing / success / error). When
    /// disabled the HUD stays visually identical but plays nothing.
    pub sound_enabled: bool,
    /// 0.0–1.0. Multiplier applied to every cue. Default 0.7 keeps the cues
    /// audible without being startling on a quiet desk.
    pub sound_volume: f32,

    /// Where the user is — drives engine routing.
    /// "china"    → Volcengine ASR + DeepSeek polish/translate (国内直连, 中文最准)
    /// "overseas" → OpenAI ASR + GPT polish/translate (海外可达, 多语强)
    /// First-run default comes from system locale (zh-CN → china, else overseas).
    /// User can flip in Settings or wizard at any time.
    pub region: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            recognize_engine: "volcengine".into(),
            recognize_language: "zh".into(),
            polish_engine: "deepseek".into(),
            polish_base_url: "https://api.deepseek.com".into(),
            polish_model: "deepseek-v4-flash".into(),
            translate_engine: "deepseek".into(),
            translate_base_url: "https://api.deepseek.com".into(),
            translate_model: "deepseek-v4-flash".into(),
            translate_target: "ko".into(),
            trigger_polish: "alt_r".into(),
            trigger_translate_modifier: "ctrl_r".into(),
            trigger_mode: "hold".into(),
            ui_language: "zh".into(),
            input_device: String::new(),
            first_run_completed: false,
            mute_others_while_recording: true,
            sound_enabled: true,
            sound_volume: 0.7,
            region: "china".into(),
        }
    }
}

/// Where VoCo stores user config + state. On Windows this resolves to
///   %APPDATA%/VoCo/  (i.e. C:\Users\<user>\AppData\Roaming\VoCo)
pub fn config_dir() -> Result<PathBuf> {
    let base = dirs::config_dir().context("can't resolve user config dir")?;
    let p = base.join("VoCo");
    std::fs::create_dir_all(&p)?;
    Ok(p)
}

pub fn config_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("voco.toml"))
}

impl AppConfig {
    pub fn load() -> Result<Self> {
        let path = config_path()?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let text = std::fs::read_to_string(&path)?;
        // We use serde_yaml here since the legacy Python config used YAML; TOML
        // would be cleaner but yaml lets users with old configs port over.
        let mut cfg: Self = serde_yaml::from_str(&text).unwrap_or_default();
        // One-shot migration: existing users on the slow polish-pro default
        // (1-2s/call, painful across cross-border RTT) get bumped to flash
        // (300-800ms). Short-form polish quality is indistinguishable between
        // the two. Translation already defaults to flash, so this just makes
        // both AI steps consistent.
        if cfg.polish_model == "deepseek-v4-pro" {
            cfg.polish_model = "deepseek-v4-flash".into();
            let _ = cfg.save();
            tracing::info!("config: migrated polish_model from v4-pro to v4-flash for latency");
        }
        // One-shot migration: users who configured "overseas" against the
        // yunwu.ai relay during dev get auto-migrated to OpenAI direct.
        // yunwu's per-model permission system caused too much friction
        // (long 429 saturations, separate keys per model group). Direct
        // OpenAI is simpler: one key, no upstream pool issues.
        if cfg.region == "overseas"
            && (cfg.polish_base_url.contains("yunwu.ai")
                || cfg.translate_base_url.contains("yunwu.ai"))
        {
            cfg.apply_region();
            let _ = cfg.save();
            tracing::info!("config: migrated overseas base_url from yunwu.ai to api.openai.com");
        }
        Ok(cfg)
    }

    pub fn save(&self) -> Result<()> {
        let path = config_path()?;
        let text = serde_yaml::to_string(self)?;
        std::fs::write(&path, text)?;
        Ok(())
    }

    /// Rewrite every AI/ASR engine field to match `self.region`. Idempotent.
    /// This is the single source of truth — the frontend never sets engine
    /// internals directly, it only flips `region` and lets this method
    /// cascade. Called from `save_config` so a region flip in Settings
    /// instantly retargets everything.
    pub fn apply_region(&mut self) {
        match self.region.as_str() {
            "overseas" => {
                // OpenAI direct (api.openai.com/v1). One key covers ASR
                // + chat (unlike per-model relays). Same base URL for both
                // /audio/transcriptions and /chat/completions endpoints.
                let openai = "https://api.openai.com/v1".to_string();
                self.recognize_engine = "openai".into();
                self.polish_engine = "openai".into();
                self.polish_base_url = openai.clone();
                self.polish_model = "gpt-4o-mini".into();
                self.translate_engine = "openai".into();
                self.translate_base_url = openai;
                self.translate_model = "gpt-4o-mini".into();
            }
            _ => {
                // Default: 国内引擎. Empty/unknown region falls here too so
                // legacy configs (missing the field) keep working.
                self.recognize_engine = "volcengine".into();
                self.polish_engine = "deepseek".into();
                self.polish_base_url = "https://api.deepseek.com".into();
                self.polish_model = "deepseek-v4-flash".into();
                self.translate_engine = "deepseek".into();
                self.translate_base_url = "https://api.deepseek.com".into();
                self.translate_model = "deepseek-v4-flash".into();
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct ApiKeys {
    pub deepseek: String,
    pub openai: String,
    pub relay: String,
    /// Overseas relay key for ASR (/v1/audio/transcriptions). yunwu.ai
    /// scopes each key to specific model groups, so ASR and chat may need
    /// distinct keys depending on what the user bought.
    pub overseas: String,
    /// Overseas relay key for chat (/v1/chat/completions, used for polish
    /// and translate). Falls back to `overseas` if not set so single-key
    /// users (whose key covers everything) still work.
    pub overseas_chat: String,
    pub volc_app_id: String,
    pub volc_access_token: String,
    pub volc_cluster_zh: String,
    pub volc_cluster_ko: String,
}

impl ApiKeys {
    pub fn from_env() -> Self {
        let _ = dotenvy::dotenv();
        Self {
            deepseek: std::env::var("DEEPSEEK_API_KEY").unwrap_or_default(),
            openai: std::env::var("OPENAI_API_KEY").unwrap_or_default(),
            relay: std::env::var("RELAY_API_KEY").unwrap_or_default(),
            overseas: std::env::var("OVERSEAS_API_KEY").unwrap_or_default(),
            overseas_chat: std::env::var("OVERSEAS_CHAT_API_KEY").unwrap_or_default(),
            volc_app_id: std::env::var("VOLC_APP_ID").unwrap_or_default(),
            volc_access_token: std::env::var("VOLC_ACCESS_TOKEN").unwrap_or_default(),
            volc_cluster_zh: std::env::var("VOLC_CLUSTER_ZH")
                .unwrap_or_else(|_| "volcengine_input_common".into()),
            volc_cluster_ko: std::env::var("VOLC_CLUSTER_KO")
                .unwrap_or_else(|_| "volcengine_input_ko_kr".into()),
        }
    }
}

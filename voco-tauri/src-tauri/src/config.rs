//! VoCo configuration — read from voco.toml (yaml) + optional .env fallback.
//!
//! Open-source model: the user brings their own OpenAI-compatible endpoint.
//! `api_*` drives chat (polish + translate); `asr_*` drives speech-to-text and
//! falls back to the chat endpoint/key when left blank (most providers that do
//! chat also do `/audio/transcriptions`; the split is only needed when they
//! don't). Keys live in the config file and can also come from a `.env`
//! (`OPENAI_API_KEY`) for users who prefer that.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Fallbacks used whenever a field is blank. Kept as consts so the resolver
/// methods and Default stay in sync.
const DEFAULT_CHAT_BASE: &str = "https://api.openai.com/v1";
const DEFAULT_CHAT_MODEL: &str = "gpt-4o-mini";
const DEFAULT_ASR_MODEL: &str = "gpt-4o-mini-transcribe";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// ISO 639-1 language hint passed to ASR ("zh" | "ko" | ...). Empty = auto.
    pub recognize_language: String,

    // === AI service (OpenAI-compatible, bring-your-own-key) ===
    /// Chat endpoint — drives BOTH polish and translate.
    pub api_base_url: String,
    pub api_key: String,
    pub chat_model: String,
    /// ASR endpoint. Blank base_url/key fall back to the chat ones above.
    pub asr_base_url: String,
    pub asr_key: String,
    pub asr_model: String,

    pub translate_target: String, // "en" | "ko" | ...

    // Hotkeys
    pub trigger_polish: String,             // "alt_r"
    pub trigger_translate_modifier: String, // "ctrl_r" — chosen over shift_r
    // because shift_r combined with alt_r/ctrl_r is Windows's default
    // "switch IME" hotkey. Defaulting to ctrl_r side-steps that conflict
    // entirely without asking users to change OS-level settings.
    pub trigger_mode: String, // "hold" | "toggle"

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

    /// What "bare hotkey press" produces (no modifier).
    /// "polish" → run ASR + AI polish (cleaner output, ~+0.5-1s latency)
    /// "raw"    → run ASR only, paste verbatim (faster, cheaper, more
    ///            predictable; good for legal/medical/quoting scenarios).
    /// Translate is always available via the modifier key regardless.
    pub default_action: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            recognize_language: "zh".into(),
            api_base_url: DEFAULT_CHAT_BASE.into(),
            api_key: String::new(),
            chat_model: DEFAULT_CHAT_MODEL.into(),
            asr_base_url: String::new(),
            asr_key: String::new(),
            asr_model: DEFAULT_ASR_MODEL.into(),
            translate_target: "en".into(),
            trigger_polish: "alt_r".into(),
            trigger_translate_modifier: "ctrl_r".into(),
            trigger_mode: "hold".into(),
            ui_language: "zh".into(),
            input_device: String::new(),
            first_run_completed: false,
            mute_others_while_recording: true,
            sound_enabled: true,
            sound_volume: 0.7,
            default_action: "polish".into(),
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
        // serde_yaml + `#[serde(default)]` means fields dropped in the
        // open-source rework (region / engine names / per-engine urls) are
        // silently ignored when an old config is loaded, and new fields fall
        // back to Default — so upgrading users keep their hotkeys/prefs and
        // simply land on the "fill your key" state.
        let cfg: Self = serde_yaml::from_str(&text).unwrap_or_default();
        Ok(cfg)
    }

    pub fn save(&self) -> Result<()> {
        let path = config_path()?;
        let text = serde_yaml::to_string(self)?;
        std::fs::write(&path, text)?;
        Ok(())
    }

    // --- Resolved accessors: config value if set, else a sensible fallback.
    //     The engine code always goes through these so blank fields never
    //     reach the HTTP layer. ---

    /// Chat endpoint base URL (for polish + translate).
    pub fn chat_base(&self) -> String {
        let b = self.api_base_url.trim();
        if b.is_empty() {
            DEFAULT_CHAT_BASE.to_string()
        } else {
            b.to_string()
        }
    }

    /// Chat API key: config value, or `OPENAI_API_KEY` from env as a fallback
    /// for users who prefer a `.env` file.
    pub fn chat_key(&self) -> String {
        let k = self.api_key.trim();
        if !k.is_empty() {
            k.to_string()
        } else {
            std::env::var("OPENAI_API_KEY").unwrap_or_default()
        }
    }

    pub fn chat_model(&self) -> String {
        let m = self.chat_model.trim();
        if m.is_empty() {
            DEFAULT_CHAT_MODEL.to_string()
        } else {
            m.to_string()
        }
    }

    /// ASR endpoint — falls back to the chat endpoint when not split off.
    pub fn asr_base(&self) -> String {
        let b = self.asr_base_url.trim();
        if b.is_empty() {
            self.chat_base()
        } else {
            b.to_string()
        }
    }

    pub fn asr_key(&self) -> String {
        let k = self.asr_key.trim();
        if !k.is_empty() {
            k.to_string()
        } else {
            self.chat_key()
        }
    }

    pub fn asr_model(&self) -> String {
        let m = self.asr_model.trim();
        if m.is_empty() {
            DEFAULT_ASR_MODEL.to_string()
        } else {
            m.to_string()
        }
    }
}

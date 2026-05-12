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
    pub trigger_polish: String,            // "alt_r"
    pub trigger_translate_modifier: String, // "shift_r"
    pub trigger_mode: String,              // "hold" | "toggle"

    pub ui_language: String,
    pub input_device: String,
    pub first_run_completed: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            recognize_engine: "volcengine".into(),
            recognize_language: "zh".into(),
            polish_engine: "deepseek".into(),
            polish_base_url: "https://api.deepseek.com".into(),
            polish_model: "deepseek-v4-pro".into(),
            translate_engine: "relay".into(),
            translate_base_url: "https://api.bltcy.ai/v1".into(),
            translate_model: "gpt-4.1-mini".into(),
            translate_target: "ko".into(),
            trigger_polish: "alt_r".into(),
            trigger_translate_modifier: "shift_r".into(),
            trigger_mode: "hold".into(),
            ui_language: "zh".into(),
            input_device: String::new(),
            first_run_completed: false,
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
        let cfg: Self = serde_yaml::from_str(&text).unwrap_or_default();
        Ok(cfg)
    }

    pub fn save(&self) -> Result<()> {
        let path = config_path()?;
        let text = serde_yaml::to_string(self)?;
        std::fs::write(&path, text)?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct ApiKeys {
    pub deepseek: String,
    pub openai: String,
    pub relay: String,
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
            volc_app_id: std::env::var("VOLC_APP_ID").unwrap_or_default(),
            volc_access_token: std::env::var("VOLC_ACCESS_TOKEN").unwrap_or_default(),
            volc_cluster_zh: std::env::var("VOLC_CLUSTER_ZH")
                .unwrap_or_else(|_| "volcengine_input_common".into()),
            volc_cluster_ko: std::env::var("VOLC_CLUSTER_KO")
                .unwrap_or_else(|_| "volcengine_input_ko_kr".into()),
        }
    }
}

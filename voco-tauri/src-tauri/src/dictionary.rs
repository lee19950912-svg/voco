//! User-managed glossary of proper nouns / domain terms.
//!
//! Stored at %APPDATA%/VoCo/dictionary.json. We inject the term list as a
//! hint into the DeepSeek polish system prompt — if ASR misrecognizes a
//! known term (e.g., 公司名、人名), the polisher gets a chance to correct it.

use crate::config::config_dir;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictEntry {
    pub term: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Dictionary {
    #[serde(default)]
    pub entries: Vec<DictEntry>,
}

fn dict_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("dictionary.json"))
}

impl Dictionary {
    pub fn load() -> Self {
        match dict_path().and_then(|p| {
            if !p.exists() {
                return Ok(Dictionary::default());
            }
            let text = std::fs::read_to_string(p)?;
            Ok(serde_json::from_str(&text).unwrap_or_default())
        }) {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!("dictionary load failed: {e}");
                Dictionary::default()
            }
        }
    }

    pub fn save(&self) -> Result<()> {
        let path = dict_path()?;
        let text = serde_json::to_string_pretty(self)?;
        std::fs::write(path, text)?;
        Ok(())
    }

    /// Render as a hint to inject into the polish prompt. Returns None if
    /// the dictionary is empty — caller skips the injection.
    pub fn polish_hint(&self) -> Option<String> {
        let terms: Vec<&str> = self
            .entries
            .iter()
            .map(|e| e.term.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if terms.is_empty() {
            return None;
        }
        Some(format!(
            "用户自定义术语表：{}。\n如果识别文本里出现与这些词发音相近但写法不同的词，优先采用术语表里的写法。",
            terms.join("、")
        ))
    }
}

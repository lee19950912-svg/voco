//! User-managed glossary of proper nouns / domain terms.
//!
//! Stored at %APPDATA%/VoCo/dictionary.json. We inject the term list as a
//! hint into the polish system prompt — if ASR misrecognizes a
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
    /// Wording is intentionally strong / imperative because the model tends
    /// to soft-pedal "preferences" — we want strict replacement.
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
            "【词典强制规则·最高优先级】\n\
            下列是用户自定义的专有名词，必须按这里的写法精确输出：{terms}\n\
            检测规则：如果识别文本里出现与这些词读音相同/相近但字不同的版本（例如：飞数 → 飞书、力在容 → 李在镕、周鸿一 → 周鸿祎），必须强制替换成词典里的写法，不要保留原识别版本。\n\
            优先级：这条规则优先于其他任何润色指令——即使输入看起来已经干净，只要包含词典词的近音错字，也必须改。",
            terms = terms.join("、")
        ))
    }

    /// Same hint but worded for the translate flow: tell the translator to
    /// preserve these proper nouns and treat any near-homophone variant as a
    /// recognition error before translating.
    pub fn translate_hint(&self) -> Option<String> {
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
            "【词典·专有名词必保留】\n\
            下列是用户自定义的专有名词：{terms}\n\
            如果识别文本里出现与这些词读音相同/相近但字不同的版本，先在心里把它纠正回词典里的写法，再翻译。\n\
            翻译结果中遇到这些专有名词时：如果目标语言有官方译名（公司/产品/人名），用官方译名；没有则按发音音译，绝不要意译或替换。",
            terms = terms.join("、")
        ))
    }
}

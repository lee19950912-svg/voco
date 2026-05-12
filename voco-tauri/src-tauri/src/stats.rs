//! Session history + aggregate stats persistence.
//!
//! Mirrors the Python `stats.py` JSON files but in one combined file at
//! %APPDATA%/VoCo/history.json. Reads/writes are best-effort — a corrupt or
//! missing file just resets to defaults so the UI never crashes.

use crate::config::config_dir;
use anyhow::Result;
use chrono::{DateTime, Local, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const MAX_KEEP: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub at: DateTime<Utc>,
    pub mode: String,
    pub raw: String,
    pub text: String,
    pub translate_target: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct History {
    pub sessions: Vec<Session>,
}

fn history_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("history.json"))
}

impl History {
    pub fn load() -> Self {
        match history_path().and_then(|p| {
            if !p.exists() {
                return Ok(History::default());
            }
            let text = std::fs::read_to_string(p)?;
            Ok(serde_json::from_str(&text).unwrap_or_default())
        }) {
            Ok(h) => h,
            Err(e) => {
                tracing::warn!("history load failed: {e}");
                History::default()
            }
        }
    }

    pub fn save(&self) -> Result<()> {
        let path = history_path()?;
        let text = serde_json::to_string_pretty(self)?;
        std::fs::write(path, text)?;
        Ok(())
    }

    pub fn push(&mut self, session: Session) {
        self.sessions.push(session);
        // Trim oldest if we go over the cap. Cheap because sessions is small.
        if self.sessions.len() > MAX_KEEP {
            let drop = self.sessions.len() - MAX_KEEP;
            self.sessions.drain(0..drop);
        }
    }
}

#[derive(Debug, Default, Clone, Serialize)]
pub struct Stats {
    pub total_sessions: usize,
    pub total_chars: usize,
    pub today_chars: usize,
    pub translate_count: usize,
}

impl Stats {
    pub fn compute(history: &History) -> Self {
        let today = Local::now().date_naive();
        let mut s = Stats::default();
        for sess in &history.sessions {
            s.total_sessions += 1;
            s.total_chars += sess.text.chars().count();
            if sess.at.with_timezone(&Local).date_naive() == today {
                s.today_chars += sess.text.chars().count();
            }
            if sess.mode == "translate" {
                s.translate_count += 1;
            }
        }
        s
    }
}

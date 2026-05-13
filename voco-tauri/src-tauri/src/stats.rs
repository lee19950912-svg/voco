//! Session history + aggregate stats persistence.
//!
//! Storage layout in %APPDATA%/VoCo/:
//!   history.dat   — DPAPI-encrypted JSON (current)
//!   history.json  — legacy plain JSON (auto-migrated on first save, then
//!                   deleted)
//!
//! Reads/writes are best-effort — a corrupt or missing file just resets to
//! defaults so the UI never crashes. The history contains user voice
//! transcripts and is treated as sensitive: only the current Windows user
//! on this machine can decrypt it.

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

fn encrypted_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("history.dat"))
}

fn legacy_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("history.json"))
}

impl History {
    pub fn load() -> Self {
        // 1. Try the encrypted current-format file.
        #[cfg(windows)]
        {
            if let Ok(p) = encrypted_path() {
                if p.exists() {
                    match std::fs::read(&p)
                        .map_err(anyhow::Error::from)
                        .and_then(|bytes| crate::history_crypt::decrypt(&bytes))
                    {
                        Ok(plain) => match serde_json::from_slice::<History>(&plain) {
                            Ok(h) => return h,
                            Err(e) => tracing::warn!("history parse failed: {e}"),
                        },
                        Err(e) => tracing::warn!("history decrypt failed: {e}"),
                    }
                }
            }
        }

        // 2. Fall back to the legacy plain-JSON file. First save will migrate
        //    it to the encrypted format and delete this one.
        if let Ok(p) = legacy_path() {
            if p.exists() {
                if let Ok(text) = std::fs::read_to_string(&p) {
                    if let Ok(h) = serde_json::from_str::<History>(&text) {
                        return h;
                    }
                }
            }
        }

        History::default()
    }

    pub fn save(&self) -> Result<()> {
        let json = serde_json::to_vec(self)?;

        #[cfg(windows)]
        {
            let encrypted = crate::history_crypt::encrypt(&json)?;
            let path = encrypted_path()?;
            std::fs::write(&path, &encrypted)?;
            // Drop the legacy plain file after a successful encrypted write
            // so it doesn't sit on disk in plaintext forever after upgrade.
            if let Ok(legacy) = legacy_path() {
                let _ = std::fs::remove_file(legacy);
            }
        }
        // Non-Windows builds keep the old plain-JSON path. The whole app is
        // Windows-only, so this branch only exists to keep `cargo check`
        // clean on dev machines.
        #[cfg(not(windows))]
        {
            let path = legacy_path()?;
            std::fs::write(&path, &json)?;
        }

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

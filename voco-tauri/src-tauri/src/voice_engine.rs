//! VoCo voice engine — orchestrates the full press→release flow.
//!
//! Lifecycle of one recording (mirrors Python `voice_engine.py`):
//!   1. start_recording()   — right-Alt pressed: open mic, emit hud:listening
//!   2. (audio level emitter pumps level → frontend HUD waveform)
//!   3. stop_and_process()  — right-Alt released: drain mic to WAV, emit hud:processing,
//!      spawn ASR + polish/translate + paste pipeline
//!   4. emit hud:hidden once the paste completes
//!
//! processing_lock serializes step 3's pipeline so two quick utterances always
//! paste in the order the user spoke (matches the Python fix).

use crate::ai::AiClient;
use crate::audio::RecordingSession;
use crate::config::{ApiKeys, AppConfig};
use crate::paste::paste_text;
use crate::stats::{History, Session};
use crate::volc_asr::{recognize as volc_recognize, VolcConfig};

use chrono::Utc;
use std::time::Instant;

use anyhow::{anyhow, Result};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

#[derive(Serialize, Clone)]
pub struct StatePayload {
    pub state: &'static str,
}

#[derive(Serialize, Clone)]
pub struct LevelPayload {
    pub level: f32,
}

#[derive(Serialize, Clone)]
pub struct ResultPayload {
    pub raw: String,
    pub text: String,
    pub mode: String,
}

#[derive(Serialize, Clone)]
pub struct ErrorPayload {
    pub message: String,
}

pub struct VoiceEngine {
    recorder: Arc<Mutex<Option<RecordingSession>>>,
    level_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    processing_lock: Arc<Mutex<()>>,
}

impl VoiceEngine {
    pub fn new() -> Self {
        Self {
            recorder: Arc::new(Mutex::new(None)),
            level_task: Arc::new(Mutex::new(None)),
            processing_lock: Arc::new(Mutex::new(())),
        }
    }

    pub async fn start_recording(&self, app: &AppHandle) -> Result<()> {
        let cfg = AppConfig::load().unwrap_or_default();
        let device_name = cfg.input_device.clone();

        // Drop any lingering session before opening a new one.
        {
            let mut slot = self.recorder.lock().await;
            slot.take();
        }

        // RecordingSession::start is sync (spawns its own thread + blocks
        // until the cpal stream is ready). Run on spawn_blocking so we don't
        // freeze the tokio worker for 100~300ms.
        let device_name_owned = device_name.clone();
        let rec = tokio::task::spawn_blocking(move || RecordingSession::start(&device_name_owned))
            .await
            .map_err(|e| anyhow!("启动录音任务出错: {e}"))?
            .map_err(|e| anyhow!("打开麦克风失败: {e}"))?;
        *self.recorder.lock().await = Some(rec);

        // HUD: show + listening state.
        let _ = app.emit("hud:state", StatePayload { state: "listening" });
        let _ = show_hud(app);

        // Pump audio levels to HUD at ~20 Hz.
        let recorder_arc = self.recorder.clone();
        let app_handle = app.clone();
        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_millis(50));
            loop {
                interval.tick().await;
                let lvl_opt = {
                    let guard = recorder_arc.lock().await;
                    guard.as_ref().map(|r| r.current_level())
                };
                match lvl_opt {
                    Some(lvl) => {
                        let _ = app_handle.emit("hud:level", LevelPayload { level: lvl });
                    }
                    None => break,
                }
            }
        });
        *self.level_task.lock().await = Some(handle);
        Ok(())
    }

    pub async fn stop_and_process(&self, app: &AppHandle, mode: &str) -> Result<()> {
        // Stop the level pump.
        if let Some(task) = self.level_task.lock().await.take() {
            task.abort();
        }

        // Take the recorder out and drain to WAV.
        let rec = self.recorder.lock().await.take();
        let Some(rec) = rec else {
            return Ok(());
        };
        // stop_to_wav blocks briefly waiting for the recorder thread to send
        // its samples — do it on spawn_blocking.
        let wav_bytes = match tokio::task::spawn_blocking(move || rec.stop_to_wav()).await {
            Ok(Ok(b)) => b,
            Ok(Err(e)) => {
                let _ = app.emit("hud:state", StatePayload { state: "hidden" });
                let _ = hide_hud(app);
                return Err(e);
            }
            Err(e) => return Err(anyhow!("stop_to_wav join error: {e}")),
        };

        let _ = app.emit("hud:state", StatePayload { state: "processing" });

        // Run pipeline on a serialized task.
        let lock = self.processing_lock.clone();
        let app_for_task = app.clone();
        let mode = mode.to_string();
        let started = Instant::now();
        tokio::spawn(async move {
            let _guard = lock.lock().await;
            match process_pipeline(wav_bytes, &mode).await {
                Ok(outcome) => {
                    let (payload, warn_msg) = match outcome {
                        PipelineOutcome::Ok(p) => (p, None),
                        PipelineOutcome::Warning { payload, message } => (payload, Some(message)),
                    };
                    // Persist session to history before broadcasting result.
                    let cfg = AppConfig::load().unwrap_or_default();
                    let session = Session {
                        at: Utc::now(),
                        mode: payload.mode.clone(),
                        raw: payload.raw.clone(),
                        text: payload.text.clone(),
                        translate_target: if payload.mode == "translate" {
                            Some(cfg.translate_target.clone())
                        } else {
                            None
                        },
                        duration_ms: started.elapsed().as_millis() as u64,
                    };
                    let mut h = History::load();
                    h.push(session);
                    let _ = h.save();
                    let _ = app_for_task.emit("voco:result", payload);
                    if let Some(msg) = warn_msg {
                        let _ = app_for_task.emit("voco:error", ErrorPayload { message: msg });
                    }
                }
                Err(e) => {
                    tracing::warn!("pipeline failed: {e}");
                    let _ = app_for_task.emit(
                        "voco:error",
                        ErrorPayload {
                            message: e.to_string(),
                        },
                    );
                }
            }
            let _ = app_for_task.emit("hud:state", StatePayload { state: "hidden" });
            let _ = hide_hud(&app_for_task);
        });

        Ok(())
    }
}

/// Outcome of the pipeline. `Warning` means we still got something usable for
/// the user (raw text pasted) but a downstream step failed — so the UI should
/// show a soft warning alongside the result instead of a hard error.
pub enum PipelineOutcome {
    Ok(ResultPayload),
    Warning {
        payload: ResultPayload,
        message: String,
    },
}

async fn process_pipeline(wav_bytes: Vec<u8>, mode: &str) -> Result<PipelineOutcome> {
    let cfg = AppConfig::load()?;
    let keys = ApiKeys::from_env();

    // Pre-flight: missing core ASR keys is a hard error — don't bother recording further.
    if keys.volc_app_id.is_empty() || keys.volc_access_token.is_empty() {
        return Err(anyhow!(
            "未配置火山引擎语音识别密钥，请在设置中填写后再试。"
        ));
    }

    let volc = VolcConfig {
        appid: keys.volc_app_id,
        token: keys.volc_access_token,
        cluster_zh: keys.volc_cluster_zh,
        cluster_ko: keys.volc_cluster_ko,
        language: cfg.recognize_language.clone(),
    };
    let raw_text = volc_recognize(&volc, &wav_bytes).await?;

    // Empty recognition — most likely silence or background noise. Tell the
    // user explicitly so they don't think the app silently swallowed input.
    if raw_text.trim().is_empty() {
        return Err(anyhow!("没听清楚，请再说一遍。"));
    }

    // For polish/translate modes, if the AI step fails we still want to paste
    // the raw text so the user doesn't lose their utterance. We surface the
    // failure as a Warning.
    let mut warning: Option<String> = None;
    let final_text = match mode {
        "raw" => raw_text.clone(),
        "polish" => {
            match AiClient::new(
                &cfg.polish_base_url,
                &keys.deepseek,
                &cfg.polish_model,
                "DeepSeek 润色",
            ) {
                Ok(client) => match client.polish(&raw_text).await {
                    Ok(t) if !t.trim().is_empty() => t,
                    Ok(_) => {
                        warning = Some("润色返回为空，已使用原文。".to_string());
                        raw_text.clone()
                    }
                    Err(e) => {
                        tracing::warn!("polish failed, falling back to raw: {e}");
                        warning = Some(format!("润色失败，已使用原文：{e}"));
                        raw_text.clone()
                    }
                },
                Err(e) => {
                    tracing::warn!("polish client init failed: {e}");
                    warning = Some(format!("润色不可用，已使用原文：{e}"));
                    raw_text.clone()
                }
            }
        }
        "translate" => {
            let api_key = if cfg.translate_engine == "openai" {
                &keys.openai
            } else {
                &keys.relay
            };
            match AiClient::new(
                &cfg.translate_base_url,
                api_key,
                &cfg.translate_model,
                "OpenAI 翻译",
            ) {
                Ok(client) => match client.translate(&raw_text, &cfg.translate_target).await {
                    Ok(t) if !t.trim().is_empty() => t,
                    Ok(_) => {
                        warning = Some("翻译返回为空，已使用原文。".to_string());
                        raw_text.clone()
                    }
                    Err(e) => {
                        tracing::warn!("translate failed, falling back to raw: {e}");
                        warning = Some(format!("翻译失败，已使用原文：{e}"));
                        raw_text.clone()
                    }
                },
                Err(e) => {
                    tracing::warn!("translate client init failed: {e}");
                    warning = Some(format!("翻译不可用，已使用原文：{e}"));
                    raw_text.clone()
                }
            }
        }
        other => return Err(anyhow!("未知 mode: {}", other)),
    };

    // Paste step. If this fails the user got nothing usable — hard error.
    let to_paste = final_text.clone();
    match tokio::task::spawn_blocking(move || paste_text(&to_paste)).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            return Err(anyhow!("粘贴失败：{e}（请确保光标位于可输入位置）"));
        }
        Err(e) => return Err(anyhow!("粘贴任务异常：{e}")),
    }

    let payload = ResultPayload {
        raw: raw_text,
        text: final_text,
        mode: mode.to_string(),
    };
    Ok(match warning {
        Some(msg) => PipelineOutcome::Warning { payload, message: msg },
        None => PipelineOutcome::Ok(payload),
    })
}

fn show_hud(app: &AppHandle) -> Result<()> {
    if let Some(w) = app.get_webview_window("hud") {
        let _ = position_hud(&w);
        w.show()?;
    }
    Ok(())
}

fn hide_hud(app: &AppHandle) -> Result<()> {
    if let Some(w) = app.get_webview_window("hud") {
        w.hide()?;
    }
    Ok(())
}

fn position_hud(w: &tauri::WebviewWindow) -> Result<()> {
    use tauri::PhysicalPosition;
    let monitor = w.current_monitor()?.or(w.primary_monitor()?);
    if let Some(m) = monitor {
        let scale = m.scale_factor();
        let mon_size = m.size();
        let win_size = w
            .outer_size()
            .unwrap_or(tauri::PhysicalSize { width: 120, height: 50 });
        let x = (mon_size.width as i32 - win_size.width as i32) / 2 + m.position().x;
        let y = (mon_size.height as i32 - win_size.height as i32) - (80.0 * scale) as i32
            + m.position().y;
        let _ = w.set_position(PhysicalPosition { x, y });
    }
    Ok(())
}

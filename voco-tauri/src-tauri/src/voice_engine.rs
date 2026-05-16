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
use crate::app_context::AppContext;
use crate::audio::RecordingSession;
use crate::config::{ApiKeys, AppConfig};
use crate::dictionary::Dictionary;
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
    /// Serializes the start/stop lifecycle. start_recording holds this for
    /// the duration of mic open + slot install; stop_and_process holds it
    /// for the duration of slot drain. Prevents the "orphan session" race
    /// where a release fires before mic-open completes — without this lock,
    /// stop_and_process would see an empty slot, return early, and the mic
    /// would finish opening *after* and install an unreleasable session.
    lifecycle_lock: Arc<Mutex<()>>,
    /// Mute-state snapshot taken when recording starts. Held until
    /// stop_and_process restores it. None when no recording is active or
    /// the ducker was disabled / failed.
    #[cfg(windows)]
    duck_guard: Arc<Mutex<Option<crate::audio_ducker::DuckGuard>>>,
}

impl VoiceEngine {
    pub fn new() -> Self {
        Self {
            recorder: Arc::new(Mutex::new(None)),
            level_task: Arc::new(Mutex::new(None)),
            processing_lock: Arc::new(Mutex::new(())),
            lifecycle_lock: Arc::new(Mutex::new(())),
            #[cfg(windows)]
            duck_guard: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start_recording(&self, app: &AppHandle) -> Result<()> {
        // Held for the entire function so stop_and_process can't race us
        // and observe an empty slot mid-open. See struct doc on lifecycle_lock.
        let _lifecycle = self.lifecycle_lock.lock().await;

        // Race guard: if a session is already in progress (e.g., the user
        // hammered the hotkey, or a UI button + hotkey both fired), just
        // return. The existing session keeps running. Without this, two
        // concurrent cpal streams could open and the second one would
        // silently overwrite the first.
        {
            let slot = self.recorder.lock().await;
            if slot.is_some() {
                tracing::debug!("start_recording: session already active, ignoring duplicate");
                return Ok(());
            }
        }

        let cfg = AppConfig::load().unwrap_or_default();
        let device_name = cfg.input_device.clone();

        // Show the HUD FIRST — this is what the user perceives as "the
        // hotkey worked". The cpal mic open below blocks for 100-300ms
        // (WASAPI cold start), and previously we did it before showing the
        // HUD, so the user saw nothing for 100-300ms after pressing. The
        // human reaction gap between "seeing HUD" and "starting to speak"
        // is naturally 150-250ms, which fully covers mic-open latency —
        // first syllables aren't lost.
        let _ = app.emit("hud:state", StatePayload { state: "listening" });
        let _ = show_hud(app);

        // RecordingSession::start is sync (spawns its own thread + blocks
        // until the cpal stream is ready). Run on spawn_blocking so we don't
        // freeze the tokio worker for 100~300ms.
        let device_name_owned = device_name.clone();
        let rec = match tokio::task::spawn_blocking(move || RecordingSession::start(&device_name_owned)).await {
            Ok(Ok(r)) => r,
            Ok(Err(e)) => {
                // Mic open failed — undo the optimistic HUD show.
                let _ = app.emit("hud:state", StatePayload { state: "hidden" });
                let _ = hide_hud(app);
                return Err(anyhow!("打开麦克风失败: {e}"));
            }
            Err(e) => {
                let _ = app.emit("hud:state", StatePayload { state: "hidden" });
                let _ = hide_hud(app);
                return Err(anyhow!("启动录音任务出错: {e}"));
            }
        };

        // Re-check the slot before inserting — a parallel call could have
        // raced past the early-return above before we finished opening the
        // mic. If somehow another session is there now, drop ours.
        let mut slot = self.recorder.lock().await;
        if slot.is_some() {
            tracing::debug!("start_recording: lost race for slot, dropping new session");
            drop(rec);
            return Ok(());
        }
        *slot = Some(rec);
        drop(slot);

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

        // Audio ducking: mute speakers while recording (Wispr Flow style).
        // Failures are non-fatal — we'd rather record with audio still playing
        // than abort the whole flow.
        #[cfg(windows)]
        if cfg.mute_others_while_recording {
            let guard = tokio::task::spawn_blocking(crate::audio_ducker::duck)
                .await
                .ok()
                .and_then(|r| {
                    r.map_err(|e| tracing::warn!("audio duck failed: {e}"))
                        .ok()
                })
                .unwrap_or_else(crate::audio_ducker::DuckGuard::noop);
            *self.duck_guard.lock().await = Some(guard);
        }

        Ok(())
    }

    pub async fn stop_and_process(&self, app: &AppHandle, mode: &str) -> Result<()> {
        self.stop_and_process_with_options(app, mode, false).await
    }

    /// Same as `stop_and_process`, but `dry_run = true` skips persisting the
    /// session to history — used by the setup wizard's test recording so it
    /// doesn't pollute the user's real input history.
    pub async fn stop_and_process_with_options(
        &self,
        app: &AppHandle,
        mode: &str,
        dry_run: bool,
    ) -> Result<()> {
        // Wait for any in-flight start_recording to finish before we look at
        // the slot. Without this, a fast-tap (release before mic finishes
        // opening) leaves an orphan session that gets drained on the *next*
        // press, surfacing as code 1013 "no speech".
        let _lifecycle = self.lifecycle_lock.lock().await;

        // Stop the level pump.
        if let Some(task) = self.level_task.lock().await.take() {
            task.abort();
        }

        // Restore speakers ASAP on hotkey release — before WAV drain, ASR,
        // and paste. The user wants their music back the instant they let go.
        #[cfg(windows)]
        if let Some(guard) = self.duck_guard.lock().await.take() {
            let _ = tokio::task::spawn_blocking(move || {
                if let Err(e) = crate::audio_ducker::restore(guard) {
                    tracing::warn!("audio duck restore failed: {e}");
                }
            })
            .await;
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

        // Capture the foreground app right now — what the user was looking
        // at when they released the hotkey. The HUD is click-through and the
        // polling hotkey never steals focus, so this matches "where the
        // pasted text will land". Win32 calls are sub-ms but cfg::spawn_blocking
        // keeps us off the tokio worker just in case.
        let context = tokio::task::spawn_blocking(AppContext::capture)
            .await
            .unwrap_or_default();

        // Run pipeline on a serialized task.
        let lock = self.processing_lock.clone();
        let app_for_task = app.clone();
        let mode = mode.to_string();
        let started = Instant::now();
        tokio::spawn(async move {
            let _guard = lock.lock().await;
            match process_pipeline(wav_bytes, &mode, dry_run, context.clone()).await {
                Ok(outcome) => {
                    let (payload, warn_msg) = match outcome {
                        PipelineOutcome::Ok(p) => (p, None),
                        PipelineOutcome::Warning { payload, message } => (payload, Some(message)),
                    };
                    // Persist session to history before broadcasting result.
                    // Skipped during dry-run (wizard test) so it doesn't show
                    // up in the user's real history.
                    if !dry_run {
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
                            app_name: context.app_name.clone(),
                            window_title: context.window_title.clone(),
                        };
                        let mut h = History::load();
                        h.push(session);
                        let _ = h.save();
                    }
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

async fn process_pipeline(
    wav_bytes: Vec<u8>,
    mode: &str,
    dry_run: bool,
    context: AppContext,
) -> Result<PipelineOutcome> {
    let context_line = context.as_prompt_line();
    let cfg = AppConfig::load()?;
    let keys = ApiKeys::from_env();

    // ASR step. Route between Volcengine (国内, 中文最准) and OpenAI
    // (海外, 多语强) based on the user's region setting. Each branch is
    // responsible for its own pre-flight key check.
    let raw_text = if cfg.region == "overseas" {
        if keys.overseas.is_empty() {
            return Err(anyhow!(
                "海外档需要 OVERSEAS_API_KEY，请在 .env 里设置后重启 VoCo。"
            ));
        }
        let lang_hint = if cfg.recognize_language.is_empty() {
            None
        } else {
            Some(cfg.recognize_language.as_str())
        };
        // Share the same base_url as polish/translate — apply_region keeps
        // them in lockstep, so the user can flip "overseas" between OpenAI
        // direct / yunwu / any other relay without code changes.
        crate::openai_asr::recognize(
            &cfg.polish_base_url,
            &keys.overseas,
            &wav_bytes,
            lang_hint,
        )
        .await?
    } else {
        // 国内档：火山引擎
        if keys.volc_app_id.is_empty() || keys.volc_access_token.is_empty() {
            return Err(anyhow!(
                "未配置火山引擎语音识别密钥，请在设置中填写后再试。"
            ));
        }
        let volc = VolcConfig {
            appid: keys.volc_app_id.clone(),
            token: keys.volc_access_token.clone(),
            cluster_zh: keys.volc_cluster_zh.clone(),
            cluster_ko: keys.volc_cluster_ko.clone(),
            language: cfg.recognize_language.clone(),
        };
        // Build ASR hot words from the user's dictionary — sent optimistically
        // to v2/asr (Volcengine V3-style corpus block). If v2 strict-validates
        // and rejects the unknown field, we'd kill all recognition for users
        // with a non-empty dictionary. So: on a protocol-level error we retry
        // ONCE without the corpus. (Hotwords don't apply to OpenAI ASR.)
        let asr_hotwords = Dictionary::load().asr_hotwords();
        match volc_recognize(&volc, &wav_bytes, &asr_hotwords).await {
            Ok(t) => t,
            Err(e) if !asr_hotwords.is_empty() && {
                let s = e.to_string();
                //   - code=1013 "no valid speeches" → legitimate empty audio,
                //     retrying just doubles the user's wait for the same answer.
                //   - Any other "code=" or JSON parse trouble → maybe schema rejection.
                !s.contains("code=1013")
                    && (s.contains("code=") || s.contains("解析响应 JSON"))
            } =>
            {
                tracing::warn!(
                    "火山 ASR 带 corpus 失败（可能 v2 不接受热词字段），不带 corpus 重试一次：{e}"
                );
                volc_recognize(&volc, &wav_bytes, &[]).await?
            }
            Err(e) => return Err(e),
        }
    };

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
            let hint = Dictionary::load().polish_hint();
            // Region drives both the key picked and the label shown in
            // error messages. Engine URLs/models were already pinned to
            // the right service by apply_region() at save time.
            // For overseas: prefer the chat-specific key (yunwu scopes
            // keys per model group), fall back to the general overseas
            // key if the user only set one.
            let overseas_chat_key = if keys.overseas_chat.is_empty() {
                &keys.overseas
            } else {
                &keys.overseas_chat
            };
            let (api_key, label) = if cfg.region == "overseas" {
                (overseas_chat_key, "海外 AI 润色")
            } else {
                (&keys.deepseek, "DeepSeek 润色")
            };
            match AiClient::new(
                &cfg.polish_base_url,
                api_key,
                &cfg.polish_model,
                label,
            ) {
                Ok(client) => match client
                    .polish_with_hint(&raw_text, hint.as_deref(), context_line.as_deref())
                    .await
                {
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
            // Same region-driven key pick as polish above. Chat key
            // preferred, ASR key as single-key fallback.
            let overseas_chat_key = if keys.overseas_chat.is_empty() {
                &keys.overseas
            } else {
                &keys.overseas_chat
            };
            let (api_key, label) = if cfg.region == "overseas" {
                (overseas_chat_key, "海外 AI 翻译")
            } else {
                (&keys.deepseek, "DeepSeek 翻译")
            };
            // Dictionary also applies to translate: preserve proper nouns
            // through the translation step (e.g. "飞书" stays "飞书"/"Feishu"
            // instead of getting translated as "flying book").
            let hint = Dictionary::load().translate_hint();
            match AiClient::new(
                &cfg.translate_base_url,
                api_key,
                &cfg.translate_model,
                label,
            ) {
                Ok(client) => match client
                    .translate_with_hint(
                        &raw_text,
                        &cfg.translate_target,
                        hint.as_deref(),
                        context_line.as_deref(),
                    )
                    .await
                {
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
    // Skipped during dry-run (wizard test) since the user isn't focused on
    // a text field and pasting would go nowhere useful.
    if !dry_run {
        let to_paste = final_text.clone();
        match tokio::task::spawn_blocking(move || paste_text(&to_paste)).await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                return Err(anyhow!("粘贴失败：{e}（请确保光标位于可输入位置）"));
            }
            Err(e) => return Err(anyhow!("粘贴任务异常：{e}")),
        }
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

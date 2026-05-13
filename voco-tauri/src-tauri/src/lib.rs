//! VoCo Tauri backend — entry point.
//!
//! Modules:
//!   volc_asr        : 火山 v2/asr WebSocket recognition
//!   ai              : DeepSeek polish + OpenAI translate (chat-completions)
//!   config          : voco config (yaml) + .env API keys
//!   audio           : cpal microphone capture → WAV
//!   paste           : clipboard + Windows SendInput Ctrl+V
//!   voice_engine    : the orchestrator (press→record→release→ASR→polish→paste)
//!   polling_hotkey  : GetAsyncKeyState-based hotkey (bare Alt detection +
//!                     bypasses Korean banking-plugin hook blockers)
//!   stats           : session history + aggregate stats (json file)

mod ai;
mod audio;
mod config;
mod paste;
#[cfg(windows)]
mod polling_hotkey;
mod stats;
mod voice_engine;
mod volc_asr;

use config::AppConfig;
use stats::{History, Stats};
use voice_engine::VoiceEngine;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent,
};

// ----------------- Tauri commands -----------------

#[tauri::command]
async fn get_config() -> Result<AppConfig, String> {
    AppConfig::load().map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_config(cfg: AppConfig) -> Result<(), String> {
    cfg.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn list_microphones() -> Vec<String> {
    audio::list_input_devices()
}

#[tauri::command]
fn get_history() -> History {
    History::load()
}

#[tauri::command]
fn get_stats() -> Stats {
    Stats::compute(&History::load())
}

#[tauri::command]
fn clear_history() -> Result<(), String> {
    History::default().save().map_err(|e| e.to_string())
}

/// Where the user can drop a `.env` file to provide API keys post-install.
/// On Windows this resolves to %APPDATA%\VoCo. Returned so the wizard /
/// settings page can show users the path.
#[tauri::command]
fn get_config_dir() -> Result<String, String> {
    config::config_dir()
        .map(|p| p.display().to_string())
        .map_err(|e| e.to_string())
}

/// Reports which API keys are currently visible to the app — without
/// revealing the actual key values. Used by the setup wizard to show
/// configuration status.
#[derive(serde::Serialize)]
struct ApiKeyStatus {
    volc: bool,
    deepseek: bool,
    relay: bool,
    openai: bool,
}

#[tauri::command]
fn check_api_keys() -> ApiKeyStatus {
    let k = config::ApiKeys::from_env();
    ApiKeyStatus {
        volc: !k.volc_app_id.is_empty() && !k.volc_access_token.is_empty(),
        deepseek: !k.deepseek.is_empty(),
        relay: !k.relay.is_empty(),
        openai: !k.openai.is_empty(),
    }
}

/// Manual trigger for the recording pipeline — used by the setup wizard's
/// "record a test sample" flow. Records for 3 s, then runs the chosen mode.
/// `dry_run` skips persisting the session to history (wizard tests).
#[tauri::command]
async fn manual_recognize(
    app: AppHandle,
    state: tauri::State<'_, Arc<VoiceEngine>>,
    mode: String,
    dry_run: Option<bool>,
) -> Result<(), String> {
    state
        .start_recording(&app)
        .await
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    state
        .stop_and_process_with_options(&app, &mode, dry_run.unwrap_or(false))
        .await
        .map_err(|e| e.to_string())
}

/// Tauri-managed wrapper around the polling-hotkey stop flag, so we can flip
/// it from the RunEvent::Exit handler.
#[cfg(windows)]
struct HotkeyStop(Arc<AtomicBool>);

// ----------------- Tray icon -----------------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出 VoCo", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let _tray = TrayIconBuilder::with_id("voco-tray")
        .tooltip("VoCo — 语音输入")
        .icon(app.default_window_icon().cloned().unwrap_or_else(|| {
            // Fallback: a tiny in-memory PNG. The bundled icon file usually
            // exists, but if it doesn't, we still need *something* here.
            tauri::image::Image::new_owned(vec![0u8; 4 * 16 * 16], 16, 16)
        }))
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click toggles the main window's visibility.
            if let TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load API keys from .env, trying paths in order of preference:
    //   1. The user-writable config dir (%APPDATA%\VoCo\.env on Windows).
    //      This is what end-users get post-install — they don't have access
    //      to Program Files, so we must look in roaming AppData.
    //   2. Beside the running executable (portable install).
    //   3. Dev-time fallbacks: cwd, ../.env, ../../.env (`pnpm tauri dev`
    //      runs us from voco-tauri/, the project's .env is one level up).
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(p) = config::config_dir() {
        candidates.push(p.join(".env"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join(".env"));
        }
    }
    for rel in [".env", "../.env", "../../.env"] {
        candidates.push(std::path::PathBuf::from(rel));
    }
    for path in &candidates {
        if path.exists() {
            if let Ok(_) = dotenvy::from_path(path) {
                tracing::info!("loaded .env from: {}", path.display());
                break;
            }
        }
    }
    tracing::info!(
        "VoCo starting. DEEPSEEK_API_KEY set: {} | VOLC_APP_ID set: {}",
        !std::env::var("DEEPSEEK_API_KEY").unwrap_or_default().is_empty(),
        !std::env::var("VOLC_APP_ID").unwrap_or_default().is_empty(),
    );

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,voco=debug")),
        )
        .init();

    let engine = Arc::new(VoiceEngine::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // Note: tauri_plugin_updater is installed (Cargo.toml) but not loaded
        // here yet — it requires an [updater] config block + signing keys.
        // We'll wire it up when we have a release server to publish updates from.
        .manage(engine.clone())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            list_microphones,
            manual_recognize,
            get_history,
            get_stats,
            clear_history,
            get_config_dir,
            check_api_keys
        ])
        .setup(move |app| {
            // System tray.
            if let Err(e) = build_tray(app.handle()) {
                tracing::warn!("tray icon 创建失败: {e}");
            }

            // Bare-Alt hotkey via Windows polling (bypasses hook blockers).
            // Stash the stop signal in app state so we can flip it on Exit.
            #[cfg(windows)]
            {
                let stop = polling_hotkey::spawn(app.handle().clone(), engine.clone());
                app.manage(HotkeyStop(stop));
            }

            // Show main window — also closes the splash phase.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
            }
            // Pre-hide the HUD so the first show is instant.
            if let Some(w) = app.get_webview_window("hud") {
                let _ = w.hide();
            }

            Ok(())
        })
        // Closing the main window hides it instead of killing the app — the
        // global hotkey + tray should stay alive.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // On exit, ask the polling hotkey thread to stop. Without this it
            // keeps running for up to 20ms after the app dies and may emit
            // events into a torn-down AppHandle.
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                #[cfg(windows)]
                if let Some(stop) = app_handle.try_state::<HotkeyStop>() {
                    stop.0.store(true, Ordering::Relaxed);
                }
            }
        });
}

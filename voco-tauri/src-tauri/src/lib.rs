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

use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
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

/// Manual trigger for the recording pipeline — used by the setup wizard's
/// "record a test sample" flow. Records for 3 s, then runs the chosen mode.
#[tauri::command]
async fn manual_recognize(
    app: AppHandle,
    state: tauri::State<'_, Arc<VoiceEngine>>,
    mode: String,
) -> Result<(), String> {
    state
        .start_recording(&app)
        .await
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    state
        .stop_and_process(&app, &mode)
        .await
        .map_err(|e| e.to_string())
}

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
    // Load .env from wherever it lives — try cwd first, then walk up to find
    // it (handles `cargo run` from src-tauri/ vs `pnpm tauri dev` from root).
    let _ = dotenvy::dotenv();
    // Also try src-tauri-relative path, then voco-tauri root.
    for relative in [".env", "../.env", "../../.env"] {
        if std::path::Path::new(relative).exists() {
            let _ = dotenvy::from_path(relative);
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
            clear_history
        ])
        .setup(move |app| {
            // System tray.
            if let Err(e) = build_tray(app.handle()) {
                tracing::warn!("tray icon 创建失败: {e}");
            }

            // Bare-Alt hotkey via Windows polling (bypasses hook blockers).
            #[cfg(windows)]
            polling_hotkey::spawn(app.handle().clone(), engine.clone());

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

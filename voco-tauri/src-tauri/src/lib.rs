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
mod app_context;
mod audio;
#[cfg(windows)]
mod audio_ducker;
mod config;
mod dictionary;
#[cfg(windows)]
mod history_crypt;
#[cfg(windows)]
mod kbd_layout;
mod paste;
#[cfg(windows)]
mod polling_hotkey;
mod stats;
mod voice_engine;
mod volc_asr;

use config::AppConfig;
use dictionary::Dictionary;
use stats::{History, Stats};
use voice_engine::VoiceEngine;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent,
};

// ----------------- Tauri commands -----------------

#[tauri::command]
async fn get_config() -> Result<AppConfig, String> {
    AppConfig::load().map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_config(
    cfg: AppConfig,
    #[cfg(windows)] hotkey: tauri::State<'_, HotkeyHandlesState>,
) -> Result<(), String> {
    cfg.save().map_err(|e| e.to_string())?;
    // Tell the polling thread to pick up new hotkey / mode settings on its
    // next tick — avoids forcing the user to restart VoCo.
    #[cfg(windows)]
    hotkey.reload.store(true, Ordering::Relaxed);
    Ok(())
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
fn get_dictionary() -> Dictionary {
    Dictionary::load()
}

#[tauri::command]
fn save_dictionary(dict: Dictionary) -> Result<(), String> {
    dict.save().map_err(|e| e.to_string())
}

/// Returns true if a Korean keyboard layout is installed on this machine.
/// Drives the settings-page "Korean IME detected" banner — Korean IME
/// hardcodes Right-Alt as 한/영 toggle and will steal our hotkey.
#[tauri::command]
fn has_korean_ime() -> bool {
    #[cfg(windows)]
    {
        kbd_layout::korean_installed()
    }
    #[cfg(not(windows))]
    {
        false
    }
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

/// Tauri-managed handles to the polling-hotkey thread:
///   - `stop`: flipped on RunEvent::Exit to wind the loop down cleanly.
///   - `reload`: flipped by save_config so the loop re-reads settings
///     without an app restart.
#[cfg(windows)]
struct HotkeyHandlesState {
    stop: Arc<AtomicBool>,
    reload: Arc<AtomicBool>,
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

    // Logging: stdout (visible during `pnpm tauri dev`) PLUS a daily-rolling
    // file at %APPDATA%\VoCo\logs\voco.log.YYYY-MM-DD. The file lets us
    // diagnose problems on user machines without a console.
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,voco=debug"));

    // Keep the WorkerGuard alive for the lifetime of the process — dropping
    // it flushes pending writes and closes the file.
    let file_guard = match config::config_dir() {
        Ok(dir) => {
            let log_dir = dir.join("logs");
            let _ = std::fs::create_dir_all(&log_dir);
            let appender = tracing_appender::rolling::daily(&log_dir, "voco.log");
            let (writer, guard) = tracing_appender::non_blocking(appender);
            use tracing_subscriber::layer::SubscriberExt;
            let subscriber = tracing_subscriber::registry()
                .with(env_filter)
                .with(tracing_subscriber::fmt::layer().with_writer(std::io::stdout))
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_ansi(false)
                        .with_writer(writer),
                );
            let _ = tracing::subscriber::set_global_default(subscriber);
            Some(guard)
        }
        Err(_) => {
            tracing_subscriber::fmt().with_env_filter(env_filter).init();
            None
        }
    };
    // Leak the guard so it stays alive for the process. Cleaner than threading
    // it through the AppHandle for a daemon-style app that runs until killed.
    if let Some(g) = file_guard {
        Box::leak(Box::new(g));
    }

    let engine = Arc::new(VoiceEngine::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // Optional: open at login. The plugin exposes JS APIs (enable /
        // disable / isEnabled) that the settings page calls. We do NOT enable
        // it by default — only when the user toggles the option on.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        // Update + process plugins. The updater plugin is wired up here so the
        // settings page can offer a "Check for updates" button as soon as we
        // have a real release endpoint. Without a configured endpoint the
        // plugin simply reports "no updates available", which is fine.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            check_api_keys,
            get_dictionary,
            save_dictionary,
            has_korean_ime
        ])
        .setup(move |app| {
            // System tray. If this fails the user has no menu to quit from,
            // so emit a warning event the frontend can show.
            if let Err(e) = build_tray(app.handle()) {
                tracing::error!("tray icon 创建失败: {e}");
                let _ = app
                    .handle()
                    .emit("voco:error", voice_engine::ErrorPayload {
                        message: format!(
                            "无法创建系统托盘图标：{e}。仍可使用，但关掉窗口后不易找回。"
                        ),
                    });
            }

            // Bare-Alt hotkey via Windows polling (bypasses hook blockers).
            // Stash both signal flags in app state — stop on Exit, reload
            // when the settings page saves.
            #[cfg(windows)]
            {
                let handles = polling_hotkey::spawn(app.handle().clone(), engine.clone());
                app.manage(HotkeyHandlesState {
                    stop: handles.stop,
                    reload: handles.reload,
                });
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
        .unwrap_or_else(|e| {
            // Catastrophic failure during startup. In release builds there's
            // no stdout console, so write a crash file the user (or we) can
            // pick up from %APPDATA%\VoCo.
            tracing::error!("Tauri build 失败: {e}");
            if let Ok(dir) = config::config_dir() {
                let _ = std::fs::write(
                    dir.join("startup_error.txt"),
                    format!("VoCo 启动失败：\n{e}\n"),
                );
            }
            std::process::exit(1);
        })
        .run(|app_handle, event| {
            // On exit, ask the polling hotkey thread to stop. Without this it
            // keeps running for up to 20ms after the app dies and may emit
            // events into a torn-down AppHandle.
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                #[cfg(windows)]
                if let Some(handles) = app_handle.try_state::<HotkeyHandlesState>() {
                    handles.stop.store(true, Ordering::Relaxed);
                }
            }
        });
}

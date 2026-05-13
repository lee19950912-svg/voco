//! Low-overhead polling hotkey for VoCo.
//!
//! Why polling instead of `tauri-plugin-global-shortcut`?
//!   1. The plugin uses Win32 `RegisterHotKey`, which can't register a bare
//!      modifier key like Right-Alt as a standalone hotkey.
//!   2. Korean banking security plugins (TouchEn nxKey / AhnLab / Veraport)
//!      install low-level keyboard hooks that block hook-based listeners.
//!      `GetAsyncKeyState` polling sails right through.
//!
//! We poll the asynchronous key state every 20 ms (~50 Hz). Light CPU load
//! (<1%), and we get press/release events for any virtual key we want.
//!
//! Two trigger modes (`cfg.trigger_mode`):
//!   * **hold** — press to start, release to stop. Default.
//!   * **toggle** — press once to start; the key can be released, the
//!     recording continues; press a second time to stop.
//!
//! IMPORTANT: this loop must stay non-blocking. We dispatch the actual record
//! / process work onto Tauri's main async runtime via `async_runtime::spawn`
//! so that the polling itself never stalls — earlier code created a private
//! `current_thread` tokio runtime and used `block_on`, which:
//!   (a) blocked the polling loop while a recording was being processed, AND
//!   (b) cancelled any inner `tokio::spawn` tasks (like the HUD level pump)
//!       as soon as `block_on` returned.

#![cfg(windows)]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CAPITAL, VK_F1, VK_F10, VK_F11, VK_F12, VK_F2, VK_F3, VK_F4, VK_F5, VK_F6,
    VK_F7, VK_F8, VK_F9, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_RCONTROL, VK_RMENU, VK_RSHIFT,
};

use crate::config::AppConfig;
use crate::voice_engine::{ErrorPayload, VoiceEngine};

/// Spawns the polling loop on a dedicated OS thread. Returns a flag the
/// caller can flip to `true` to ask the loop to exit cleanly — the loop
/// observes the flag once per 20 ms cycle.
pub fn spawn(app: AppHandle, engine: Arc<VoiceEngine>) -> Arc<AtomicBool> {
    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = stop.clone();
    std::thread::spawn(move || run(app, engine, stop_for_thread));
    stop
}

fn key_is_down(vk: u16) -> bool {
    let s = unsafe { GetAsyncKeyState(vk as i32) };
    (s & (0x8000u16 as i16)) != 0
}

/// Map a config string like "alt_r" / "ctrl_l" / "caps_lock" / "f9" to a
/// Windows virtual-key code. Returns None for unknown codes — the caller
/// then falls back to a sensible default.
fn vk_from_code(code: &str) -> Option<u16> {
    let c = code.trim().to_ascii_lowercase();
    let vk = match c.as_str() {
        "alt_r" | "right_alt" | "ralt" => VK_RMENU.0,
        "alt_l" | "left_alt" | "lalt" => VK_LMENU.0,
        "ctrl_r" | "right_ctrl" | "rctrl" => VK_RCONTROL.0,
        "ctrl_l" | "left_ctrl" | "lctrl" => VK_LCONTROL.0,
        "shift_r" | "right_shift" | "rshift" => VK_RSHIFT.0,
        "shift_l" | "left_shift" | "lshift" => VK_LSHIFT.0,
        "caps_lock" | "caps" | "capslock" => VK_CAPITAL.0,
        "f1" => VK_F1.0,
        "f2" => VK_F2.0,
        "f3" => VK_F3.0,
        "f4" => VK_F4.0,
        "f5" => VK_F5.0,
        "f6" => VK_F6.0,
        "f7" => VK_F7.0,
        "f8" => VK_F8.0,
        "f9" => VK_F9.0,
        "f10" => VK_F10.0,
        "f11" => VK_F11.0,
        "f12" => VK_F12.0,
        _ => return None,
    };
    Some(vk)
}

fn spawn_start(app: &AppHandle, engine: &Arc<VoiceEngine>) {
    let app_c = app.clone();
    let eng_c = engine.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = eng_c.start_recording(&app_c).await {
            tracing::warn!("start_recording: {e}");
            let _ = app_c.emit(
                "voco:error",
                ErrorPayload { message: e.to_string() },
            );
        }
    });
}

fn spawn_stop(app: &AppHandle, engine: &Arc<VoiceEngine>, mode: &str) {
    let app_c = app.clone();
    let eng_c = engine.clone();
    let mode_owned = mode.to_string();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = eng_c.stop_and_process(&app_c, &mode_owned).await {
            tracing::warn!("stop_and_process: {e}");
            let _ = app_c.emit(
                "voco:error",
                ErrorPayload { message: e.to_string() },
            );
        }
    });
}

fn run(app: AppHandle, engine: Arc<VoiceEngine>, stop: Arc<AtomicBool>) {
    // Resolve hotkey codes + mode from config. Changes require an app restart.
    let cfg = AppConfig::load().unwrap_or_default();
    let trigger_vk = vk_from_code(&cfg.trigger_polish).unwrap_or(VK_RMENU.0);
    let translate_vk = vk_from_code(&cfg.trigger_translate_modifier).unwrap_or(VK_RSHIFT.0);
    let is_toggle = cfg.trigger_mode.eq_ignore_ascii_case("toggle");
    tracing::info!(
        "hotkey: trigger={} (vk=0x{:X}), translate_modifier={} (vk=0x{:X}), mode={}",
        cfg.trigger_polish,
        trigger_vk,
        cfg.trigger_translate_modifier,
        translate_vk,
        if is_toggle { "toggle" } else { "hold" },
    );

    let mut trigger_was_down = false;
    // Whether the translate modifier was observed as held down at ANY point
    // during the current recording session. We sample continuously because
    // users commonly release the modifier before the trigger (hold mode) or
    // tap it briefly during a long toggle session.
    let mut translate_seen = false;
    // Toggle-mode logical state: are we currently recording?
    let mut toggle_recording = false;

    loop {
        if stop.load(Ordering::Relaxed) {
            tracing::info!("polling_hotkey: stop signal received, exiting");
            return;
        }
        let trigger_is_down = key_is_down(trigger_vk);
        let press_edge = trigger_is_down && !trigger_was_down;

        if is_toggle {
            // While recording in toggle mode, latch modifier presses any time
            // — user might tap shift_r mid-recording to switch to translate.
            if toggle_recording && !translate_seen && key_is_down(translate_vk) {
                translate_seen = true;
            }
            if press_edge {
                if !toggle_recording {
                    // First press of a cycle — start a fresh session.
                    toggle_recording = true;
                    translate_seen = key_is_down(translate_vk);
                    spawn_start(&app, &engine);
                } else {
                    // Second press — close out the session.
                    toggle_recording = false;
                    let mode = if translate_seen { "translate" } else { "polish" };
                    spawn_stop(&app, &engine, mode);
                    translate_seen = false;
                }
            }
        } else {
            // Hold mode (default, original behavior).
            if press_edge {
                translate_seen = key_is_down(translate_vk);
                spawn_start(&app, &engine);
            } else if trigger_is_down {
                if !translate_seen && key_is_down(translate_vk) {
                    translate_seen = true;
                }
            } else if !trigger_is_down && trigger_was_down {
                let mode = if translate_seen { "translate" } else { "polish" };
                spawn_stop(&app, &engine, mode);
                translate_seen = false;
            }
        }

        trigger_was_down = trigger_is_down;
        std::thread::sleep(Duration::from_millis(20));
    }
}

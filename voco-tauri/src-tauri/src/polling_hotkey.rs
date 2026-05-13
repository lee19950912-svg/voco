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
//! IMPORTANT: this loop must stay non-blocking. We dispatch the actual record
//! / process work onto Tauri's main async runtime via `async_runtime::spawn`
//! so that the polling itself never stalls — earlier code created a private
//! `current_thread` tokio runtime and used `block_on`, which:
//!   (a) blocked the polling loop while a recording was being processed, AND
//!   (b) cancelled any inner `tokio::spawn` tasks (like the HUD level pump)
//!       as soon as `block_on` returned.

#![cfg(windows)]

use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CAPITAL, VK_F1, VK_F10, VK_F11, VK_F12, VK_F2, VK_F3, VK_F4, VK_F5, VK_F6,
    VK_F7, VK_F8, VK_F9, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_RCONTROL, VK_RMENU, VK_RSHIFT,
};

use crate::config::AppConfig;
use crate::voice_engine::{ErrorPayload, VoiceEngine};

pub fn spawn(app: AppHandle, engine: Arc<VoiceEngine>) {
    std::thread::spawn(move || run(app, engine));
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

fn run(app: AppHandle, engine: Arc<VoiceEngine>) {
    // Resolve hotkey codes from config — fall back to alt_r / shift_r if the
    // config strings are unrecognized. Changes require an app restart.
    let cfg = AppConfig::load().unwrap_or_default();
    let trigger_vk = vk_from_code(&cfg.trigger_polish).unwrap_or(VK_RMENU.0);
    let translate_vk = vk_from_code(&cfg.trigger_translate_modifier).unwrap_or(VK_RSHIFT.0);
    tracing::info!(
        "hotkey: trigger={} (vk=0x{:X}), translate_modifier={} (vk=0x{:X})",
        cfg.trigger_polish,
        trigger_vk,
        cfg.trigger_translate_modifier,
        translate_vk,
    );

    let mut alt_was_down = false;
    // Whether the translate modifier was observed as held down at ANY point
    // during the current trigger press. We must sample continuously because
    // users commonly release the modifier before the trigger — checking only
    // at release-time misses the modifier in the typical case.
    let mut translate_seen = false;
    loop {
        let alt_is_down = key_is_down(trigger_vk);

        if alt_is_down && !alt_was_down {
            // Press transition — kick off recording, reset modifier tracking.
            translate_seen = key_is_down(translate_vk);
            let app_clone = app.clone();
            let engine_clone = engine.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = engine_clone.start_recording(&app_clone).await {
                    tracing::warn!("start_recording: {e}");
                    let _ = app_clone.emit(
                        "voco:error",
                        ErrorPayload { message: e.to_string() },
                    );
                }
            });
        } else if alt_is_down {
            // While the trigger is held, latch the modifier as "seen" if it
            // goes down at any point — even briefly.
            if !translate_seen && key_is_down(translate_vk) {
                translate_seen = true;
            }
        } else if !alt_is_down && alt_was_down {
            // Release transition — pick mode using the latched flag.
            let mode = if translate_seen { "translate" } else { "polish" };
            let app_clone = app.clone();
            let engine_clone = engine.clone();
            let mode_owned = mode.to_string();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = engine_clone
                    .stop_and_process(&app_clone, &mode_owned)
                    .await
                {
                    tracing::warn!("stop_and_process: {e}");
                    let _ = app_clone.emit(
                        "voco:error",
                        ErrorPayload { message: e.to_string() },
                    );
                }
            });
            translate_seen = false;
        }

        alt_was_down = alt_is_down;
        std::thread::sleep(Duration::from_millis(20));
    }
}

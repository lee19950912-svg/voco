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
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_RMENU, VK_RSHIFT};

use crate::voice_engine::{ErrorPayload, VoiceEngine};

pub fn spawn(app: AppHandle, engine: Arc<VoiceEngine>) {
    std::thread::spawn(move || run(app, engine));
}

fn key_is_down(vk: u16) -> bool {
    let s = unsafe { GetAsyncKeyState(vk as i32) };
    (s & (0x8000u16 as i16)) != 0
}

fn run(app: AppHandle, engine: Arc<VoiceEngine>) {
    let mut alt_was_down = false;
    loop {
        let alt_is_down = key_is_down(VK_RMENU.0);

        if alt_is_down && !alt_was_down {
            // Press transition — kick off recording on Tauri's runtime.
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
        } else if !alt_is_down && alt_was_down {
            // Release transition — pick mode + run pipeline. Done on the
            // shared runtime so the inner spawned tasks survive the polling
            // loop continuing on this thread.
            let mode = if key_is_down(VK_RSHIFT.0) {
                "translate"
            } else {
                "polish"
            };
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
        }

        alt_was_down = alt_is_down;
        std::thread::sleep(Duration::from_millis(20));
    }
}

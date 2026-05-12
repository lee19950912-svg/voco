//! Clipboard → Ctrl+V paste at the system caret.
//!
//! Same trick as the Python prototype: save the current clipboard, replace it
//! with our text, simulate Ctrl+V via SendInput, wait briefly, restore the
//! original clipboard. This avoids the IME mojibake you'd get from straight
//! keystroke synthesis of Chinese characters.

#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_KEYUP, VK_CONTROL, VK_V,
};

use anyhow::{Context, Result};
use std::time::Duration;

#[cfg(not(windows))]
pub fn paste_text(_text: &str) -> Result<()> {
    Err(anyhow::anyhow!("paste 仅在 Windows 上实现"))
}

#[cfg(windows)]
pub fn paste_text(text: &str) -> Result<()> {
    if text.is_empty() {
        return Ok(());
    }

    // 1) Save original clipboard text (best-effort).
    let mut clipboard = arboard::Clipboard::new().context("打不开剪贴板")?;
    let original = clipboard.get_text().ok();

    // 2) Write our text and let Windows settle.
    clipboard.set_text(text.to_string()).context("写剪贴板失败")?;
    std::thread::sleep(Duration::from_millis(30));

    // 3) Send Ctrl down, V down, V up, Ctrl up.
    send_ctrl_v()?;

    // 4) Give the foreground app a moment to consume the paste before we
    //    overwrite the clipboard back to the original.
    std::thread::sleep(Duration::from_millis(200));

    if let Some(prev) = original {
        let _ = clipboard.set_text(prev);
    }
    Ok(())
}

#[cfg(windows)]
fn send_ctrl_v() -> Result<()> {
    // SendInput packs all 4 events into a single batch. Down events use 0,
    // up events use KEYEVENTF_KEYUP.
    let mut inputs = [
        make_key_input(VK_CONTROL.0, KEYBD_EVENT_FLAGS(0)),
        make_key_input(VK_V.0, KEYBD_EVENT_FLAGS(0)),
        make_key_input(VK_V.0, KEYEVENTF_KEYUP),
        make_key_input(VK_CONTROL.0, KEYEVENTF_KEYUP),
    ];
    let sent = unsafe {
        SendInput(&mut inputs, std::mem::size_of::<INPUT>() as i32)
    };
    if sent as usize != inputs.len() {
        anyhow::bail!("SendInput 失败（只发了 {sent} 个事件）");
    }
    Ok(())
}

#[cfg(windows)]
fn make_key_input(vk: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(vk),
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

//! Detect installed Windows keyboard layouts.
//!
//! Used to power the "Korean IME detected" banner in the settings page and
//! setup wizard. Korean IME hardcodes Right-Alt as the Hangul/English toggle
//! key — we can't override that, so when we see Korean is installed we
//! recommend the user switch their hotkey to something the IME won't steal
//! (F9 by default).
//!
//! We check INSTALLED layouts (GetKeyboardLayoutList), not the currently
//! active one (GetKeyboardLayout). Reasons:
//!   - "Currently active" is per-window-thread on modern Windows. Checking
//!     our own Tauri window says nothing about what's active in the user's
//!     target app (chat, browser, etc.).
//!   - If Korean is installed, the user WILL switch to it sometime — that's
//!     enough signal to surface the warning.
//!   - For 中国 users (no Korean installed) the banner never appears.
//!   - For 韩国 users (Korean installed) it appears reliably.

#![cfg(windows)]

use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyboardLayoutList, HKL};

const LANGID_KO_KR: u16 = 0x0412;

/// Returns the LANGID (low 16 bits of each HKL) of every keyboard layout
/// installed on this machine. Empty list on any failure — callers treat that
/// as "no Korean detected" rather than surfacing the error.
pub fn installed_layouts() -> Vec<u16> {
    unsafe {
        let count = GetKeyboardLayoutList(None);
        if count <= 0 {
            return Vec::new();
        }
        let mut buf: Vec<HKL> = vec![HKL::default(); count as usize];
        let actual = GetKeyboardLayoutList(Some(buf.as_mut_slice()));
        if actual <= 0 {
            return Vec::new();
        }
        buf.truncate(actual as usize);
        buf.iter()
            .map(|hkl| ((hkl.0 as usize) & 0xFFFF) as u16)
            .collect()
    }
}

/// Convenience: is a Korean keyboard layout among the installed ones?
pub fn korean_installed() -> bool {
    installed_layouts().contains(&LANGID_KO_KR)
}

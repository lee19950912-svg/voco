//! Captures the *foreground* application context at the moment the user
//! presses the hotkey. Single snapshot — we never poll, never watch the
//! screen between sessions. Privacy story: only what the user is about to
//! dictate INTO gets recorded, nothing else.
//!
//! What we capture (Windows):
//!   - app_name      e.g. "WeChat", "Chrome", "Code"
//!   - window_title  raw window text, useful for browsers (carries page name)
//!
//! Why not browser URL? Reading the address bar requires UI Automation COM
//! plumbing and feels invasive. v1 sticks to app + title — already enough for
//! the AI to know it's writing into Slack vs a doc.

use serde::{Deserialize, Serialize};

/// Lightweight snapshot of what the user has in focus right now. All fields
/// are best-effort: any failure (no foreground window, denied process access,
/// pre-Win10 quirks) yields `None` on that field and we keep going. The whole
/// struct is `Option<AppContext>` on call sites, so an outright failure means
/// the AI gets no context block — same as today's behavior.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppContext {
    /// Short app name derived from the foreground process's executable, with
    /// the `.exe` stripped. Example: `"WeChat"` for `WeChat.exe`.
    pub app_name: Option<String>,
    /// Raw window title text. Empty windows (Explorer, some overlays) yield
    /// `None`. Browsers usually pack the page title here, so this is the
    /// cheapest "what page are they on" signal short of UI Automation.
    pub window_title: Option<String>,
}

impl AppContext {
    /// Best-effort capture on the calling thread. Returns a struct with
    /// `None` fields if we can't read anything (rather than `Option<Self>`)
    /// so callers can always pass *some* context to the AI.
    pub fn capture() -> Self {
        #[cfg(windows)]
        {
            windows_impl::capture()
        }
        #[cfg(not(windows))]
        {
            Self::default()
        }
    }

    /// Renders the context as a single line for the AI's system prompt.
    /// Returns `None` if we have nothing useful to say — caller should then
    /// skip injecting any context line at all (avoids a useless empty tag).
    pub fn as_prompt_line(&self) -> Option<String> {
        match (&self.app_name, &self.window_title) {
            (Some(app), Some(title)) if !title.is_empty() => {
                Some(format!("用户当前在 {app}（窗口：{title}）中输入。"))
            }
            (Some(app), _) => Some(format!("用户当前在 {app} 中输入。")),
            (None, Some(title)) if !title.is_empty() => {
                Some(format!("用户当前窗口：{title}。"))
            }
            _ => None,
        }
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::AppContext;
    use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    pub fn capture() -> AppContext {
        // SAFETY: All Win32 calls below take the foreground HWND. A null HWND
        // (no foreground window, e.g. lock screen) makes every subsequent
        // call no-op safely — we check for it first.
        let hwnd: HWND = unsafe { GetForegroundWindow() };
        if hwnd.0.is_null() {
            return AppContext::default();
        }
        AppContext {
            app_name: read_app_name(hwnd),
            window_title: read_window_title(hwnd),
        }
    }

    fn read_window_title(hwnd: HWND) -> Option<String> {
        unsafe {
            let len = GetWindowTextLengthW(hwnd);
            if len <= 0 {
                return None;
            }
            // +1 for the trailing NUL that GetWindowTextW writes.
            let mut buf = vec![0u16; (len as usize) + 1];
            let copied = GetWindowTextW(hwnd, &mut buf);
            if copied <= 0 {
                return None;
            }
            let s = String::from_utf16_lossy(&buf[..copied as usize]);
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
    }

    fn read_app_name(hwnd: HWND) -> Option<String> {
        unsafe {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            // PROCESS_QUERY_LIMITED_INFORMATION works for processes running
            // at higher integrity levels (e.g. elevated apps) — broader than
            // PROCESS_QUERY_INFORMATION which would fail there.
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; MAX_PATH as usize];
            let mut size: u32 = buf.len() as u32;
            let result =
                QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), windows::core::PWSTR(buf.as_mut_ptr()), &mut size);
            let _ = CloseHandle(handle);
            if result.is_err() || size == 0 {
                return None;
            }
            let path = String::from_utf16_lossy(&buf[..size as usize]);
            // Take the file stem (last segment minus `.exe`). PathBuf would
            // work too but pulling it in for one path operation feels heavy.
            let last = path.rsplit(['/', '\\']).next().unwrap_or(&path);
            let stem = last.strip_suffix(".exe").or_else(|| last.strip_suffix(".EXE")).unwrap_or(last);
            if stem.is_empty() {
                None
            } else {
                Some(stem.to_string())
            }
        }
    }
}

//! Audio ducker — mutes the default render endpoint while recording.
//!
//! Mirrors Wispr Flow's Windows default behavior: when the user starts
//! dictating, mute the speakers; on release, restore.
//!
//! Smart bits:
//!   1. If the device was already muted, do nothing on either edge — the user
//!      asked for silence in the first place.
//!   2. If nothing is currently playing (peak level ~0), skip mute entirely
//!      to avoid an unnecessary state flip.
//!
//! Uses Windows Core Audio: IMMDeviceEnumerator → default render endpoint →
//! IAudioEndpointVolume::SetMute. Peak detection via IAudioMeterInformation.

#![cfg(windows)]

use anyhow::Result;
use windows::Win32::Foundation::BOOL;
use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
use windows::Win32::Media::Audio::{
    eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
};

/// Snapshot of what we changed so we can restore exactly. Construct via
/// `duck()`; pass to `restore()` when recording finishes.
pub struct DuckGuard {
    /// True only if we actually called SetMute(true). Restore is a no-op
    /// otherwise (device was pre-muted, silent, or duck() failed).
    we_muted: bool,
}

impl DuckGuard {
    pub fn noop() -> Self {
        Self { we_muted: false }
    }
}

/// Mute the default render endpoint if (a) it's currently unmuted and
/// (b) something is actually playing. Returns a guard for `restore`.
///
/// Errors here are non-fatal for recording — the caller should log and
/// proceed with `DuckGuard::noop()`.
pub fn duck() -> Result<DuckGuard> {
    unsafe {
        // COM init is per-thread. MTA matches tokio's worker model. If COM
        // is already initialized on this thread (likely, since other modules
        // use it) we get RPC_E_CHANGED_MODE / S_FALSE — both fine.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;

        let endpoint_volume: IAudioEndpointVolume =
            device.Activate(CLSCTX_ALL, None)?;
        if endpoint_volume.GetMute()?.as_bool() {
            return Ok(DuckGuard { we_muted: false });
        }

        // Peak across all channels of all active streams. ~0 means nothing
        // is producing sound right now — skip the mute flip.
        let meter: IAudioMeterInformation = device.Activate(CLSCTX_ALL, None)?;
        let peak = meter.GetPeakValue()?;
        if peak < 0.001 {
            return Ok(DuckGuard { we_muted: false });
        }

        endpoint_volume.SetMute(BOOL(1), std::ptr::null())?;
        Ok(DuckGuard { we_muted: true })
    }
}

/// Restore the mute state we changed in `duck()`. Safe to call even if the
/// guard is a no-op.
pub fn restore(guard: DuckGuard) -> Result<()> {
    if !guard.we_muted {
        return Ok(());
    }
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
        let endpoint_volume: IAudioEndpointVolume =
            device.Activate(CLSCTX_ALL, None)?;
        endpoint_volume.SetMute(BOOL(0), std::ptr::null())?;
    }
    Ok(())
}

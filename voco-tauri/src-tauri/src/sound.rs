//! HUD audio cues, played natively from a dedicated audio thread.
//!
//! Previously these cues were played from the HUD's WebView2 AudioContext.
//! That path raced window-show + WebView2 paint + AudioContext.resume, and
//! the first ~50–100 ms of the cue clipped — the user heard a half-bitten
//! "start" sound.
//!
//! This module owns one rodio `OutputStream` on a long-lived thread. Each
//! `play_*` call sends a message to that thread, which decodes the embedded
//! WAV and detaches a `Sink` to play it to completion. No window, no
//! WebView2, no resume — the cue plays in single-digit milliseconds.

use rodio::{Decoder, OutputStream, Sink};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::OnceLock;
use std::thread;

const SOUND_START: &[u8] = include_bytes!("../../public/sounds/voco_record_start.wav");
const SOUND_SUCCESS: &[u8] = include_bytes!("../../public/sounds/voco_success.wav");

enum Cmd {
    Play {
        bytes: &'static [u8],
        volume: f32,
    },
}

static TX: OnceLock<Sender<Cmd>> = OnceLock::new();

// Volume stored as milli-units (0–1000) so we can keep it in a single
// `AtomicU32` without bringing in a Mutex. `enabled` is just a flag.
static SOUND_ENABLED: AtomicBool = AtomicBool::new(true);
static SOUND_VOLUME_MILLI: AtomicU32 = AtomicU32::new(700);

/// Spawn the audio worker. Idempotent — calling twice is a no-op.
pub fn init() {
    let (tx, rx) = mpsc::channel::<Cmd>();
    if TX.set(tx).is_err() {
        return;
    }
    thread::Builder::new()
        .name("voco-sound".into())
        .spawn(move || {
            // OutputStream owns the audio device handle and is `!Send`, so it
            // must live entirely inside this thread. Keep it alive for the
            // lifetime of the loop — re-creating it per cue would add the
            // 200–500 ms WASAPI cold-start we're trying to avoid.
            let (_stream, handle) = match OutputStream::try_default() {
                Ok(s) => s,
                Err(e) => {
                    tracing::warn!("sound: OutputStream init failed: {e}");
                    return;
                }
            };
            while let Ok(cmd) = rx.recv() {
                match cmd {
                    Cmd::Play { bytes, volume } => {
                        let decoder = match Decoder::new(Cursor::new(bytes)) {
                            Ok(d) => d,
                            Err(e) => {
                                tracing::warn!("sound: decode failed: {e}");
                                continue;
                            }
                        };
                        let sink = match Sink::try_new(&handle) {
                            Ok(s) => s,
                            Err(e) => {
                                tracing::warn!("sound: sink create failed: {e}");
                                continue;
                            }
                        };
                        sink.set_volume(volume);
                        sink.append(decoder);
                        // Detach so the sink owns itself until playback ends.
                        // We get one fire-and-forget cue per call; no need to
                        // track or stop it.
                        sink.detach();
                    }
                }
            }
        })
        .ok();
}

/// Push the latest user settings into the audio thread. Called once at
/// startup with the loaded config, and again from `save_config` whenever
/// the user toggles sound or drags the volume slider.
pub fn set_config(enabled: bool, volume: f32) {
    SOUND_ENABLED.store(enabled, Ordering::Relaxed);
    let v = (volume.clamp(0.0, 1.0) * 1000.0) as u32;
    SOUND_VOLUME_MILLI.store(v, Ordering::Relaxed);
}

fn send(bytes: &'static [u8]) {
    if !SOUND_ENABLED.load(Ordering::Relaxed) {
        return;
    }
    let vol = SOUND_VOLUME_MILLI.load(Ordering::Relaxed) as f32 / 1000.0;
    if let Some(tx) = TX.get() {
        let _ = tx.send(Cmd::Play { bytes, volume: vol });
    }
}

pub fn play_start() {
    send(SOUND_START);
}

pub fn play_success() {
    send(SOUND_SUCCESS);
}

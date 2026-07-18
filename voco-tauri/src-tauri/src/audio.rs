//! Microphone capture → WAV bytes.
//!
//! Architecture note (vs the Python version): cpal's `Stream` is `!Send` on
//! Windows because of WASAPI thread-affinity. We can't drop a Stream into a
//! tokio task or share it via `tokio::sync::Mutex`. So the cpal stream lives
//! on a dedicated `std::thread`, and the engine talks to it through `mpsc`
//! channels — the `RecordingSession` we hand out is fully `Send + Sync`.
//!
//! Format we deliver: 16 kHz, 16-bit, mono WAV — what OpenAI-compatible ASR expects.

use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, StreamConfig};
use std::io::Cursor;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const TARGET_SAMPLE_RATE: u32 = 16_000;
const TARGET_CHANNELS: u16 = 1;
/// Hard upper bound for a single utterance, in seconds. Protects against
/// runaway memory if the hotkey gets stuck or the user holds it forever.
const MAX_RECORD_SECS: usize = 60;

/// Thin handle the engine holds. All fields are Send-safe.
pub struct RecordingSession {
    stop_tx: mpsc::Sender<()>,
    result_rx: Mutex<Option<mpsc::Receiver<RecordingResult>>>,
    level: Arc<AtomicU32>, // f32 packed as bits, lock-free reads
    pub device_name: String,
}

struct RecordingResult {
    samples: Vec<i16>,
    sample_rate: u32,
    channels: u16,
}

impl RecordingSession {
    /// Open a microphone and start capturing. Returns a `RecordingSession`
    /// once the stream is up. Recording stops when `stop_to_wav()` is called.
    pub fn start(device_name: &str) -> Result<Self> {
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let (result_tx, result_rx) = mpsc::channel::<RecordingResult>();
        let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<String>>(1);

        let level = Arc::new(AtomicU32::new(0));
        let level_for_thread = level.clone();
        let device_name_owned = device_name.to_string();

        // The recording lives on a dedicated OS thread so the cpal Stream
        // stays put. We use sync_channel for `ready` so start() blocks until
        // the stream is actually open (and we know the device name).
        std::thread::spawn(move || {
            run_recorder(
                device_name_owned,
                stop_rx,
                result_tx,
                level_for_thread,
                ready_tx,
            );
        });

        let resolved_name = ready_rx
            .recv()
            .map_err(|_| anyhow!("录音线程没启动起来"))?
            .context("打开麦克风失败")?;

        Ok(Self {
            stop_tx,
            result_rx: Mutex::new(Some(result_rx)),
            level,
            device_name: resolved_name,
        })
    }

    /// Latest RMS-based level (0..1) — read by the HUD waveform.
    pub fn current_level(&self) -> f32 {
        f32::from_bits(self.level.load(Ordering::Relaxed))
    }

    /// Signal stop, wait for the recorder thread to deliver its samples,
    /// resample to 16 kHz mono and return WAV bytes.
    pub fn stop_to_wav(self) -> Result<Vec<u8>> {
        let _ = self.stop_tx.send(());
        // Recover from a poisoned mutex — the audio thread may have panicked,
        // but we still want to surface that as a graceful error.
        let mut guard = self
            .result_rx
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let rx = guard.take().ok_or_else(|| anyhow!("录音会话已经被消费"))?;
        let result = rx
            .recv_timeout(Duration::from_secs(2))
            .context("等录音线程返回样本超时")?;
        let mono = downmix_to_mono(&result.samples, result.channels);
        let resampled = if result.sample_rate == TARGET_SAMPLE_RATE {
            mono
        } else {
            resample_linear(&mono, result.sample_rate, TARGET_SAMPLE_RATE)
        };
        write_wav(&resampled)
    }
}

fn run_recorder(
    device_name: String,
    stop_rx: mpsc::Receiver<()>,
    result_tx: mpsc::Sender<RecordingResult>,
    level: Arc<AtomicU32>,
    ready_tx: mpsc::SyncSender<Result<String>>,
) {
    let host = cpal::default_host();
    let device = match pick_device(&host, &device_name) {
        Ok(d) => d,
        Err(e) => {
            let _ = ready_tx.send(Err(e));
            return;
        }
    };

    let resolved_name = device.name().unwrap_or_else(|_| "<unknown>".into());

    let config = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => {
            let _ = ready_tx.send(Err(anyhow!("默认输入配置失败: {e}")));
            return;
        }
    };
    let sample_format = config.sample_format();
    let stream_config: StreamConfig = config.into();
    let device_sample_rate = stream_config.sample_rate.0;
    let device_channels = stream_config.channels;

    // Pre-allocate for MAX_RECORD_SECS at the device's native rate/channels.
    // The cpal callbacks check len() against this capacity and refuse to grow
    // past it, so this also acts as a hard upper bound for memory use.
    let samples: Arc<Mutex<Vec<i16>>> = Arc::new(Mutex::new(Vec::with_capacity(
        (device_sample_rate as usize) * MAX_RECORD_SECS * device_channels as usize,
    )));

    let build_result = match sample_format {
        SampleFormat::F32 => build_stream_f32(&device, &stream_config, samples.clone(), level.clone()),
        SampleFormat::I16 => build_stream_i16(&device, &stream_config, samples.clone(), level.clone()),
        SampleFormat::U16 => build_stream_u16(&device, &stream_config, samples.clone(), level.clone()),
        other => Err(anyhow!("不支持的样本格式: {:?}", other)),
    };
    let stream = match build_result {
        Ok(s) => s,
        Err(e) => {
            let _ = ready_tx.send(Err(e));
            return;
        }
    };
    if let Err(e) = stream.play().context("启动输入流失败") {
        let _ = ready_tx.send(Err(e));
        return;
    }

    // Stream is now live — tell the caller we're ready.
    let _ = ready_tx.send(Ok(resolved_name));

    // Block until the engine asks us to stop.
    let _ = stop_rx.recv();
    drop(stream); // explicit stop

    let mut samples_guard = samples.lock().unwrap_or_else(|e| e.into_inner());
    let collected = std::mem::take(&mut *samples_guard);
    drop(samples_guard);
    let _ = result_tx.send(RecordingResult {
        samples: collected,
        sample_rate: device_sample_rate,
        channels: device_channels,
    });
}

fn pick_device(host: &cpal::Host, preferred_name: &str) -> Result<Device> {
    if !preferred_name.is_empty() {
        let needle = preferred_name
            .split_whitespace()
            .next()
            .unwrap_or(preferred_name);
        if let Ok(devices) = host.input_devices() {
            for d in devices {
                let name = d.name().unwrap_or_default();
                if name.contains(needle) && d.default_input_config().is_ok() {
                    return Ok(d);
                }
            }
        }
    }
    host.default_input_device()
        .ok_or_else(|| anyhow!("找不到可用麦克风"))
}

// --- Sample-format-specific input callbacks ---

fn build_stream_f32(
    device: &Device,
    config: &StreamConfig,
    buf: Arc<Mutex<Vec<i16>>>,
    level: Arc<AtomicU32>,
) -> Result<cpal::Stream> {
    let err_fn = |e| tracing::warn!("input stream error: {e}");
    Ok(device.build_input_stream(
        config,
        move |data: &[f32], _| {
            let mut sum_sq = 0.0_f64;
            let mut converted: Vec<i16> = Vec::with_capacity(data.len());
            for &s in data {
                let clamped = s.clamp(-1.0, 1.0);
                converted.push((clamped * i16::MAX as f32) as i16);
                sum_sq += (clamped as f64) * (clamped as f64);
            }
            let rms = (sum_sq / data.len().max(1) as f64).sqrt() as f32;
            // Best-effort: skip this batch if the lock is poisoned.
            // Never panic from inside the audio callback — WASAPI runs us on
            // a realtime thread and a panic kills the whole process.
            if let Ok(mut b) = buf.lock() {
                let cap = max_samples_for(b.capacity());
                let remaining = cap.saturating_sub(b.len());
                let take = converted.len().min(remaining);
                if take > 0 {
                    b.extend_from_slice(&converted[..take]);
                }
            }
            update_level(&level, rms);
        },
        err_fn,
        None,
    )?)
}

fn build_stream_i16(
    device: &Device,
    config: &StreamConfig,
    buf: Arc<Mutex<Vec<i16>>>,
    level: Arc<AtomicU32>,
) -> Result<cpal::Stream> {
    let err_fn = |e| tracing::warn!("input stream error: {e}");
    Ok(device.build_input_stream(
        config,
        move |data: &[i16], _| {
            let mut sum_sq = 0.0_f64;
            for &s in data {
                let f = s as f32 / i16::MAX as f32;
                sum_sq += (f as f64) * (f as f64);
            }
            if let Ok(mut b) = buf.lock() {
                let cap = max_samples_for(b.capacity());
                let remaining = cap.saturating_sub(b.len());
                let take = data.len().min(remaining);
                if take > 0 {
                    b.extend_from_slice(&data[..take]);
                }
            }
            let rms = (sum_sq / data.len().max(1) as f64).sqrt() as f32;
            update_level(&level, rms);
        },
        err_fn,
        None,
    )?)
}

fn build_stream_u16(
    device: &Device,
    config: &StreamConfig,
    buf: Arc<Mutex<Vec<i16>>>,
    level: Arc<AtomicU32>,
) -> Result<cpal::Stream> {
    let err_fn = |e| tracing::warn!("input stream error: {e}");
    Ok(device.build_input_stream(
        config,
        move |data: &[u16], _| {
            let mut sum_sq = 0.0_f64;
            let mut converted: Vec<i16> = Vec::with_capacity(data.len());
            for &s in data {
                let signed = (s as i32 - 32768) as i16;
                converted.push(signed);
                let f = signed as f32 / i16::MAX as f32;
                sum_sq += (f as f64) * (f as f64);
            }
            if let Ok(mut b) = buf.lock() {
                let cap = max_samples_for(b.capacity());
                let remaining = cap.saturating_sub(b.len());
                let take = converted.len().min(remaining);
                if take > 0 {
                    b.extend_from_slice(&converted[..take]);
                }
            }
            let rms = (sum_sq / data.len().max(1) as f64).sqrt() as f32;
            update_level(&level, rms);
        },
        err_fn,
        None,
    )?)
}

/// Returns the absolute upper bound on sample count for a buffer whose
/// initial capacity was sized for `MAX_RECORD_SECS` seconds. We treat the
/// initial `Vec::with_capacity(...)` value as the cap — see run_recorder().
fn max_samples_for(initial_capacity: usize) -> usize {
    initial_capacity
}

fn update_level(level: &AtomicU32, rms: f32) {
    let mapped = (rms * 4.0).min(1.0);
    let prev = f32::from_bits(level.load(Ordering::Relaxed));
    let smoothed = prev * 0.6 + mapped * 0.4;
    level.store(smoothed.to_bits(), Ordering::Relaxed);
}

fn downmix_to_mono(samples: &[i16], channels: u16) -> Vec<i16> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let ch = channels as usize;
    let mut out = Vec::with_capacity(samples.len() / ch);
    for chunk in samples.chunks_exact(ch) {
        let mut sum = 0i32;
        for &s in chunk {
            sum += s as i32;
        }
        out.push((sum / ch as i32) as i16);
    }
    out
}

fn resample_linear(input: &[i16], from_rate: u32, to_rate: u32) -> Vec<i16> {
    if input.is_empty() || from_rate == to_rate {
        return input.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let new_len = (input.len() as f64 / ratio) as usize;
    let mut out = Vec::with_capacity(new_len);
    for i in 0..new_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos.floor() as usize;
        let frac = src_pos - idx as f64;
        let a = input.get(idx).copied().unwrap_or(0) as f64;
        let b = input.get(idx + 1).copied().unwrap_or(a as i16) as f64;
        out.push((a + (b - a) * frac) as i16);
    }
    out
}

fn write_wav(samples: &[i16]) -> Result<Vec<u8>> {
    let spec = hound::WavSpec {
        channels: TARGET_CHANNELS,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::<u8>::with_capacity(samples.len() * 2 + 44));
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)?;
        for &s in samples {
            writer.write_sample(s)?;
        }
        writer.finalize()?;
    }
    Ok(cursor.into_inner())
}

pub fn list_input_devices() -> Vec<String> {
    let host = cpal::default_host();
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    if let Ok(devices) = host.input_devices() {
        for d in devices {
            if let Ok(name) = d.name() {
                if seen.insert(name.clone()) && d.default_input_config().is_ok() {
                    out.push(name);
                }
            }
        }
    }
    out
}

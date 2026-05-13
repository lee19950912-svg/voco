//! Volcengine 一句话识别 — WebSocket binary protocol (api/v2/asr).
//!
//! Direct Rust port of the proven Python implementation in
//! `E:\语音输入法\recognizer.py::VolcEngineRecognizer`.
//! The protocol/payload shape is identical — see the Python file's docstring
//! for the byte layout and decision rationale.

use anyhow::{anyhow, bail, Context, Result};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::time::Duration;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

const WS_URL: &str = "wss://openspeech.bytedance.com/api/v2/asr";

// Header byte layout (4 bytes total). See Python file for full doc.
const PROTOCOL_VERSION_HEADER_SIZE: u8 = 0x11; // v1 + header size 1×4

const MSG_FULL_REQUEST: u8 = 0b0001;
const MSG_AUDIO_REQUEST: u8 = 0b0010;
const MSG_FULL_RESPONSE: u8 = 0b1001;
const MSG_ERROR: u8 = 0b1111;

const FLAG_NONE: u8 = 0b0000;
const FLAG_LAST: u8 = 0b0010;

const SER_NONE: u8 = 0b0000;
const SER_JSON: u8 = 0b0001;

const COMP_GZIP: u8 = 0b0001;

#[derive(Debug, Clone)]
pub struct VolcConfig {
    pub appid: String,
    pub token: String,
    pub cluster_zh: String,
    pub cluster_ko: String,
    pub language: String, // "zh" or "ko"
}

impl VolcConfig {
    fn cluster_and_lang_tag(&self) -> (&str, &str) {
        if self.language == "ko" {
            (&self.cluster_ko, "ko-KR")
        } else {
            (&self.cluster_zh, "zh-CN")
        }
    }
}

#[derive(Serialize)]
struct RequestPayload<'a> {
    app: AppCfg<'a>,
    user: UserCfg<'a>,
    audio: AudioCfg<'a>,
    request: RequestCfg<'a>,
}

#[derive(Serialize)]
struct AppCfg<'a> {
    appid: &'a str,
    token: &'a str,
    cluster: &'a str,
}

#[derive(Serialize)]
struct UserCfg<'a> {
    uid: &'a str,
}

#[derive(Serialize)]
struct AudioCfg<'a> {
    format: &'a str,
    rate: u32,
    bits: u32,
    channel: u32,
    language: &'a str,
}

#[derive(Serialize)]
struct RequestCfg<'a> {
    reqid: String,
    nbest: u32,
    workflow: &'a str,
    sequence: i32,
}

#[derive(Deserialize, Debug)]
pub struct VolcResponse {
    pub code: i32,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub sequence: i32,
    #[serde(default)]
    pub result: Vec<VolcResult>,
}

#[derive(Deserialize, Debug)]
pub struct VolcResult {
    #[serde(default)]
    pub text: String,
}

fn make_header(msg_type: u8, flags: u8, serialization: u8, compression: u8) -> [u8; 4] {
    [
        PROTOCOL_VERSION_HEADER_SIZE,
        (msg_type << 4) | (flags & 0x0F),
        (serialization << 4) | (compression & 0x0F),
        0x00,
    ]
}

fn gzip(data: &[u8]) -> Result<Vec<u8>> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data)?;
    Ok(encoder.finish()?)
}

fn gunzip(data: &[u8]) -> Result<Vec<u8>> {
    let mut decoder = GzDecoder::new(data);
    let mut out = Vec::new();
    decoder.read_to_end(&mut out)?;
    Ok(out)
}

/// Strip control bytes + truncate before surfacing into logs / UI. Volcengine
/// has been observed echoing raw audio fragments back inside the `message`
/// field of code=1012 responses; the bytes are valid UTF-8 (they were JSON-
/// escaped) but contain backspace / form-feed / etc. that corrupt the log
/// and could include user voice data. Limit blast radius to a short safe
/// summary.
fn sanitize_msg(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .take(200)
        .map(|c| {
            if c.is_control() && c != '\n' && c != '\t' {
                '.'
            } else {
                c
            }
        })
        .collect();
    if s.chars().count() > 200 {
        format!("{cleaned}…(已截断)")
    } else {
        cleaned
    }
}

fn parse_frame(data: &[u8]) -> Result<VolcResponse> {
    if data.len() < 8 {
        bail!("响应数据过短: {} bytes", data.len());
    }
    let msg_type = (data[1] >> 4) & 0x0F;
    let compression = data[2] & 0x0F;

    if msg_type == MSG_ERROR {
        if data.len() < 12 {
            bail!("火山错误帧过短: {} bytes", data.len());
        }
        let err_code = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
        let err_size =
            u32::from_be_bytes([data[8], data[9], data[10], data[11]]) as usize;
        let end = 12usize.checked_add(err_size).unwrap_or(usize::MAX).min(data.len());
        let err_msg = String::from_utf8_lossy(&data[12..end]).into_owned();
        bail!("火山错误 code={}: {}", err_code, sanitize_msg(&err_msg));
    }

    if msg_type == MSG_FULL_RESPONSE {
        let payload_size =
            u32::from_be_bytes([data[4], data[5], data[6], data[7]]) as usize;
        let payload_end = 8usize
            .checked_add(payload_size)
            .ok_or_else(|| anyhow::anyhow!("响应 payload 长度溢出"))?;
        if payload_end > data.len() {
            bail!(
                "响应 payload 越界: 声明 {} bytes，实际剩余 {} bytes",
                payload_size,
                data.len().saturating_sub(8)
            );
        }
        let payload = &data[8..payload_end];
        let payload_bytes: Vec<u8> = if compression == COMP_GZIP {
            gunzip(payload)?
        } else {
            payload.to_vec()
        };
        let resp: VolcResponse = serde_json::from_slice(&payload_bytes)
            .with_context(|| "解析响应 JSON 失败".to_string())?;
        return Ok(resp);
    }

    bail!("未知响应 msg_type=0b{:04b}", msg_type)
}

/// Run one-shot recognition over WebSocket. The audio must be a WAV file
/// (16 kHz, 16-bit, mono — matches the format we record).
pub async fn recognize(cfg: &VolcConfig, wav_bytes: &[u8]) -> Result<String> {
    let (cluster, lang_tag) = cfg.cluster_and_lang_tag();

    let request_id = uuid::Uuid::new_v4().to_string();
    let payload = RequestPayload {
        app: AppCfg {
            appid: &cfg.appid,
            token: &cfg.token,
            cluster,
        },
        user: UserCfg {
            uid: "voco-desktop",
        },
        audio: AudioCfg {
            format: "wav",
            rate: 16000,
            bits: 16,
            channel: 1,
            language: lang_tag,
        },
        request: RequestCfg {
            reqid: request_id,
            nbest: 1,
            workflow: "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate",
            sequence: 1,
        },
    };

    let json_bytes = serde_json::to_vec(&payload)?;
    let json_compressed = gzip(&json_bytes)?;
    let audio_compressed = gzip(wav_bytes)?;

    // Build the WebSocket request with the Bearer; <token> auth header — note
    // the semicolon, which is Volcengine's non-standard scheme.
    let mut req = WS_URL.into_client_request()?;
    req.headers_mut().insert(
        "Authorization",
        format!("Bearer; {}", cfg.token)
            .parse()
            .map_err(|_| anyhow!("invalid auth header"))?,
    );

    let (ws_stream, _) = tokio_tungstenite::connect_async(req)
        .await
        .context("连接火山 WebSocket 失败")?;
    let (mut sink, mut stream) = ws_stream.split();

    // 1) Full client request (JSON config)
    let mut frame = Vec::with_capacity(8 + json_compressed.len());
    frame.extend_from_slice(&make_header(
        MSG_FULL_REQUEST,
        FLAG_NONE,
        SER_JSON,
        COMP_GZIP,
    ));
    frame.extend_from_slice(&(json_compressed.len() as u32).to_be_bytes());
    frame.extend_from_slice(&json_compressed);
    sink.send(Message::Binary(frame.into())).await?;

    // 2) Wait for ack
    let ack_msg = timeout(Duration::from_secs(10), stream.next())
        .await
        .map_err(|_| anyhow!("火山握手超时"))?
        .ok_or_else(|| anyhow!("火山握手期间连接关闭"))??;
    let ack_bytes = match ack_msg {
        Message::Binary(b) => b,
        other => bail!("意外消息类型（期望二进制）: {:?}", other),
    };
    let ack = parse_frame(&ack_bytes)?;
    if ack.code != 0 && ack.code != 1000 {
        bail!("火山握手失败 code={}: {}", ack.code, ack.message);
    }

    // 3) Send all audio in one final frame (flag=LAST)
    let mut audio_frame = Vec::with_capacity(8 + audio_compressed.len());
    audio_frame.extend_from_slice(&make_header(
        MSG_AUDIO_REQUEST,
        FLAG_LAST,
        SER_NONE,
        COMP_GZIP,
    ));
    audio_frame.extend_from_slice(&(audio_compressed.len() as u32).to_be_bytes());
    audio_frame.extend_from_slice(&audio_compressed);
    sink.send(Message::Binary(audio_frame.into())).await?;

    // 4) Read frames until we see one with text (or a negative sequence = stream end).
    // Bound the total time we spend reading frames so a misbehaving server can't
    // keep us hanging for 15 minutes (30 frames × 30s).
    let overall_start = std::time::Instant::now();
    const OVERALL_TIMEOUT: Duration = Duration::from_secs(20);
    let mut final_text = String::new();
    for _ in 0..30 {
        let elapsed = overall_start.elapsed();
        if elapsed >= OVERALL_TIMEOUT {
            bail!("火山识别整体超时（{} 秒）", OVERALL_TIMEOUT.as_secs());
        }
        let remaining = OVERALL_TIMEOUT - elapsed;
        let msg = timeout(remaining, stream.next())
            .await
            .map_err(|_| anyhow!("火山响应超时"))?
            .ok_or_else(|| anyhow!("火山过早关闭连接"))??;
        let bytes = match msg {
            Message::Binary(b) => b,
            Message::Close(_) => break,
            _ => continue,
        };
        let frame = parse_frame(&bytes)?;
        if frame.code != 0 && frame.code != 1000 {
            bail!(
                "火山识别失败 code={}: {}",
                frame.code,
                sanitize_msg(&frame.message)
            );
        }
        if let Some(first) = frame.result.first() {
            let txt = first.text.trim();
            if !txt.is_empty() {
                final_text = txt.to_string();
            }
        }
        if frame.sequence < 0 {
            break;
        }
    }

    let _ = sink.close().await;
    Ok(final_text)
}

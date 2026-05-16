//! OpenAI Whisper / gpt-4o-mini-transcribe — speech-to-text via the
//! OpenAI-compatible `/audio/transcriptions` endpoint.
//!
//! Goes through whatever base URL the user picked for their "overseas"
//! region (currently yunwu.ai, but any OpenAI-compatible relay works).
//!
//! Why not the same code path as Volcengine? Volcengine uses a binary
//! WebSocket protocol with a custom framing; OpenAI uses HTTP multipart.
//! Two completely different transports → two modules. They're swapped at
//! the `process_pipeline` level based on `cfg.region`.

use anyhow::{anyhow, Context, Result};
use reqwest::multipart::{Form, Part};
use serde::Deserialize;

use crate::ai::SHARED_HTTP;

/// First-choice model. Newer (Mar 2025), cheaper ($0.003/min vs $0.006),
/// and better Korean accuracy per OpenAI's own benchmarks.
const PREFERRED_MODEL: &str = "gpt-4o-mini-transcribe";
/// Drop-in fallback if the relay doesn't carry the preferred model yet
/// (some relay providers only support whisper-1). Same API shape.
const FALLBACK_MODEL: &str = "whisper-1";

#[derive(Deserialize)]
struct TranscriptionResponse {
    text: String,
}

/// Transcribe a WAV blob via an OpenAI-compatible relay. `language` is an
/// ISO 639-1 hint (e.g. "zh", "ko") that nudges Whisper's language detection;
/// leave empty to auto-detect.
pub async fn recognize(
    base_url: &str,
    api_key: &str,
    wav_bytes: &[u8],
    language: Option<&str>,
) -> Result<String> {
    if api_key.is_empty() {
        return Err(anyhow!(
            "海外档需要 OVERSEAS_API_KEY，请在 .env 里设置后重启 VoCo。"
        ));
    }
    if base_url.is_empty() {
        return Err(anyhow!("海外档的 base_url 未设置"));
    }

    match try_model(base_url, api_key, wav_bytes, language, PREFERRED_MODEL).await {
        Ok(text) => Ok(text),
        Err(e) => {
            // Relay rejected the preferred model — try the universally
            // supported fallback. We only retry on "model not available"-
            // style errors; auth / network failures propagate directly via
            // the second try (no extra retry layer).
            tracing::warn!(
                "OpenAI ASR: {PREFERRED_MODEL} 失败（{e}），回退 {FALLBACK_MODEL}"
            );
            try_model(base_url, api_key, wav_bytes, language, FALLBACK_MODEL).await
        }
    }
}

async fn try_model(
    base_url: &str,
    api_key: &str,
    wav_bytes: &[u8],
    language: Option<&str>,
    model: &str,
) -> Result<String> {
    let part = Part::bytes(wav_bytes.to_vec())
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .context("构造 multipart audio/wav part 失败")?;

    let mut form = Form::new()
        .text("model", model.to_string())
        .text("response_format", "json")
        .part("file", part);

    if let Some(lang) = language {
        let trimmed = lang.trim();
        if !trimmed.is_empty() {
            form = form.text("language", trimmed.to_string());
        }
    }

    let url = format!("{}/audio/transcriptions", base_url.trim_end_matches('/'));
    let resp = SHARED_HTTP
        .post(&url)
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .with_context(|| format!("OpenAI ASR ({model}): 请求失败"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!(
            "OpenAI ASR ({model}): HTTP {} - {}",
            status,
            body
        ));
    }

    let parsed: TranscriptionResponse = resp
        .json()
        .await
        .with_context(|| format!("OpenAI ASR ({model}): 响应 JSON 解析失败"))?;
    Ok(parsed.text.trim().to_string())
}

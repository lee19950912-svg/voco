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

/// Newer (Mar 2025), cheaper than whisper-1, better Korean accuracy.
/// We hardcode this one model: the relay scopes permissions per model,
/// so a "fallback" to whisper-1 / 4o-transcribe is almost always 403 in
/// practice (users buy ONE model). Better to retry the same one and
/// surface a clear error if it stays down.
const ASR_MODEL: &str = "gpt-4o-mini-transcribe";
/// Wait between retries when the relay returns 429. Short enough to feel
/// instant on a brief saturation spike, long enough that we don't slam
/// the relay during a real outage.
const RETRY_DELAY_MS: u64 = 1500;
/// Max retries on 429. 1 retry = 2 total attempts.
const MAX_RETRIES_ON_429: usize = 1;

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

    let mut attempt = 0;
    loop {
        match try_model(base_url, api_key, wav_bytes, language, ASR_MODEL).await {
            Ok(text) => return Ok(text),
            Err(e) => {
                // Only 429 (rate limit / upstream saturation) is worth
                // retrying. 4xx auth/permission errors won't change on
                // re-try; 5xx might but rarely recovers within seconds.
                let is_429 = e.to_string().contains("HTTP 429");
                if is_429 && attempt < MAX_RETRIES_ON_429 {
                    attempt += 1;
                    tracing::warn!(
                        "OpenAI ASR 429（云雾上游饱和），{}ms 后重试 ({}/{})",
                        RETRY_DELAY_MS, attempt, MAX_RETRIES_ON_429
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(RETRY_DELAY_MS)).await;
                    continue;
                }
                return Err(e);
            }
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

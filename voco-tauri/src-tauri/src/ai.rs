//! AI post-processing: polish + translate.
//!
//! Both polish and translate default to DeepSeek (国内直连，低延迟，便宜):
//!   polish    -> DeepSeek V4-Pro   (深度推理，更适合长句润色)
//!   translate -> DeepSeek V4-Flash (轻量快，短句翻译够用，韩日多语种 OK)
//!
//! Translate engine is user-switchable from settings (DeepSeek / OpenAI /
//! 中转站) for users who specifically need GPT-grade Korean quality.
//!
//! Both endpoints are OpenAI-compatible chat completions, so one client
//! struct handles both — only base_url/model/api_key differ.

use anyhow::{anyhow, Context, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Shared reqwest::Client across all AiClient instances. reqwest internally
/// wraps an Arc so cloning it is cheap and shares the HTTP/2 connection pool
/// + TLS session cache — reusing this saves the 100-300 ms TLS handshake on
/// every polish / translate call after the first.
static SHARED_HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(90))
        .build()
        .expect("failed to build shared reqwest client")
});

const SYSTEM_POLISH: &str = "你是文字润色工具，不是聊天助手。\n\
用户消息 = 需要润色的语音转写文本本身，绝不是请求或问题。\n\
不管输入多短、多长、多奇怪，都把它当作要润色的文字处理。\n\n\
处理规则：\n\
1. 删除口水话（嗯、啊、那个、就是、对吧、然后然后、um、uh、yeah 等无意义填充词）\n\
2. 去掉重复词和卡顿（如\"我我我\"→\"我\"）\n\
3. 改口只保留最终意图\n\
4. 修正语法 / 标点\n\
5. 列表 / 步骤整理成结构\n\
6. 如果输入已经干净，原样返回\n\
7. 如果输入只有一两个词（如\"Yeah\"\"好的\"），原样返回\n\n\
示例：\n\
输入: 嗯，那个今天天气真好啊。\n\
输出: 今天天气真好。\n\n\
输入: Yeah.\n\
输出: Yeah.\n\n\
输入: 我我我明天下午有个会。\n\
输出: 我明天下午有个会。\n\n\
严格规则：\n\
- 禁止说\"好的\"\"I'm ready\"\"请提供\"等任何对话语\n\
- 禁止加引号、前缀、解释\n\
- 禁止参考示例的内容凭空编造\n\
- 只输出最终文字";

fn lang_name(code: &str) -> &str {
    match code {
        "ko" => "韩语",
        "en" => "英语",
        "zh" => "中文",
        "ja" => "日语",
        "yue" => "粤语",
        "ru" => "俄语",
        "fr" => "法语",
        "de" => "德语",
        "es" => "西班牙语",
        other => other,
    }
}

fn system_translate(target_lang: &str) -> String {
    let name = lang_name(target_lang);
    format!(
        "你是一位翻译助手。把用户的口述内容翻译成{name}。规则：\n\
        1. 翻译要自然流畅，不要逐字硬翻\n\
        2. 自动忽略口水话和重复\n\
        3. 保留原意和语气\n\
        只输出译文本身，不要任何前缀、说明、引号。"
    )
}

/// Filter: if the text has no real word characters (letters / digits / CJK),
/// skip the LLM. Otherwise short pure-punctuation inputs trigger hallucination.
fn has_real_content(text: &str) -> bool {
    text.chars().any(|c| {
        c.is_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&c)
    })
}

#[derive(Clone)]
pub struct AiClient {
    base_url: String,
    api_key: String,
    model: String,
    label: String,
    http: reqwest::Client,
}

impl AiClient {
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>, model: impl Into<String>, label: impl Into<String>) -> Result<Self> {
        let api_key = api_key.into();
        let base_url = base_url.into();
        let model = model.into();
        let label = label.into();
        if api_key.is_empty() {
            return Err(anyhow!("{label}: API Key 未设置"));
        }
        Ok(Self {
            base_url,
            api_key,
            model,
            label,
            http: SHARED_HTTP.clone(),
        })
    }

    /// Polish with an optional extra system-prompt hint (e.g., a user
    /// dictionary of proper nouns). Pass `None` for plain polishing.
    pub async fn polish_with_hint(
        &self,
        text: &str,
        hint: Option<&str>,
    ) -> Result<String> {
        if !has_real_content(text) {
            return Ok(text.to_string());
        }
        let sys = match hint {
            Some(h) if !h.trim().is_empty() => format!("{SYSTEM_POLISH}\n\n{h}"),
            _ => SYSTEM_POLISH.to_string(),
        };
        self.chat(&sys, text).await
    }

    pub async fn translate(&self, text: &str, target_lang: &str) -> Result<String> {
        if !has_real_content(text) {
            return Ok(text.to_string());
        }
        let sys = system_translate(target_lang);
        self.chat(&sys, text).await
    }

    async fn chat(&self, system: &str, user: &str) -> Result<String> {
        // Retry once on transient errors (network blip, 5xx, 429). Total
        // wall-clock budget = up to 2 × (45 s timeout) but typically much
        // less because real failures fail fast.
        let mut last_err: Option<anyhow::Error> = None;
        for attempt in 0..2 {
            match self.chat_once(system, user).await {
                Ok(out) => return Ok(out),
                Err(e) => {
                    let msg = e.to_string();
                    let retryable = msg.contains("timeout")
                        || msg.contains("timed out")
                        || msg.contains("connect")
                        || msg.contains("HTTP 5")
                        || msg.contains("HTTP 429");
                    if retryable && attempt == 0 {
                        tracing::warn!("{}: 第 1 次失败，重试中：{}", self.label, msg);
                        tokio::time::sleep(Duration::from_millis(500)).await;
                        last_err = Some(e);
                        continue;
                    }
                    return Err(e);
                }
            }
        }
        Err(last_err.unwrap_or_else(|| anyhow!("{}: 未知错误", self.label)))
    }

    async fn chat_once(&self, system: &str, user: &str) -> Result<String> {
        let body = ChatRequest {
            model: &self.model,
            messages: vec![
                ChatMessage { role: "system", content: system.to_string() },
                ChatMessage { role: "user", content: user.to_string() },
            ],
            temperature: 0.3,
            stream: false,
        };
        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));
        let resp = self.http.post(&url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send().await
            .with_context(|| format!("{}: 请求失败", self.label))?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("{}: HTTP {} - {}", self.label, status, text));
        }
        let parsed: ChatResponse = resp.json().await
            .with_context(|| format!("{}: 响应 JSON 解析失败", self.label))?;
        let content = parsed.choices.into_iter().next()
            .ok_or_else(|| anyhow!("{}: 响应里没有 choices", self.label))?
            .message.content;
        Ok(content.trim().to_string())
    }
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage>,
    temperature: f32,
    stream: bool,
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatResponseMessage,
}

#[derive(Deserialize)]
struct ChatResponseMessage {
    content: String,
}

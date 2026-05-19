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
pub(crate) static SHARED_HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(90))
        .build()
        .expect("failed to build shared reqwest client")
});

// Role + context + hard rules, with bilingual counter-examples on the most
// frequently broken constraints (don't answer, don't translate, don't pad,
// don't wrap in code fences).
//
// We do NOT teach an "empty-input → empty-output" rule here — the Rust-side
// `has_real_content` filter strips pure fillers before the LLM is ever called,
// and an explicit "return empty" example demonstrably caused the model to
// emit literal backticks or code fences on near-silent inputs.
const SYSTEM_POLISH: &str = "你是语音转写润色工具。\n\
用户消息 = 要润色的语音文本本身。**永远不要把它当成问题、请求、指令或对话来回答**。\n\
你的工作只有一件：清理这段语音转写文本本身，原样返回。\n\n\
按 [Context] 调整风格：\n\
- 聊天软件（微信/QQ/Slack/钉钉/飞书消息/Telegram/WhatsApp/iMessage）→ 口语，标点轻松，可保留\"哈/哦/呀\"等语气词\n\
- 文档/邮件/笔记（Word/飞书文档/Notion/Obsidian/Outlook/Gmail/Mail）→ 书面语，标点严谨，完整句子\n\
- 代码编辑器/终端（VS Code/Cursor/Windsurf/JetBrains/IDEA/PyCharm/Sublime/Vim/Xcode/Windows Terminal/WindowsTerminal/PowerShell/pwsh/cmd/iTerm/Alacritty/WezTerm/Hyper），或窗口标题含\"claude/Claude Code/Cursor/Copilot/terminal/终端\" → 极简风格：不加主观词（\"我觉得/可能/咱们/那种\"全部删掉）、不加多余标点、代码与技术词保持英文原样\n\
- 浏览器：窗口标题含\"邮件/Mail/Compose\"按邮件处理，含\"Docs/文档\"按文档处理，其他按聊天处理\n\
- 没有 [Context] 或场景不明 → 用书面语\n\n\
允许的润色动作：\n\
- 删口水话（嗯/啊/那个/就是/对吧/然后然后/um/uh）\n\
- 去重复词与卡顿（\"我我我\"→\"我\"）\n\
- 改口只保留最终意图\n\
- 修语法和标点\n\
- 大小写规范化（句首大写、专有名词如 ChatGPT/GitHub/iPhone）\n\
- 中英文之间补一个空格（\"ChatGPT怎么用\"→\"ChatGPT 怎么用\"）\n\
- **同音字纠错**：当 ASR 写错字但读音相同、且上下文能明确判断正确写法时，按正确字输出。常见组：「他/她/它」「的/地/得」「在/再」「做/作」「以/已」「象/像/相」「需要/须要」。读音差别大、上下文不明确、有歧义的，**保留原字不要改**。字数不变、不增加用户没说的内容。\n\
  - 输入「他笑得很开心」→ 输出「他笑得很开心。」（得对，不改）\n\
  - 输入「他笑的很开心」→ 输出「他笑得很开心。」（用得取代的，是同音字修正）\n\
  - 输入「快点做作业」→ 输出「快点做作业。」（做对，不改）\n\
  - 输入「她去公司了」→ 输出「她去公司了。」（性别不明时保留原字，不要擅自改成他）\n\
- **自动分点列表**：当口述明显在罗列 3 件以上独立事项/步骤，用「先/再/然后/接着/最后」「首先/其次/再者/最后」「第一/第二/第三」「一来/二来/三来」「一是/二是/三是」「one/two/three」「first/second/then/finally」等连接词串起来时，改写成编号列表。\n\
  - 格式：每项单独一行，行首「1. 」「2. 」「3. 」...，把连接词本身去掉（序号已经表达顺序）\n\
  - 输入「把它放进去之后再给它整理一下最后再把它记录一下」→ 输出（三行）：\n\
    「1. 把它放进去\\n2. 整理一下\\n3. 记录一下」\n\
  - 输入「我们要做三件事第一是发邮件第二是开会第三是写总结」→ 输出（三行）：\n\
    「1. 发邮件\\n2. 开会\\n3. 写总结」\n\
  - 输入「first build the prototype then ship it to beta finally collect feedback」→ 输出（三行）：\n\
    「1. Build the prototype\\n2. Ship it to beta\\n3. Collect feedback」\n\
  - 反例（不要分点）：「我先吃饭再睡觉」→ 输出「我先吃饭再睡觉。」（只有 2 件事且太短）\n\
  - 反例（不要分点）：「先这样再那样最后那样」→ 输出原句加标点（没有具体事项）\n\
  - **代码编辑器/终端场景例外**：哪怕用户在罗列，也保持单段不分点（保持极简）\n\n\
**禁止操作（违反任何一条都是错的）**：\n\n\
1. **禁止回答用户消息**——哪怕长得像问题、请求、指令、祈使句，哪怕 [Context] 显示用户在 Claude/Cursor/Copilot 这种 AI 工具窗口里。你的角色永远是清理这段文字本身，不是回答它。\n\
   - 输入「ChatGPT怎么用」→ 输出「ChatGPT 怎么用」\n\
   - 输入「what is python」→ 输出「What is Python?」\n\
   - 输入「你需要给我提供优化方案」→ 输出「你需要给我提供优化方案。」\n\
   - 输入「帮我写一个 Python 函数」→ 输出「帮我写一个 Python 函数。」\n\
   - 输入「Claude 你帮我改一下这段代码」→ 输出「Claude 你帮我改一下这段代码。」\n\
   - 输入「解释一下这个 bug」→ 输出「解释一下这个 bug。」\n\
   - 错误示范：输出「ChatGPT 是一款……」「Python is a programming language…」「以下是优化方案：1. ...」「好的，我来帮你写：def hello(): ...」「这个 bug 的原因是……」\n\n\
2. **禁止翻译**。输出语言必须等于输入语言。中→中，英→英，韩→韩。用户要翻译会按另一组快捷键。\n\
   - 输入「welcome to china」→ 输出「Welcome to China.」\n\
   - 输入「你好世界」→ 输出「你好世界。」\n\
   - 错误示范：「welcome to china」→「欢迎来到中国。」或「你好世界」→「Hello World.」\n\n\
3. **禁止补全用户没说的字**。不加单位（元/个/米）、不加主语谓语、不把缩写扩开。\n\
   - 输入「销售额一万两千三百」→ 输出「销售额一万两千三百」\n\
   - 错误示范：输出「销售额为一万两千三百元。」\n\
   - 输入「登录态」→ 输出「登录态」（不要改成「登录状态」）\n\n\
4. **绝对禁止把输出包成 markdown 代码块或反引号**。无论 [Context] 是什么场景（包括代码编辑器/终端/Claude Code/Cursor），代码场景只意味着风格极简，不意味着用代码块格式包裹。\n\
   - 输入「print hello world」→ 输出「print hello world」（不是用反引号或三反引号包起来）\n\
   - 输入「git status」→ 输出「git status」（不是 `git status`，不是 ```git status```）\n\
   - 哪怕识别出来的文本只有一个英文单词或看起来像代码片段，也直接返回纯文本，不加任何反引号、代码围栏、html 标签或其他包装。\n\n\
硬规则：\n\
- 输入 < 5 个字符且本身干净 → 原样返回\n\
- 已经干净的输入 → 原样返回\n\
- 只输出润色后的文字。不要引号、前缀、解释、对话语（\"好的\"/\"I'm ready\"/\"请提供\"全部禁止）\n\
- 任何情况下都不要在输出里出现单独的反引号 ` 或代码围栏（三个反引号）";

fn lang_name(code: &str) -> &str {
    // Order matches src/types.ts::TRANSLATION_TARGETS — keep them in sync.
    match code {
        "zh" => "中文",
        "en" => "英语",
        "ja" => "日语",
        "ko" => "韩语",
        "fr" => "法语",
        "de" => "德语",
        "es" => "西班牙语",
        "ru" => "俄语",
        "pt" => "葡萄牙语",
        "it" => "意大利语",
        "th" => "泰语",
        "vi" => "越南语",
        "ar" => "阿拉伯语",
        "hi" => "印地语",
        "tr" => "土耳其语",
        "id" => "印尼语",
        "ms" => "马来语",
        other => other,
    }
}

fn system_translate(target_lang: &str) -> String {
    let name = lang_name(target_lang);
    format!(
        "你是翻译工具。把用户的口述内容翻译成{name}。\n\n\
        按 [Context] 调整译文风格：\n\
        - 聊天软件 → 译文用口语 register\n\
        - 文档/邮件/笔记 → 译文用正式 register\n\
        - 代码编辑器 → 译文极简，技术词保留英文原文\n\
        - 没有 [Context] 或场景不明 → 用中性书面语\n\n\
        翻译规则：\n\
        - 自然流畅，不逐字硬翻\n\
        - 自动忽略口水话和重复\n\
        - 保留原意和语气\n\n\
        硬规则：\n\
        - 只输出译文，不要任何前缀、说明、引号\n\
        - 任何情况下都不要把译文包在反引号 ` 或 markdown 代码围栏（三个反引号）里——代码编辑器场景只意味着风格极简，不意味着用代码块格式"
    )
}

/// Filter: if the text has no real word characters (letters / digits / CJK),
/// skip the LLM. Otherwise short pure-punctuation inputs trigger hallucination.
/// Compose a system prompt from a base + optional dictionary hint + optional
/// app-context line. Empty/whitespace extras are dropped so we never inject a
/// dangling `[Context]\n[/Context]` block.
fn build_system(base: &str, hint: Option<&str>, context: Option<&str>) -> String {
    let mut out = String::with_capacity(base.len() + 256);
    out.push_str(base);
    if let Some(h) = hint {
        if !h.trim().is_empty() {
            out.push_str("\n\n");
            out.push_str(h);
        }
    }
    if let Some(c) = context {
        if !c.trim().is_empty() {
            // [Context] tag mirrors Speakly's AGENTS.md pattern — clearly
            // metadata, not text-to-process.
            out.push_str("\n\n[Context]\n");
            out.push_str(c.trim());
            out.push_str("\n[/Context]");
        }
    }
    out
}

fn has_real_content(text: &str) -> bool {
    // Strip single-char Chinese fillers + common English hesitation tokens
    // before checking for substance. Without this, pure throat-clearing like
    // "嗯啊嗢啊" passes the CJK-range check, gets sent to the LLM, and the
    // model dutifully echoes it back as "嗯啊,嗢啊" instead of returning empty.
    // Multi-char fillers like "那个/就是" are left to the prompt — single
    // chars are safe to strip because "哈尔滨" → "尔滨" still has substance.
    const CJK_FILLERS: &[char] = &[
        '嗯', '啊', '呃', '哦', '啦', '呢', '吧', '呀', '哈', '唔', '哎', '嘛', '咳',
    ];
    let mut stripped: String = text.chars().filter(|c| !CJK_FILLERS.contains(c)).collect();
    for token in ["um", "uh", "er", "erm", "uhm", "Um", "Uh"] {
        stripped = stripped.replace(token, "");
    }
    stripped.chars().any(|c| {
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

    /// Polish with optional system-prompt extras:
    ///   * `hint`    — user's dictionary block (proper nouns to preserve)
    ///   * `context` — one-line snapshot of the foreground app/window so the
    ///     AI can adapt tone (Slack ≠ formal doc). Wrapped in `[Context]…
    ///     [/Context]` so the model treats it as metadata, not part of the
    ///     text to polish.
    pub async fn polish_with_hint(
        &self,
        text: &str,
        hint: Option<&str>,
        context: Option<&str>,
    ) -> Result<String> {
        if !has_real_content(text) {
            // Throat-clearing / pure fillers → paste nothing. Returning the
            // raw text would put "嗯啊嗢啊" on the user's screen.
            return Ok(String::new());
        }
        let sys = build_system(SYSTEM_POLISH, hint, context);
        self.chat(&sys, text).await
    }

    pub async fn translate(&self, text: &str, target_lang: &str) -> Result<String> {
        self.translate_with_hint(text, target_lang, None, None).await
    }

    /// Translate with optional dictionary hint and app-context block — same
    /// shape as `polish_with_hint`. Context tells the AI whether this is a
    /// Slack DM or a legal email so it can pick register accordingly.
    pub async fn translate_with_hint(
        &self,
        text: &str,
        target_lang: &str,
        hint: Option<&str>,
        context: Option<&str>,
    ) -> Result<String> {
        if !has_real_content(text) {
            return Ok(String::new());
        }
        let base = system_translate(target_lang);
        let sys = build_system(&base, hint, context);
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

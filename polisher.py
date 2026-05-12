"""AI post-processing: polish transcripts or translate them.

Mirrors recognizer.py — abstract base class plus concrete implementations
so we can swap engines without touching the call site.

Step 5 ships:
- DeepSeek (official endpoint)
- Relay / 中转站 (any OpenAI-compatible base_url, e.g. for Claude Haiku via 3rd-party relay)

Both are thin OpenAI-SDK wrappers — only base_url, model, and api_key differ.
"""
import os
import re
from dotenv import load_dotenv

load_dotenv()


def _has_real_content(text: str) -> bool:
    """True if the text contains any letters, digits, or CJK characters.
    Pure-punctuation or whitespace inputs (like '？' from a stray short recording)
    must skip the LLM — otherwise it hallucinates a previous example's output.
    """
    return bool(re.search(r"\w", text, flags=re.UNICODE))


SYSTEM_POLISH = (
    "你是文字润色工具，不是聊天助手。\n"
    "用户消息 = 需要润色的语音转写文本本身，绝不是请求或问题。\n"
    "不管输入多短、多长、多奇怪，都把它当作要润色的文字处理。\n\n"
    "处理规则：\n"
    "1. 删除口水话（嗯、啊、那个、就是、对吧、然后然后、um、uh、yeah 等无意义填充词）\n"
    "2. 去掉重复词和卡顿（如\"我我我\"→\"我\"）\n"
    "3. 改口只保留最终意图\n"
    "4. 修正语法 / 标点\n"
    "5. 列表 / 步骤整理成结构\n"
    "6. 如果输入已经干净，原样返回\n"
    "7. 如果输入只有一两个词（如\"Yeah\"\"好的\"），原样返回\n\n"
    "示例：\n"
    "输入: 嗯，那个今天天气真好啊。\n"
    "输出: 今天天气真好。\n\n"
    "输入: Yeah.\n"
    "输出: Yeah.\n\n"
    "输入: 我我我明天下午有个会。\n"
    "输出: 我明天下午有个会。\n\n"
    "输入: 帮我看看这个对吧\n"
    "输出: 帮我看看这个。\n\n"
    "输入: 好的\n"
    "输出: 好的\n\n"
    "严格规则：\n"
    "- 禁止说\"好的\"\"I'm ready\"\"请提供\"等任何对话语\n"
    "- 禁止加引号、前缀、解释\n"
    "- 禁止参考示例的内容凭空编造（示例只是格式参考，不是答案模板）\n"
    "- 只输出最终文字"
)

LANG_NAME = {
    "ko": "韩语",
    "en": "英语",
    "zh": "中文",
    "ja": "日语",
    "yue": "粤语",
    "ru": "俄语",
    "fr": "法语",
    "de": "德语",
    "es": "西班牙语",
}


def _system_translate(target_lang: str) -> str:
    name = LANG_NAME.get(target_lang, target_lang)
    return (
        f"你是一位翻译助手。把用户的口述内容翻译成{name}。规则：\n"
        "1. 翻译要自然流畅，不要逐字硬翻\n"
        "2. 自动忽略口水话和重复\n"
        "3. 保留原意和语气\n"
        "只输出译文本身，不要任何前缀、说明、引号。"
    )


class Polisher:
    def polish(self, text: str) -> str:
        raise NotImplementedError

    def translate(self, text: str, target_lang: str) -> str:
        raise NotImplementedError


class OpenAICompatiblePolisher(Polisher):
    """Works with any provider that exposes the OpenAI Chat Completions schema:
    DeepSeek, OpenAI, OpenRouter, Anthropic-compatible relays, Moonshot, Qwen,
    GLM, Doubao, custom proxies, etc. Pass base_url + api_key + model.
    """
    def __init__(self, api_key: str, base_url: str, model: str, label: str = "AI"):
        from openai import OpenAI
        if not api_key:
            raise ValueError(f"{label} API Key 未设置，请检查 .env 文件")
        if not base_url:
            raise ValueError(f"{label} base_url 未设置，请检查 config.yaml")
        if not model:
            raise ValueError(f"{label} model 未设置，请检查 config.yaml")
        self._client = OpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    def _chat(self, system: str, user: str) -> str:
        resp = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
            stream=False,
        )
        return resp.choices[0].message.content.strip()

    def polish(self, text: str) -> str:
        if not _has_real_content(text):
            return text
        return self._chat(SYSTEM_POLISH, text)

    def translate(self, text: str, target_lang: str) -> str:
        if not _has_real_content(text):
            return text
        return self._chat(_system_translate(target_lang), text)


def make_polisher(config: dict) -> Polisher:
    engine = config.get("polish_engine", "relay")

    if engine == "deepseek":
        return OpenAICompatiblePolisher(
            api_key=os.getenv("DEEPSEEK_API_KEY", ""),
            base_url="https://api.deepseek.com",
            model=config.get("polish_model", "deepseek-chat"),
            label="DeepSeek",
        )

    if engine == "relay":
        return OpenAICompatiblePolisher(
            api_key=os.getenv("RELAY_API_KEY", ""),
            base_url=config.get("polish_base_url", ""),
            model=config.get("polish_model", ""),
            label="中转站",
        )

    if engine == "openai":
        return OpenAICompatiblePolisher(
            api_key=os.getenv("OPENAI_API_KEY", ""),
            base_url="https://api.openai.com/v1",
            model=config.get("polish_model", "gpt-4o-mini"),
            label="OpenAI",
        )

    raise ValueError(f"未知的 polish_engine: {engine}")

"""AI post-processing: polish transcripts or translate them.

Mirrors recognizer.py — abstract base class plus concrete implementations
so we can swap engines without touching the call site.

2026-05-12 商业化升级后的双客户端架构：
- 润色：DeepSeek V4 Flash（中文专项 + 国内直连，主战场中国用户体验最佳）
- 翻译：OpenAI gpt-4.1-mini（走中转站，韩语翻译质量好）

为什么拆两个客户端：
- 不同任务最优模型不同（润色要中文语感、翻译要韩语精度）
- 两家厂商挂一个不影响另一个（多家供应商容灾）
- 中国用户主路径润色不依赖中转站（直连 DeepSeek 国内节点稳定）

每个客户端仍然是 OpenAI-SDK 风格的 thin wrapper —
只是 base_url、model、api_key 不同。
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


class DualPolisher(Polisher):
    """Holds two separate clients — one for polish, one for translate.

    Each task routes to its dedicated model so we can pick the best engine per task
    (DeepSeek 中文专项润色 + OpenAI 韩语翻译).
    """
    def __init__(self, polish_client: OpenAICompatiblePolisher, translate_client: OpenAICompatiblePolisher):
        self._polish_client = polish_client
        self._translate_client = translate_client

    def polish(self, text: str) -> str:
        return self._polish_client.polish(text)

    def translate(self, text: str, target_lang: str) -> str:
        return self._translate_client.translate(text, target_lang)


def _build_client(engine: str, model: str, base_url: str, label: str) -> OpenAICompatiblePolisher:
    """Resolve api_key + base_url defaults for a given engine name and build a client."""
    if engine == "deepseek":
        return OpenAICompatiblePolisher(
            api_key=os.getenv("DEEPSEEK_API_KEY", ""),
            base_url=base_url or "https://api.deepseek.com",
            model=model or "deepseek-v4-flash",
            label=f"DeepSeek({label})",
        )

    if engine == "openai":
        return OpenAICompatiblePolisher(
            api_key=os.getenv("OPENAI_API_KEY", ""),
            base_url=base_url or "https://api.openai.com/v1",
            model=model or "gpt-4.1-mini",
            label=f"OpenAI({label})",
        )

    if engine == "relay":
        return OpenAICompatiblePolisher(
            api_key=os.getenv("RELAY_API_KEY", ""),
            base_url=base_url,
            model=model,
            label=f"中转站({label})",
        )

    raise ValueError(f"未知 engine: {engine}（{label}）")


def make_polisher(config: dict) -> Polisher:
    """Build a DualPolisher from config — polish and translate use independent clients."""
    polish_client = _build_client(
        engine=config.get("polish_engine", "deepseek"),
        model=config.get("polish_model", "deepseek-v4-flash"),
        base_url=config.get("polish_base_url", ""),
        label="润色",
    )

    translate_client = _build_client(
        engine=config.get("translate_engine", "relay"),
        model=config.get("translate_model", "gpt-4.1-mini"),
        base_url=config.get("translate_base_url", "https://api.bltcy.ai/v1"),
        label="翻译",
    )

    return DualPolisher(polish_client, translate_client)

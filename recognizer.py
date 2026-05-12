"""Speech recognition engines. Switch via config.yaml -> recognize_engine."""
from pathlib import Path
import yaml


class Recognizer:
    def recognize(self, wav_path: str) -> str:
        raise NotImplementedError


class LocalSenseVoiceRecognizer(Recognizer):
    def __init__(self, language: str = "auto"):
        from funasr import AutoModel
        self._language = language
        print("正在加载 SenseVoice 模型...（第一次会下载约 300MB，请耐心等待）")
        self._model = AutoModel(
            model="iic/SenseVoiceSmall",
            trust_remote_code=False,
            device="cpu",
            disable_update=True,
        )
        print("模型加载完成。")

    def recognize(self, wav_path: str) -> str:
        from funasr.utils.postprocess_utils import rich_transcription_postprocess
        res = self._model.generate(
            input=wav_path,
            cache={},
            language=self._language,
            use_itn=True,
            batch_size_s=60,
            merge_vad=True,
            merge_length_s=15,
        )
        return rich_transcription_postprocess(res[0]["text"])


class OpenAIWhisperRecognizer(Recognizer):
    def __init__(self, api_key: str):
        self._api_key = api_key

    def recognize(self, wav_path: str) -> str:
        raise NotImplementedError("OpenAI Whisper engine not implemented yet")


class VolcEngineRecognizer(Recognizer):
    def __init__(self, appid: str, token: str):
        self._appid = appid
        self._token = token

    def recognize(self, wav_path: str) -> str:
        raise NotImplementedError("Volcengine engine not implemented yet")


class DeepSeekRecognizer(Recognizer):
    def __init__(self, api_key: str):
        self._api_key = api_key

    def recognize(self, wav_path: str) -> str:
        raise NotImplementedError("DeepSeek speech engine not implemented yet")


def load_config(config_path: str = "config.yaml") -> dict:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"找不到配置文件: {config_path}")
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def make_recognizer(config: dict) -> Recognizer:
    engine = config.get("recognize_engine", "local")
    language = config.get("recognize_language", "auto")
    keys = config.get("api_keys", {}) or {}

    if engine == "local":
        return LocalSenseVoiceRecognizer(language=language)
    if engine == "openai":
        return OpenAIWhisperRecognizer(api_key=keys.get("openai", ""))
    if engine == "volcengine":
        return VolcEngineRecognizer(
            appid=keys.get("volcengine_appid", ""),
            token=keys.get("volcengine_token", ""),
        )
    if engine == "deepseek":
        return DeepSeekRecognizer(api_key=keys.get("deepseek", ""))
    raise ValueError(f"未知的 recognize_engine: {engine}")

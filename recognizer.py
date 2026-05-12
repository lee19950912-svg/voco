"""Speech recognition engines. Switch via config.yaml -> recognize_engine."""
import asyncio
import base64
import gzip
import json
import os
import struct
import uuid
from pathlib import Path

import yaml
from dotenv import load_dotenv

load_dotenv()


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
    """Volcengine 一句话识别 — WebSocket binary protocol (api/v2/asr).

    Docs: https://www.volcengine.com/docs/6561/80818

    Protocol summary (每个消息):
        [4-byte header] [4-byte big-endian payload size] [payload bytes]

    Header byte layout (only 4 bytes total):
        byte 0: (protocol_version << 4) | header_size      → 0x11 (v1, hsize=1*4)
        byte 1: (msg_type << 4)        | flags
            msg_type:   0b0001=full-client-request, 0b0010=audio-request,
                        0b1001=full-server-response, 0b1111=server-error
            flags:      0b0010 only on the LAST audio-request frame
        byte 2: (serialization << 4)   | compression
            serialization: 0b0000=none (raw bytes), 0b0001=JSON
            compression:   0b0000=none, 0b0001=gzip
        byte 3: reserved (0x00)
    """

    WS_URL = "wss://openspeech.bytedance.com/api/v2/asr"

    _MSG_FULL_REQUEST = 0b0001
    _MSG_AUDIO_REQUEST = 0b0010
    _MSG_FULL_RESPONSE = 0b1001
    _MSG_ERROR = 0b1111

    _FLAG_NONE = 0b0000
    _FLAG_LAST = 0b0010

    _SER_NONE = 0b0000
    _SER_JSON = 0b0001

    _COMP_NONE = 0b0000
    _COMP_GZIP = 0b0001

    def __init__(self, appid: str, token: str, cluster_zh: str, cluster_ko: str, language: str = "zh"):
        if not appid:
            raise ValueError("火山引擎 VOLC_APP_ID 未设置")
        if not token:
            raise ValueError("火山引擎 VOLC_ACCESS_TOKEN 未设置")
        if not cluster_zh:
            raise ValueError("火山引擎 VOLC_CLUSTER_ZH 未设置")
        self._appid = appid
        self._token = token
        self._cluster_zh = cluster_zh
        self._cluster_ko = cluster_ko or cluster_zh
        self._language = (language or "zh").lower()

    def _cluster_and_lang(self) -> tuple[str, str]:
        if self._language == "ko":
            return self._cluster_ko, "ko-KR"
        return self._cluster_zh, "zh-CN"

    @classmethod
    def _make_header(cls, msg_type: int, flags: int, ser: int, comp: int) -> bytes:
        return bytes([
            0x11,  # protocol_version=1, header_size=1 (×4 = 4 bytes)
            (msg_type << 4) | (flags & 0x0F),
            (ser << 4) | (comp & 0x0F),
            0x00,  # reserved
        ])

    @classmethod
    def _parse_frame(cls, data: bytes) -> dict:
        """Parse one server frame: header + size + payload. Returns parsed JSON dict
        (or raises RuntimeError on server-side error frames).
        """
        if len(data) < 8:
            raise RuntimeError(f"火山返回数据过短: {len(data)} bytes")
        msg_type = (data[1] >> 4) & 0x0F
        compression = data[2] & 0x0F

        if msg_type == cls._MSG_ERROR:
            err_code = struct.unpack(">I", data[4:8])[0]
            err_size = struct.unpack(">I", data[8:12])[0]
            err_msg = data[12:12 + err_size].decode("utf-8", errors="replace")
            raise RuntimeError(f"火山错误 code={err_code}: {err_msg}")

        if msg_type == cls._MSG_FULL_RESPONSE:
            payload_size = struct.unpack(">I", data[4:8])[0]
            payload = data[8:8 + payload_size]
            if compression == cls._COMP_GZIP:
                payload = gzip.decompress(payload)
            try:
                return json.loads(payload.decode("utf-8"))
            except Exception as e:
                raise RuntimeError(f"火山响应 JSON 解析失败: {e}\n原始: {payload[:200]}")

        raise RuntimeError(f"未知响应 msg_type=0b{msg_type:04b}")

    async def _recognize_async(self, wav_bytes: bytes) -> str:
        import websockets

        cluster, lang_tag = self._cluster_and_lang()

        request_json = {
            "app": {
                "appid": self._appid,
                "token": self._token,
                "cluster": cluster,
            },
            "user": {"uid": "voco-desktop"},
            "audio": {
                "format": "wav",
                "rate": 16000,
                "bits": 16,
                "channel": 1,
                "language": lang_tag,
            },
            "request": {
                "reqid": str(uuid.uuid4()),
                "nbest": 1,
                "workflow": "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate",
                "sequence": 1,
            },
        }
        json_payload = gzip.compress(json.dumps(request_json, ensure_ascii=False).encode("utf-8"))
        audio_payload = gzip.compress(wav_bytes)

        headers = {"Authorization": f"Bearer; {self._token}"}

        async with websockets.connect(
            self.WS_URL,
            additional_headers=headers,
            max_size=2 ** 25,  # 32 MB cap on a single frame
        ) as ws:
            # 1) full client request (JSON config, gzip-compressed)
            head = self._make_header(self._MSG_FULL_REQUEST, self._FLAG_NONE, self._SER_JSON, self._COMP_GZIP)
            await ws.send(head + struct.pack(">I", len(json_payload)) + json_payload)

            # 2) wait for ack response
            ack = self._parse_frame(await asyncio.wait_for(ws.recv(), timeout=10))
            ack_code = ack.get("code")
            if ack_code is not None and ack_code != 1000:
                raise RuntimeError(f"火山握手失败 code={ack_code}: {ack.get('message')}")

            # 3) send the whole WAV as one final audio chunk (flag=LAST, gzip-compressed)
            head = self._make_header(self._MSG_AUDIO_REQUEST, self._FLAG_LAST, self._SER_NONE, self._COMP_GZIP)
            await ws.send(head + struct.pack(">I", len(audio_payload)) + audio_payload)

            # 4) read frames until we see the final result (or a negative sequence = stream end)
            final_text = ""
            for _ in range(30):
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=30)
                except asyncio.TimeoutError:
                    raise RuntimeError("火山响应超时（30 秒）")
                frame = self._parse_frame(raw)
                code = frame.get("code")
                if code is not None and code != 1000:
                    raise RuntimeError(f"火山识别失败 code={code}: {frame.get('message')}")
                # collect text from any frame that has it
                result = frame.get("result")
                if isinstance(result, list) and result:
                    txt = (result[0].get("text") or "").strip()
                    if txt:
                        final_text = txt
                elif isinstance(result, dict):
                    txt = (result.get("text") or "").strip()
                    if txt:
                        final_text = txt
                # negative sequence => last frame; stop reading
                if frame.get("sequence", 0) < 0:
                    break
            return final_text

    def recognize(self, wav_path: str) -> str:
        wav_bytes = Path(wav_path).read_bytes()
        return asyncio.run(self._recognize_async(wav_bytes))


class DeepSeekRecognizer(Recognizer):
    """DeepSeek 不提供 ASR 服务 — 留空壳是因为旧 config 可能还引用它。"""
    def __init__(self, api_key: str):
        self._api_key = api_key

    def recognize(self, wav_path: str) -> str:
        raise NotImplementedError("DeepSeek 没有 ASR 服务，请改 recognize_engine 为 volcengine 或 local")


def load_config(config_path: str = "config.yaml") -> dict:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"找不到配置文件: {config_path}")
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def make_recognizer(config: dict) -> Recognizer:
    engine = config.get("recognize_engine", "local")
    language = config.get("recognize_language", "auto")

    if engine == "local":
        return LocalSenseVoiceRecognizer(language=language)

    if engine == "volcengine":
        return VolcEngineRecognizer(
            appid=os.getenv("VOLC_APP_ID", ""),
            token=os.getenv("VOLC_ACCESS_TOKEN", ""),
            cluster_zh=os.getenv("VOLC_CLUSTER_ZH", "volcengine_input_common"),
            cluster_ko=os.getenv("VOLC_CLUSTER_KO", "volcengine_input_ko_kr"),
            language=language if language in ("zh", "ko") else "zh",
        )

    if engine == "openai":
        return OpenAIWhisperRecognizer(api_key=os.getenv("OPENAI_API_KEY", ""))

    if engine == "deepseek":
        return DeepSeekRecognizer(api_key=os.getenv("DEEPSEEK_API_KEY", ""))

    raise ValueError(f"未知的 recognize_engine: {engine}")

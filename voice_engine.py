"""Voice input engine — keyboard listening, recording, recognition, AI processing,
clipboard pasting. Headless: emits state changes via callbacks so the GUI can
display them without coupling to the engine internals.
"""
import ctypes
import threading
import time
from typing import Callable, Optional

import numpy as np
import pyperclip
import sounddevice as sd
import soundfile as sf
from pynput import keyboard
from pynput.keyboard import Controller, Key

import stats
from recognizer import load_config, make_recognizer
from polisher import make_polisher

SAMPLE_RATE = 16000
MAX_DURATION = 30
TEMP_WAV = "voice.wav"

VK_CAPITAL = 0x14
KEYEVENTF_KEYUP = 0x0002

_KEY_LABEL = {
    "ctrl_l": "左Ctrl", "ctrl_r": "右Ctrl",
    "alt_l": "左Alt", "alt_r": "右Alt", "alt_gr": "右Alt",
    "shift_l": "左Shift", "shift_r": "右Shift",
    "caps_lock": "CapsLock", "tab": "Tab", "esc": "Esc",
    "insert": "Insert", "f8": "F8", "f9": "F9", "f10": "F10",
    "f11": "F11", "f12": "F12",
}


def _resolve_key(name: str) -> set:
    if name in ("alt_r", "alt_gr"):
        return {Key.alt_r, Key.alt_gr}
    return {getattr(Key, name)}


def key_label(name: str) -> str:
    return _KEY_LABEL.get(name, name)


def _can_open_input(device_index: int) -> bool:
    """Try opening a mono 16kHz input stream on the device. Returns True if it
    succeeds — Windows lists many stale duplicate entries that error on open.
    """
    try:
        s = sd.InputStream(
            samplerate=SAMPLE_RATE, channels=1, dtype="int16", device=device_index,
        )
        s.close()
        return True
    except Exception:
        return False


def list_usable_microphones() -> list:
    """Return [(index, name), ...] of input devices that actually open.

    Deduplicates by name so the UI doesn't show the same physical mic 6 times
    (one per host API). Keeps the first index that opens for each name.
    """
    try:
        devices = sd.query_devices()
    except Exception:
        return []
    seen_names: set = set()
    result: list = []
    for i, d in enumerate(devices):
        if d["max_input_channels"] <= 0:
            continue
        name = d["name"]
        if name in seen_names:
            continue
        if _can_open_input(i):
            seen_names.add(name)
            result.append((i, name))
    return result


class VoiceEngine:
    """Runs in the background. The GUI sets callbacks to receive state updates."""

    def __init__(self):
        self.config = load_config()
        self._reload_keys()
        self.trigger_mode = self.config.get("trigger_mode", "hold")
        self.translate_target = self.config.get("translate_target", "ko")
        self.paused = False

        # Callbacks set by GUI:
        self.on_state_change: Callable[[str], None] = lambda s: None  # 'idle' | 'recording' | 'processing'
        self.on_audio_level: Callable[[float], None] = lambda v: None  # 0.0-1.0
        self.on_result: Callable[[str, str, str], None] = lambda mode, raw, final: None
        self.on_error: Callable[[str], None] = lambda msg: None

        self.recognizer = make_recognizer(self.config)
        try:
            self.polisher = make_polisher(self.config)
            self.polisher_ready = True
        except Exception as e:
            self.polisher = None
            self.polisher_ready = False
            self._init_error = str(e)
        else:
            self._init_error = ""

        self.kb_controller = Controller()

        self._is_recording = False
        self._recording_start = 0.0
        self._audio_chunks: list = []
        self._current_mode = ""
        self._trigger_key_held = None
        self._caps_synth = 0
        self._currently_pressed: set = set()
        self._modifier_was_held = False
        self._stream: Optional[sd.InputStream] = None
        self._listener: Optional[keyboard.Listener] = None
        # Serialize the post-recording pipeline (ASR + polish + paste). Without
        # this lock two quick-fire utterances would run concurrently and the
        # faster one would paste first — so sentence 1 could appear after
        # sentence 2 at the cursor.
        self._processing_lock = threading.Lock()

    # ---------- Configuration ----------

    def _reload_keys(self):
        self.polish_name = self.config.get("trigger_polish", "alt_r")
        self.translate_modifier_name = self.config.get("trigger_translate_modifier", "shift_r")
        # Kept for back-compat with GUI labels that read engine.translate_name.
        self.translate_name = self.translate_modifier_name
        self.polish_keys = _resolve_key(self.polish_name)
        self.translate_modifier_keys = _resolve_key(self.translate_modifier_name)

    def update_setting(self, key: str, value):
        """Update a config value at runtime. Persist back to config.yaml."""
        self.config[key] = value
        if key == "translate_target":
            self.translate_target = value
        elif key in ("trigger_polish", "trigger_translate_modifier"):
            self._reload_keys()
        elif key == "trigger_mode":
            self.trigger_mode = value
        elif key == "input_device" and self._stream is not None:
            self.restart_audio_stream()
        self._save_config()

    def _save_config(self):
        try:
            import yaml
            with open("config.yaml", "w", encoding="utf-8") as f:
                yaml.safe_dump(self.config, f, allow_unicode=True, sort_keys=False)
        except Exception as e:
            self.on_error(f"保存配置失败: {e}")

    def set_paused(self, paused: bool):
        self.paused = paused

    def set_translate_target(self, target: str):
        self.update_setting("translate_target", target)

    # ---------- CapsLock side-effect ----------

    def _is_caps_on(self) -> bool:
        return bool(ctypes.windll.user32.GetKeyState(VK_CAPITAL) & 0x0001)

    def _force_caps_off(self):
        if self._is_caps_on():
            self._caps_synth += 2
            ctypes.windll.user32.keybd_event(VK_CAPITAL, 0, 0, 0)
            ctypes.windll.user32.keybd_event(VK_CAPITAL, 0, KEYEVENTF_KEYUP, 0)

    # ---------- Audio ----------

    def _resolve_input_device(self):
        """Find a usable input device matching the config preference.

        Match priority: exact name → name keyword (substring). Windows lists the
        same physical mic multiple times under different host APIs; some indices
        are stale and fail to open, so we try each candidate until one opens.
        Returns the index, or None to let sounddevice pick the system default.
        """
        pref = self.config.get("input_device", "")
        if not pref:
            return None
        try:
            devices = sd.query_devices()
        except Exception:
            return None
        exact = [
            i for i, d in enumerate(devices)
            if d["name"] == pref and d["max_input_channels"] > 0
        ]
        substr = [
            i for i, d in enumerate(devices)
            if pref in d["name"] and d["max_input_channels"] > 0 and i not in exact
        ]
        for idx in exact + substr:
            if _can_open_input(idx):
                return idx
        return None

    def _audio_callback(self, indata, frames, time_info, status):
        if self._is_recording:
            self._audio_chunks.append(indata.copy())
            # Compute RMS for live waveform.
            rms = float(np.sqrt(np.mean(np.square(indata.astype(np.float32) / 32768.0))))
            self.on_audio_level(min(1.0, rms * 4.0))
            if time.time() - self._recording_start > MAX_DURATION:
                self._finish_recording()

    # ---------- Recording state machine ----------

    def _start_recording(self, mode: str, trigger_key):
        if self.paused:
            return
        self._audio_chunks = []
        self._recording_start = time.time()
        self._is_recording = True
        self._current_mode = mode
        self._trigger_key_held = trigger_key
        self.on_state_change("recording")

    def _finish_recording(self):
        if not self._is_recording:
            return
        mode = self._current_mode
        duration = time.time() - self._recording_start
        self._is_recording = False
        self._trigger_key_held = None
        self._modifier_was_held = False
        self.on_state_change("processing")
        self._force_caps_off()

        if not self._audio_chunks:
            self.on_state_change("idle")
            return

        # Heavy work on a worker thread so the keyboard listener never blocks.
        chunks = self._audio_chunks
        self._audio_chunks = []
        threading.Thread(
            target=self._process_recording,
            args=(mode, duration, chunks),
            daemon=True,
        ).start()

    def _process_recording(self, mode: str, duration: float, chunks: list):
        # Lock ensures recordings paste in the order the user spoke, even if
        # ASR latency varies between calls.
        with self._processing_lock:
            try:
                audio = np.concatenate(chunks, axis=0)
                sf.write(TEMP_WAV, audio, SAMPLE_RATE)
                raw_text = self.recognizer.recognize(TEMP_WAV)

                final_text = raw_text
                if mode == "polish" and self.polisher_ready:
                    try:
                        final_text = self.polisher.polish(raw_text)
                    except Exception as e:
                        self.on_error(f"润色失败: {e}")
                elif mode == "translate" and self.polisher_ready:
                    try:
                        final_text = self.polisher.translate(raw_text, self.translate_target)
                    except Exception as e:
                        self.on_error(f"翻译失败: {e}")

                self.on_result(mode, raw_text, final_text)
                self._paste(final_text)
                stats.record_session(mode, raw_text, final_text, self.translate_target, duration)
            finally:
                self.on_state_change("idle")

    def _paste(self, text: str):
        if not text:
            return
        try:
            original = pyperclip.paste()
        except Exception:
            original = ""
        pyperclip.copy(text)
        time.sleep(0.03)  # let the new clipboard value settle before Ctrl+V
        self.kb_controller.press(Key.ctrl)
        self.kb_controller.press("v")
        self.kb_controller.release("v")
        self.kb_controller.release(Key.ctrl)
        time.sleep(0.2)  # give the target app time to consume the paste
        try:
            pyperclip.copy(original)
        except Exception:
            pass

    # ---------- Keyboard listener ----------

    def _is_primary(self, key) -> bool:
        return key in self.polish_keys

    def _is_modifier(self, key) -> bool:
        return key in self.translate_modifier_keys

    def _modifier_currently_held(self) -> bool:
        return any(k in self._currently_pressed for k in self.translate_modifier_keys)

    def _on_press(self, key):
        if key == Key.caps_lock and self._caps_synth > 0:
            self._caps_synth -= 1
            return
        self._currently_pressed.add(key)

        if self._is_recording:
            if self._is_modifier(key):
                self._modifier_was_held = True
            # In toggle mode, pressing the primary key again finishes the recording.
            if self.trigger_mode != "hold" and self._is_primary(key):
                if self._modifier_was_held:
                    self._current_mode = "translate"
                self._finish_recording()
            return

        if self._is_primary(key):
            # Decide provisional mode now; may upgrade to translate on release if
            # the modifier gets pressed during recording.
            self._modifier_was_held = self._modifier_currently_held()
            self._start_recording("polish", key)

    def _on_release(self, key):
        if key == Key.caps_lock and self._caps_synth > 0:
            self._caps_synth -= 1
            return
        self._currently_pressed.discard(key)

        if self.trigger_mode != "hold" or not self._is_recording:
            return
        if key == self._trigger_key_held or (
            self._trigger_key_held in (Key.alt_r, Key.alt_gr) and key in (Key.alt_r, Key.alt_gr)
        ):
            if self._modifier_was_held:
                self._current_mode = "translate"
            self._finish_recording()

    # ---------- Lifecycle ----------

    def start(self):
        if self._init_error:
            self.on_error(f"AI 模块未就绪: {self._init_error}")
        self._open_audio_stream()
        self._listener = keyboard.Listener(on_press=self._on_press, on_release=self._on_release)
        self._listener.start()

    def _open_audio_stream(self):
        device = self._resolve_input_device()
        self._stream = sd.InputStream(
            samplerate=SAMPLE_RATE, channels=1, dtype="int16",
            callback=self._audio_callback,
            device=device,
        )
        self._stream.start()

    def restart_audio_stream(self):
        """Close and reopen the input stream — call after changing the mic device."""
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None
        try:
            self._open_audio_stream()
        except Exception as e:
            self.on_error(f"切换麦克风失败：{e}")

    def stop(self):
        if self._listener:
            self._listener.stop()
        if self._stream:
            self._stream.stop()
            self._stream.close()

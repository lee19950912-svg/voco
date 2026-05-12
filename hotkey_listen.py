"""
Voice input main loop. Two single-key triggers, one per mode:

- CapsLock  -> polish (default — AI clean-up of fillers/repeats)
- Right Alt -> translate to target language (set via tray menu)

Two trigger styles via config.yaml `trigger_mode`:
- hold:   press-and-hold to record, release to recognize
- toggle: tap once to start, tap again to stop+recognize

A system tray icon lets the user switch translate target / pause / quit
without touching the console window.

CapsLock side effect: pressing it toggles Windows uppercase state. We compensate
by flipping it back off after each recognition via the Windows API.
"""
import ctypes
import threading
import time

import numpy as np
import pyperclip
import sounddevice as sd
import soundfile as sf
from pynput import keyboard
from pynput.keyboard import Controller, Key

import tray
from recognizer import load_config, make_recognizer
from polisher import make_polisher

SAMPLE_RATE = 16000
MAX_DURATION = 30
TEMP_WAV = "voice.wav"

config = load_config()
TRIGGER_MODE = config.get("trigger_mode", "hold")  # hold | toggle
INITIAL_TARGET = config.get("translate_target", "ko")

def _resolve_key(name: str) -> set:
    """Resolve a config key name to a set of pynput Key objects.
    Returns a set because some keys (right Alt) report under multiple names."""
    if name in ("alt_r", "alt_gr"):
        return {Key.alt_r, Key.alt_gr}
    return {getattr(Key, name)}


POLISH_KEYS = _resolve_key(config.get("trigger_polish", "caps_lock"))
TRANSLATE_KEYS = _resolve_key(config.get("trigger_translate", "alt_r"))

# Caps Lock side-effect compensation: when CapsLock is used as a trigger key,
# Windows toggles the uppercase state on each press. We flip it back off after
# each recognition; the synthetic counter tells our own listener to ignore those.
VK_CAPITAL = 0x14
KEYEVENTF_KEYUP = 0x0002
_caps_synthetic_count = 0


def _is_caps_on() -> bool:
    return bool(ctypes.windll.user32.GetKeyState(VK_CAPITAL) & 0x0001)


def _force_caps_off() -> None:
    global _caps_synthetic_count
    if _is_caps_on():
        _caps_synthetic_count += 2
        ctypes.windll.user32.keybd_event(VK_CAPITAL, 0, 0, 0)
        ctypes.windll.user32.keybd_event(VK_CAPITAL, 0, KEYEVENTF_KEYUP, 0)

kb_controller = Controller()


def paste_text(text: str) -> None:
    """Drop text at the current cursor position via clipboard + Ctrl+V."""
    if not text:
        return
    try:
        original = pyperclip.paste()
    except Exception:
        original = ""
    pyperclip.copy(text)
    time.sleep(0.05)
    kb_controller.press(Key.ctrl)
    kb_controller.press("v")
    kb_controller.release("v")
    kb_controller.release(Key.ctrl)
    time.sleep(1.0)
    try:
        pyperclip.copy(original)
    except Exception:
        pass


_polish_name = config.get("trigger_polish", "caps_lock")
_translate_name = config.get("trigger_translate", "alt_r")
_KEY_LABEL = {
    "ctrl_l": "左Ctrl", "ctrl_r": "右Ctrl",
    "alt_l": "左Alt", "alt_r": "右Alt", "alt_gr": "右Alt",
    "shift_l": "左Shift", "shift_r": "右Shift",
    "caps_lock": "CapsLock", "tab": "Tab", "esc": "Esc",
    "insert": "Insert", "f9": "F9", "f10": "F10", "f11": "F11", "f12": "F12",
}
_polish_label = _KEY_LABEL.get(_polish_name, _polish_name)
_translate_label = _KEY_LABEL.get(_translate_name, _translate_name)

print(f"识别引擎: {config['recognize_engine']}, 识别语言: {config.get('recognize_language', 'auto')}")
print(f"AI 引擎: {config.get('polish_engine', 'relay')}, 翻译目标初始: {INITIAL_TARGET}")
print(f"触发模式: {TRIGGER_MODE}")
if TRIGGER_MODE == "hold":
    print(f"快捷键: 按住 {_polish_label} = 润色 / 按住 {_translate_label} = 翻译")
else:
    print(f"快捷键: 点 {_polish_label} 开始-再点结束=润色 / 点 {_translate_label} 开始-再点结束=翻译")
if _polish_name == "caps_lock":
    print("[提示] CapsLock 大写副作用已被代码自动压制")

recognizer = make_recognizer(config)
try:
    polisher = make_polisher(config)
    polisher_ready = True
except Exception as e:
    print(f"[警告] AI 模块未就绪: {e}")
    print("[提示] 润色/翻译将退回到直接出原文。请在 .env 里填 RELAY_API_KEY 后重启。")
    polisher = None
    polisher_ready = False


is_recording = False
recording_start_time = 0.0
audio_chunks: list = []
_current_mode: str = ""           # 'polish' or 'translate' while recording
_trigger_key_held = None          # the exact pynput Key currently holding recording open
_stop_event = threading.Event()


def audio_callback(indata, frames, time_info, status):
    global is_recording
    if is_recording:
        audio_chunks.append(indata.copy())
        if time.time() - recording_start_time > MAX_DURATION:
            print(f"\n[已达最大录音时长 {MAX_DURATION} 秒，自动停止]", flush=True)
            _finish_recording()


def _start_recording(mode: str, trigger_key):
    global is_recording, recording_start_time, audio_chunks, _current_mode, _trigger_key_held
    if tray.is_paused():
        print("[已暂停语音输入，忽略此次触发]", flush=True)
        return
    audio_chunks = []
    recording_start_time = time.time()
    is_recording = True
    _current_mode = mode
    _trigger_key_held = trigger_key
    tray.set_recording(True)
    label = _polish_label if mode == "polish" else _translate_label
    if TRIGGER_MODE == "hold":
        print(f"正在录音...（{mode} 模式，松开 {label} 结束）", flush=True)
    else:
        print(f"正在录音...（{mode} 模式，再按一次 {label} 结束）", flush=True)


def _finish_recording():
    global is_recording, _trigger_key_held
    if not is_recording:
        return
    mode = _current_mode
    is_recording = False
    _trigger_key_held = None
    tray.set_recording(False)
    _force_caps_off()

    if not audio_chunks:
        print("[没录到声音]\n", flush=True)
        return

    audio = np.concatenate(audio_chunks, axis=0)
    sf.write(TEMP_WAV, audio, SAMPLE_RATE)
    target = tray.get_translate_target()
    print(f"识别中...（模式: {mode}{'→'+target if mode=='translate' else ''}）", flush=True)
    raw_text = recognizer.recognize(TEMP_WAV)
    print(f"  原文: {raw_text}", flush=True)

    final_text = raw_text
    if mode == "polish":
        if polisher_ready:
            try:
                final_text = polisher.polish(raw_text)
                print(f"  润色: {final_text}", flush=True)
            except Exception as e:
                print(f"  [润色失败，输出原文]: {e}", flush=True)
        else:
            print("  [AI 未就绪，输出原文]", flush=True)
    else:  # translate
        if polisher_ready:
            try:
                final_text = polisher.translate(raw_text, target)
                print(f"  译文({target}): {final_text}", flush=True)
            except Exception as e:
                print(f"  [翻译失败，输出原文]: {e}", flush=True)
        else:
            print("  [AI 未就绪，输出原文]", flush=True)

    paste_text(final_text)
    print("[已粘贴到光标位置]\n", flush=True)


def _key_mode(key):
    """Return 'polish' / 'translate' / None for the given key."""
    if key in POLISH_KEYS:
        return "polish"
    if key in TRANSLATE_KEYS:
        return "translate"
    return None


def on_press(key):
    global _caps_synthetic_count
    if key == Key.caps_lock and _caps_synthetic_count > 0:
        _caps_synthetic_count -= 1
        return
    mode = _key_mode(key)
    if mode is None:
        return
    if TRIGGER_MODE == "hold":
        if not is_recording:
            _start_recording(mode, key)
    else:  # toggle
        if not is_recording:
            _start_recording(mode, key)
        elif mode == _current_mode:
            # Tap same-category key again to stop. Other-category key while recording is ignored.
            _finish_recording()


def on_release(key):
    global _caps_synthetic_count
    if key == Key.caps_lock and _caps_synthetic_count > 0:
        _caps_synthetic_count -= 1
        return
    if TRIGGER_MODE != "hold":
        return
    if not is_recording:
        return
    # Only the key that started the recording can end it (avoids stray releases).
    if key == _trigger_key_held or (_trigger_key_held in (Key.alt_r, Key.alt_gr) and key in (Key.alt_r, Key.alt_gr)):
        _finish_recording()


def _on_tray_quit():
    """Tray menu -> 退出. Stop the keyboard listener so main thread exits."""
    print("\n[托盘退出]")
    _stop_event.set()


tray.start(initial_target=INITIAL_TARGET, on_quit=_on_tray_quit)

print("\n就绪。右下角任务栏有麦克风图标，右键可切翻译语言/退出。按 Ctrl+C 也可退出。\n")

with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16", callback=audio_callback):
    listener = keyboard.Listener(on_press=on_press, on_release=on_release)
    listener.start()
    try:
        while not _stop_event.is_set():
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\n再见。")
    finally:
        listener.stop()

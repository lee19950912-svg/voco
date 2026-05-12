"""First-run setup wizard. Walks the user through picking a working
microphone and confirming the hotkeys fire. Runs before engine.start()
so it owns its own audio/keyboard streams during the test.
"""
import threading
import time

import numpy as np
import sounddevice as sd
import soundfile as sf
from pynput import keyboard
from pynput.keyboard import Key
from PyQt6.QtCore import QObject, Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QComboBox, QDialog, QFrame, QHBoxLayout, QLabel, QProgressBar,
    QPushButton, QStackedWidget, QVBoxLayout, QWidget,
)

from voice_engine import (
    SAMPLE_RATE, _can_open_input, key_label, list_usable_microphones,
)

# Reuse main_window's design tokens via duplication to avoid circular imports.
INK = "#0a0a0b"
INK_3 = "rgba(10, 10, 11, 0.62)"
INK_4 = "rgba(10, 10, 11, 0.42)"
WHITE = "#ffffff"
CANVAS = "#f7f7f8"
LINE = "rgba(0, 0, 0, 0.08)"
BLUE = "#2563eb"
BLUE_HOVER = "#1d4ed8"
OK = "#16a34a"
ERR = "#dc2626"

TEST_WAV = "wizard_test.wav"
TEST_DURATION = 3.0


class _Bridge(QObject):
    """Cross-thread signals from background workers."""
    audio_level = pyqtSignal(float)
    mic_test_status = pyqtSignal(str, str)  # state ('recording'|'playing'|'recognizing'|'done'|'error'), text
    hotkey_state = pyqtSignal(str, str)  # mode ('polish'|'translate'), state ('recording'|'recognizing'|'done'|'error')
    hotkey_result = pyqtSignal(str, str)  # mode, recognized text


def _h1(text: str) -> QLabel:
    l = QLabel(text)
    l.setStyleSheet(f"font-size: 22px; font-weight: 700; color: {INK};")
    return l


def _muted(text: str) -> QLabel:
    l = QLabel(text)
    l.setStyleSheet(f"font-size: 13px; color: {INK_3};")
    l.setWordWrap(True)
    return l


def _primary_btn(text: str) -> QPushButton:
    b = QPushButton(text)
    b.setStyleSheet(
        f"QPushButton {{ background: {BLUE}; color: white; border: none; "
        f"border-radius: 8px; padding: 10px 22px; font-size: 13px; font-weight: 600; }}"
        f"QPushButton:hover {{ background: {BLUE_HOVER}; }}"
        f"QPushButton:disabled {{ background: rgba(37, 99, 235, 0.4); }}"
    )
    return b


def _ghost_btn(text: str) -> QPushButton:
    b = QPushButton(text)
    b.setStyleSheet(
        f"QPushButton {{ background: transparent; color: {INK_3}; "
        f"border: 1px solid {LINE}; border-radius: 8px; padding: 10px 22px; font-size: 13px; }}"
        f"QPushButton:hover {{ color: {INK}; border-color: {INK}; }}"
    )
    return b


class _LevelMeter(QProgressBar):
    """A thin horizontal bar that visualises real-time audio level."""
    def __init__(self):
        super().__init__()
        self.setRange(0, 100)
        self.setValue(0)
        self.setTextVisible(False)
        self.setFixedHeight(8)
        self.setStyleSheet(
            f"QProgressBar {{ background: rgba(0,0,0,0.05); border-radius: 4px; border: none; }}"
            f"QProgressBar::chunk {{ background: {BLUE}; border-radius: 4px; }}"
        )


class _WelcomePage(QWidget):
    def __init__(self):
        super().__init__()
        v = QVBoxLayout(self)
        v.setContentsMargins(40, 40, 40, 20)
        v.setSpacing(14)
        v.addStretch()
        title = QLabel("欢迎使用 VoCo")
        title.setStyleSheet(f"font-size: 28px; font-weight: 700; color: {INK};")
        v.addWidget(title)
        v.addWidget(_muted("用声音编织文字。3 步完成设置，约 30 秒。"))
        v.addSpacing(10)
        v.addWidget(_muted("第 1 步 · 选一个能用的麦克风"))
        v.addWidget(_muted("第 2 步 · 试一下说话快捷键"))
        v.addWidget(_muted("第 3 步 · 开始使用"))
        v.addStretch()


class _MicPage(QWidget):
    """Pick a microphone, see live volume, optionally record a 3-second sample."""
    def __init__(self, engine, bridge: _Bridge):
        super().__init__()
        self.engine = engine
        self.bridge = bridge
        self._stream = None
        self._test_thread = None
        self._stop_test = threading.Event()

        v = QVBoxLayout(self)
        v.setContentsMargins(40, 36, 40, 20)
        v.setSpacing(12)

        v.addWidget(_h1("选一个能用的麦克风"))
        v.addWidget(_muted("对着麦说话，看蓝色音量条有没有跳。跳得越满越好。"))
        v.addSpacing(10)

        self.mic_combo = QComboBox()
        self.mic_combo.setStyleSheet(
            "QComboBox { padding: 8px 12px; border: 1px solid rgba(0,0,0,0.12); "
            "border-radius: 8px; background: white; font-size: 13px; min-width: 360px; }"
            f"QComboBox:hover {{ border-color: {BLUE}; }}"
        )
        v.addWidget(self.mic_combo)

        self.meter = _LevelMeter()
        v.addWidget(self.meter)

        self.peak_hint = QLabel("等待麦克风…")
        self.peak_hint.setStyleSheet(f"font-size: 12px; color: {INK_4};")
        v.addWidget(self.peak_hint)

        v.addSpacing(8)

        row = QHBoxLayout()
        row.setSpacing(10)
        self.record_btn = _ghost_btn("录一句话试识别")
        self.record_btn.clicked.connect(self._on_record_clicked)
        row.addWidget(self.record_btn)
        self.record_status = QLabel("")
        self.record_status.setStyleSheet(f"font-size: 12px; color: {INK_3};")
        row.addWidget(self.record_status)
        row.addStretch()
        v.addLayout(row)

        # Recognition result panel — empty until user runs the test.
        self.recognize_panel = QFrame()
        self.recognize_panel.setStyleSheet(
            f"background: rgba(0,0,0,0.03); border: 1px solid {LINE}; "
            f"border-radius: 8px;"
        )
        rp = QVBoxLayout(self.recognize_panel)
        rp.setContentsMargins(14, 12, 14, 12)
        rp.setSpacing(4)
        rp_label = QLabel("识别结果")
        rp_label.setStyleSheet(
            f"font-size: 10px; color: {INK_4}; font-weight: 600; letter-spacing: 1px;"
        )
        rp.addWidget(rp_label)
        self.recognize_result = QLabel("点上面按钮说一句话，结果会显示在这里")
        self.recognize_result.setStyleSheet(f"font-size: 14px; color: {INK_3};")
        self.recognize_result.setWordWrap(True)
        rp.addWidget(self.recognize_result)
        v.addWidget(self.recognize_panel)

        v.addStretch()

        self._mics = list_usable_microphones()
        if not self._mics:
            self.mic_combo.addItem("没找到可用麦克风", None)
            self.mic_combo.setEnabled(False)
            self.record_btn.setEnabled(False)
            self.peak_hint.setText("插好麦克风后重启软件再试")
            return

        for idx, name in self._mics:
            self.mic_combo.addItem(name, idx)

        # Pre-select whatever the engine resolved at construction time.
        prefer = engine.config.get("input_device", "")
        for i in range(self.mic_combo.count()):
            if self.mic_combo.itemText(i) == prefer or prefer in self.mic_combo.itemText(i):
                self.mic_combo.setCurrentIndex(i)
                break

        self.mic_combo.currentIndexChanged.connect(lambda _: self._start_stream())
        self.bridge.audio_level.connect(self._on_level)
        self.bridge.mic_test_status.connect(self._on_test_status)
        self._peak_seen = 0.0
        self._level_timer = QTimer(self)
        self._level_timer.timeout.connect(self._refresh_peak_hint)
        self._level_timer.start(400)

    def selected_name(self) -> str:
        if self.mic_combo.currentIndex() < 0:
            return ""
        return self.mic_combo.currentText()

    def start_streaming(self):
        self._start_stream()

    def stop_streaming(self):
        self._stop_test.set()
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None

    def _start_stream(self):
        self.stop_streaming()
        self._stop_test.clear()
        idx = self.mic_combo.currentData()
        if idx is None:
            return
        try:
            self._stream = sd.InputStream(
                samplerate=SAMPLE_RATE, channels=1, dtype="int16", device=idx,
                callback=self._audio_callback,
            )
            self._stream.start()
            self._peak_seen = 0.0
            self.peak_hint.setText("说话试试…")
        except Exception as e:
            self.peak_hint.setText(f"打不开这个麦：{e}")

    def _audio_callback(self, indata, frames, time_info, status):
        rms = float(np.sqrt(np.mean(np.square(indata.astype(np.float32) / 32768.0))))
        self.bridge.audio_level.emit(min(1.0, rms * 4.0))

    def _on_level(self, level: float):
        self.meter.setValue(int(level * 100))
        if level > self._peak_seen:
            self._peak_seen = level

    def _refresh_peak_hint(self):
        if self._peak_seen > 0.3:
            self.peak_hint.setText(f"声音清晰 ✓  (峰值 {self._peak_seen:.2f})")
            self.peak_hint.setStyleSheet(f"font-size: 12px; color: {OK};")
        elif self._peak_seen > 0.05:
            self.peak_hint.setText(f"听见了，但声音偏小  (峰值 {self._peak_seen:.2f})")
            self.peak_hint.setStyleSheet(f"font-size: 12px; color: {INK_3};")
        else:
            self.peak_hint.setText("还没听见声音，再大声点试试")
            self.peak_hint.setStyleSheet(f"font-size: 12px; color: {INK_4};")
        self._peak_seen *= 0.6  # decay so the hint stays responsive

    def _on_record_clicked(self):
        if self._test_thread and self._test_thread.is_alive():
            return
        self.record_btn.setEnabled(False)
        self.record_status.setText("录音 3 秒…")
        idx = self.mic_combo.currentData()
        self._test_thread = threading.Thread(
            target=self._do_record_and_playback, args=(idx,), daemon=True
        )
        self._test_thread.start()

    def _do_record_and_playback(self, device_idx):
        # Pause the live stream so we don't fight for the device.
        self.stop_streaming()
        try:
            self.bridge.mic_test_status.emit("recording", "录音中… 请说一句话（3 秒）")
            rec = sd.rec(
                int(TEST_DURATION * SAMPLE_RATE),
                samplerate=SAMPLE_RATE, channels=1, dtype="int16",
                device=device_idx,
            )
            sd.wait()
            sf.write(TEST_WAV, rec, SAMPLE_RATE)
            audio = rec.astype(np.float32) / 32768.0
            peak = float(np.max(np.abs(audio)))
            self.bridge.mic_test_status.emit("playing", f"回放中… (峰值 {peak:.2f})")
            sd.play(rec, SAMPLE_RATE)
            sd.wait()
            if peak < 0.02:
                self.bridge.mic_test_status.emit(
                    "error", f"几乎没声音 (峰值 {peak:.2f})，建议换麦",
                )
                return
            self.bridge.mic_test_status.emit("recognizing", "识别中…")
            try:
                text = self.engine.recognizer.recognize(TEST_WAV)
            except Exception as e:
                self.bridge.mic_test_status.emit("error", f"识别失败：{e}")
                return
            shown = text.strip() if text else ""
            if not shown:
                self.bridge.mic_test_status.emit("error", "没识别到内容，再大声说一句")
            else:
                self.bridge.mic_test_status.emit("done", shown)
        except Exception as e:
            self.bridge.mic_test_status.emit("error", f"测试失败：{e}")
        finally:
            self.record_btn.setEnabled(True)
            self._start_stream()

    def _on_test_status(self, state: str, text: str):
        if state == "recording":
            self.record_status.setText(text)
            self.record_status.setStyleSheet(f"font-size: 12px; color: {INK_3};")
            self.recognize_result.setText("…")
            self.recognize_result.setStyleSheet(f"font-size: 14px; color: {INK_4};")
        elif state == "playing":
            self.record_status.setText(text)
        elif state == "recognizing":
            self.record_status.setText(text)
            self.recognize_result.setText("识别中…")
        elif state == "done":
            self.record_status.setText("识别成功 ✓")
            self.record_status.setStyleSheet(f"font-size: 12px; color: {OK};")
            self.recognize_result.setText(f"你刚才说的：{text}")
            self.recognize_result.setStyleSheet(f"font-size: 14px; color: {INK}; font-weight: 600;")
        elif state == "error":
            self.record_status.setText(text)
            self.record_status.setStyleSheet(f"font-size: 12px; color: {ERR};")
            self.recognize_result.setText("（没识别到内容）")
            self.recognize_result.setStyleSheet(f"font-size: 14px; color: {ERR};")


class _HotkeyPage(QWidget):
    """Real end-to-end test: hold key → record → recognize → polish/translate → show text."""
    HOTKEY_WAV = "wizard_hotkey.wav"
    MAX_RECORD_SEC = 15

    def __init__(self, engine, bridge: _Bridge):
        super().__init__()
        self.engine = engine
        self.bridge = bridge
        self._listener = None
        self._currently_pressed: set = set()
        self._polish_ok = False
        self._translate_ok = False

        self._is_recording = False
        self._record_stream = None
        self._audio_chunks: list = []
        self._record_started_at = 0.0
        self._record_mode = None  # 'polish' | 'translate'
        self._trigger_key_held = None

        v = QVBoxLayout(self)
        v.setContentsMargins(40, 30, 40, 16)
        v.setSpacing(10)

        polish_key = key_label(engine.polish_name)
        mod_key = key_label(engine.translate_modifier_name)

        v.addWidget(_h1("试一下说话快捷键"))
        v.addWidget(_muted("按住键说一句话（比如「今天天气真好」），松开看出字效果。"))
        v.addSpacing(4)

        self.row_polish = self._make_test_row(
            "polish",
            f"按住  {polish_key}  说一句话",
            "润色模式",
        )
        v.addWidget(self.row_polish["widget"])

        self.row_translate = self._make_test_row(
            "translate",
            f"同时按住  {polish_key} + {mod_key}  说一句话",
            f"翻译模式（→ {self._lang_name(engine.translate_target)}）",
        )
        v.addWidget(self.row_translate["widget"])

        v.addSpacing(6)
        self.tip = QLabel("等你按键说话…")
        self.tip.setStyleSheet(f"font-size: 12px; color: {INK_4};")
        v.addWidget(self.tip)
        v.addStretch()

        self.bridge.hotkey_state.connect(self._on_state)
        self.bridge.hotkey_result.connect(self._on_result)

    def _lang_name(self, code: str) -> str:
        return {"ko": "韩语", "en": "英语", "ja": "日语", "zh": "中文"}.get(code, code)

    def _make_test_row(self, mode: str, title: str, subtitle: str) -> dict:
        frame = QFrame()
        frame.setStyleSheet(
            f"background: rgba(0,0,0,0.02); border: 1px solid {LINE}; border-radius: 10px;"
        )
        v = QVBoxLayout(frame)
        v.setContentsMargins(14, 10, 14, 10)
        v.setSpacing(4)

        head = QHBoxLayout()
        head.setSpacing(12)
        bullet = QLabel("○")
        bullet.setStyleSheet(f"font-size: 20px; color: {INK_4};")
        head.addWidget(bullet)
        text_col = QVBoxLayout()
        text_col.setSpacing(2)
        t = QLabel(title)
        t.setStyleSheet(f"font-size: 13px; font-weight: 600; color: {INK};")
        s = QLabel(subtitle)
        s.setStyleSheet(f"font-size: 11px; color: {INK_3};")
        text_col.addWidget(t)
        text_col.addWidget(s)
        head.addLayout(text_col)
        head.addStretch()
        status = QLabel("")
        status.setStyleSheet(f"font-size: 11px; color: {INK_4};")
        head.addWidget(status)
        v.addLayout(head)

        result = QLabel("")
        result.setStyleSheet(f"font-size: 13px; color: {INK_3}; padding-left: 32px;")
        result.setWordWrap(True)
        v.addWidget(result)

        return {"widget": frame, "bullet": bullet, "status": status, "result": result, "mode": mode}

    def start_listening(self):
        if self._listener is not None:
            return
        self._listener = keyboard.Listener(
            on_press=self._on_press, on_release=self._on_release
        )
        self._listener.start()

    def stop_listening(self):
        if self._listener is not None:
            try:
                self._listener.stop()
            except Exception:
                pass
            self._listener = None
        self._cancel_recording()

    # ---------- Keyboard ----------

    def _on_press(self, key):
        self._currently_pressed.add(key)
        if self._is_recording:
            # If the modifier comes after the primary, upgrade to translate mode.
            if key in self.engine.translate_modifier_keys and self._record_mode == "polish":
                self._record_mode = "translate"
                self.bridge.hotkey_state.emit("translate", "recording")
            return
        if key in self.engine.polish_keys:
            mod_held = any(
                k in self._currently_pressed for k in self.engine.translate_modifier_keys
            )
            mode = "translate" if mod_held else "polish"
            self._start_recording(mode, key)

    def _on_release(self, key):
        self._currently_pressed.discard(key)
        if not self._is_recording:
            return
        # Release the primary key (or its alt_r/alt_gr alias) → finish.
        if key == self._trigger_key_held or (
            self._trigger_key_held in (Key.alt_r, Key.alt_gr) and key in (Key.alt_r, Key.alt_gr)
        ):
            self._stop_recording_and_process()

    # ---------- Recording ----------

    def _start_recording(self, mode: str, trigger_key):
        device_idx = self._resolve_device()
        try:
            self._record_stream = sd.InputStream(
                samplerate=SAMPLE_RATE, channels=1, dtype="int16",
                device=device_idx, callback=self._audio_callback,
            )
            self._record_stream.start()
        except Exception as e:
            self.bridge.hotkey_state.emit(mode, "error")
            self.bridge.hotkey_result.emit(mode, f"打不开麦克风：{e}")
            return
        self._is_recording = True
        self._audio_chunks = []
        self._record_started_at = time.time()
        self._record_mode = mode
        self._trigger_key_held = trigger_key
        self.bridge.hotkey_state.emit(mode, "recording")

    def _audio_callback(self, indata, frames, time_info, status):
        if self._is_recording:
            self._audio_chunks.append(indata.copy())
            if time.time() - self._record_started_at > self.MAX_RECORD_SEC:
                # Auto-stop on max duration (don't process here — let release handle it).
                pass

    def _cancel_recording(self):
        if not self._is_recording and self._record_stream is None:
            return
        self._is_recording = False
        if self._record_stream is not None:
            try:
                self._record_stream.stop()
                self._record_stream.close()
            except Exception:
                pass
            self._record_stream = None
        self._audio_chunks = []
        self._trigger_key_held = None
        self._record_mode = None

    def _stop_recording_and_process(self):
        if not self._is_recording:
            return
        mode = self._record_mode
        chunks = self._audio_chunks
        self._audio_chunks = []
        self._is_recording = False
        self._trigger_key_held = None
        if self._record_stream is not None:
            try:
                self._record_stream.stop()
                self._record_stream.close()
            except Exception:
                pass
            self._record_stream = None
        if not chunks:
            self.bridge.hotkey_state.emit(mode, "error")
            self.bridge.hotkey_result.emit(mode, "没录到声音，再试一次")
            return
        self.bridge.hotkey_state.emit(mode, "recognizing")
        threading.Thread(
            target=self._process_audio, args=(mode, chunks), daemon=True,
        ).start()

    def _process_audio(self, mode: str, chunks: list):
        try:
            audio = np.concatenate(chunks, axis=0)
            sf.write(self.HOTKEY_WAV, audio, SAMPLE_RATE)
            raw = self.engine.recognizer.recognize(self.HOTKEY_WAV)
            raw = (raw or "").strip()
            if not raw:
                self.bridge.hotkey_state.emit(mode, "error")
                self.bridge.hotkey_result.emit(mode, "没识别到内容，再大声说一句")
                return
            final = raw
            if mode == "polish" and self.engine.polisher_ready:
                try:
                    final = self.engine.polisher.polish(raw)
                except Exception:
                    final = raw
            elif mode == "translate" and self.engine.polisher_ready:
                try:
                    final = self.engine.polisher.translate(raw, self.engine.translate_target)
                except Exception:
                    final = raw
            self.bridge.hotkey_state.emit(mode, "done")
            self.bridge.hotkey_result.emit(mode, final)
        except Exception as e:
            self.bridge.hotkey_state.emit(mode, "error")
            self.bridge.hotkey_result.emit(mode, f"出错：{e}")

    def _resolve_device(self):
        """Pick the device chosen on the mic page (saved to config by now)."""
        name = self.engine.config.get("input_device", "")
        if not name:
            return None
        try:
            devs = sd.query_devices()
        except Exception:
            return None
        for i, d in enumerate(devs):
            if d["name"] == name and d["max_input_channels"] > 0:
                if _can_open_input(i):
                    return i
        for i, d in enumerate(devs):
            if name in d["name"] and d["max_input_channels"] > 0:
                if _can_open_input(i):
                    return i
        return None

    # ---------- UI updates ----------

    def _row(self, mode: str) -> dict:
        return self.row_polish if mode == "polish" else self.row_translate

    def _on_state(self, mode: str, state: str):
        row = self._row(mode)
        if state == "recording":
            row["bullet"].setText("●")
            row["bullet"].setStyleSheet(f"font-size: 20px; color: {ERR};")
            row["status"].setText("● 录音中…")
            row["status"].setStyleSheet(f"font-size: 11px; color: {ERR};")
            row["result"].setText("")
            self.tip.setText("说话中…松开键停止")
            self.tip.setStyleSheet(f"font-size: 12px; color: {INK_3};")
        elif state == "recognizing":
            row["bullet"].setStyleSheet(f"font-size: 20px; color: {BLUE};")
            row["status"].setText("识别中…")
            row["status"].setStyleSheet(f"font-size: 11px; color: {BLUE};")
            self.tip.setText("识别处理中…")
        elif state == "done":
            row["bullet"].setText("●")
            row["bullet"].setStyleSheet(f"font-size: 20px; color: {OK};")
            row["status"].setText("成功 ✓")
            row["status"].setStyleSheet(f"font-size: 11px; color: {OK};")
            if mode == "polish":
                self._polish_ok = True
            else:
                self._translate_ok = True
            self._update_tip()
        elif state == "error":
            row["bullet"].setStyleSheet(f"font-size: 20px; color: {ERR};")
            row["status"].setText("失败")
            row["status"].setStyleSheet(f"font-size: 11px; color: {ERR};")

    def _on_result(self, mode: str, text: str):
        row = self._row(mode)
        row["result"].setText(text)
        row["result"].setStyleSheet(f"font-size: 13px; color: {INK}; padding-left: 32px;")

    def _update_tip(self):
        if self._polish_ok and self._translate_ok:
            self.tip.setText("两个都通了，进入下一步")
            self.tip.setStyleSheet(f"font-size: 12px; color: {OK};")
        elif self._polish_ok:
            self.tip.setText("润色通了，再试翻译组合（同时按住录音键 + 附加键说话）")
        elif self._translate_ok:
            self.tip.setText("翻译通了，再试单按录音键说话")
        else:
            self.tip.setText("等你按键说话…")


class _DonePage(QWidget):
    def __init__(self, polish_label: str, mod_label: str):
        super().__init__()
        v = QVBoxLayout(self)
        v.setContentsMargins(40, 40, 40, 20)
        v.setSpacing(12)
        v.addStretch()
        ok = QLabel("✓")
        ok.setStyleSheet(f"font-size: 56px; color: {OK};")
        ok.setAlignment(Qt.AlignmentFlag.AlignLeft)
        v.addWidget(ok)
        title = QLabel("准备好了")
        title.setStyleSheet(f"font-size: 26px; font-weight: 700; color: {INK};")
        v.addWidget(title)
        v.addWidget(_muted(
            f"用法提醒：把光标停在任何输入框，按住 {polish_label} 说话出字（润色），"
            f"按住 {polish_label}+{mod_label} 说话翻译。"
        ))
        v.addStretch()


class SetupWizard(QDialog):
    def __init__(self, engine, parent=None):
        super().__init__(parent)
        self.engine = engine
        self.bridge = _Bridge()
        self.setWindowTitle("VoCo 首次设置")
        self.setModal(True)
        self.setFixedSize(560, 480)
        self.setStyleSheet(f"QDialog {{ background: {WHITE}; }}")

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        self.stack = QStackedWidget()
        self.welcome = _WelcomePage()
        self.mic = _MicPage(engine, self.bridge)
        self.hotkey = _HotkeyPage(engine, self.bridge)
        self.done = _DonePage(
            key_label(engine.polish_name),
            key_label(engine.translate_modifier_name),
        )
        for p in (self.welcome, self.mic, self.hotkey, self.done):
            self.stack.addWidget(p)
        root.addWidget(self.stack, 1)

        # Bottom action bar.
        bar = QFrame()
        bar.setStyleSheet(f"background: {CANVAS}; border-top: 1px solid {LINE};")
        bar.setFixedHeight(64)
        h = QHBoxLayout(bar)
        h.setContentsMargins(20, 12, 20, 12)

        self.skip_btn = QPushButton("跳过设置")
        self.skip_btn.setStyleSheet(
            f"QPushButton {{ background: transparent; color: {INK_4}; border: none; "
            f"font-size: 12px; }} QPushButton:hover {{ color: {INK_3}; }}"
        )
        self.skip_btn.clicked.connect(self._on_skip)
        h.addWidget(self.skip_btn)
        h.addStretch()

        self.back_btn = _ghost_btn("上一步")
        self.back_btn.clicked.connect(self._on_back)
        h.addWidget(self.back_btn)

        self.next_btn = _primary_btn("下一步")
        self.next_btn.clicked.connect(self._on_next)
        h.addWidget(self.next_btn)

        root.addWidget(bar)

        self._refresh_buttons()

    def _refresh_buttons(self):
        i = self.stack.currentIndex()
        self.back_btn.setVisible(i > 0 and i < 3)
        if i == 0:
            self.next_btn.setText("开始")
        elif i == self.stack.count() - 1:
            self.next_btn.setText("开始使用")
        else:
            self.next_btn.setText("下一步")
        self.skip_btn.setVisible(i < self.stack.count() - 1)

    def _on_back(self):
        if self.stack.currentIndex() > 0:
            self._leave_page(self.stack.currentIndex())
            self.stack.setCurrentIndex(self.stack.currentIndex() - 1)
            self._enter_page(self.stack.currentIndex())
            self._refresh_buttons()

    def _on_next(self):
        if self.stack.currentIndex() < self.stack.count() - 1:
            self._leave_page(self.stack.currentIndex())
            self.stack.setCurrentIndex(self.stack.currentIndex() + 1)
            self._enter_page(self.stack.currentIndex())
            self._refresh_buttons()
        else:
            self._finish()

    def _on_skip(self):
        self._leave_page(self.stack.currentIndex())
        self._finish()

    def _enter_page(self, i: int):
        if i == 1:
            self.mic.start_streaming()
        elif i == 2:
            self.hotkey.start_listening()

    def _leave_page(self, i: int):
        if i == 1:
            self.mic.stop_streaming()
        elif i == 2:
            self.hotkey.stop_listening()

    def _finish(self):
        chosen = self.mic.selected_name()
        if chosen and chosen != "没找到可用麦克风":
            self.engine.update_setting("input_device", chosen)
        self.engine.update_setting("first_run_completed", True)
        self.accept()

    def closeEvent(self, event):
        self._leave_page(self.stack.currentIndex())
        super().closeEvent(event)

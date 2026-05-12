"""Floating HUD widget — bottom-center pill that shows listening / processing state.

Design rationale (from hud_demo.html iteration):
- 96 × 36 pure-black pill, no text, no color. The HUD answers only ONE question:
  "is the software listening / thinking right now?"
- 5 white bars drawn directly in paintEvent for crisp scaling on hi-DPI.
- Listening state: 5 bars rise with a mid-peak shape, driven by live audio level.
- Processing state: middle 3 bars do a fast sine wave; outer 2 stay short.
- Frameless, transparent, always-on-top, click-through, no taskbar / no focus steal.

Windows quirks worked around here:
- WA_TranslucentBackground alone isn't enough — also need WA_NoSystemBackground
  and autoFillBackground(False), otherwise Windows DWM paints a default fill
  outside the rounded pill and the corners look like a white rectangle.
- 30 FPS render loop + per-frame easing — the HTML demo gets smoothness for
  free from CSS transitions; Python paints discrete frames, so we have to do
  the interpolation ourselves.
"""
import math
import random

from PyQt6.QtCore import Qt, QTimer, QPropertyAnimation, QEasingCurve
from PyQt6.QtGui import QPainter, QColor, QBrush, QGuiApplication
from PyQt6.QtWidgets import QWidget


HUD_W = 96
HUD_H = 36
BAR_COUNT = 5
BAR_WIDTH = 3
BAR_GAP = 5
BAR_MIN_H = 4
BAR_MAX_H = 20

STATE_HIDDEN = 0
STATE_LISTENING = 1
STATE_PROCESSING = 2

# Smooth animation: 30 FPS render, slow easing per frame so bars glide instead of jump.
FRAME_INTERVAL_MS = 33
LISTEN_RETARGET_EVERY = 4    # update target every 4 frames (~130ms), matches demo cadence
LISTEN_EASE = 0.18
PROC_T_STEP = 0.12           # advance sine wave per frame
PROC_EASE = 0.30


class VoiceHUD(QWidget):
    """Minimal floating HUD for VoCo voice input."""

    def __init__(self):
        super().__init__()
        self.setWindowFlags(
            Qt.WindowType.Tool                        # no taskbar entry
            | Qt.WindowType.FramelessWindowHint       # no title bar / borders
            | Qt.WindowType.WindowStaysOnTopHint      # float above other windows
            | Qt.WindowType.WindowDoesNotAcceptFocus  # never grab keyboard focus
            | Qt.WindowType.NoDropShadowWindowHint    # no Windows DWM shadow box
        )
        # All three of these together are required for true transparent corners
        # on Windows; missing any one leaves a visible rectangular fill.
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.setAutoFillBackground(False)

        self.setFixedSize(HUD_W, HUD_H)
        self.setWindowOpacity(0.0)

        self._state = STATE_HIDDEN
        self._bar_heights = [float(BAR_MIN_H)] * BAR_COUNT
        self._listen_targets = [float(BAR_MIN_H)] * BAR_COUNT
        self._listen_frame = 0
        self._audio_level = 0.0
        self._proc_t = 0.0

        self._fade = QPropertyAnimation(self, b"windowOpacity")
        self._fade.setDuration(220)
        self._fade.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._fade.finished.connect(self._after_fade)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)

    # ---------- Position ----------

    def position_bottom_center(self):
        screen = QGuiApplication.primaryScreen()
        if screen is None:
            return
        geo = screen.availableGeometry()
        x = geo.x() + (geo.width() - HUD_W) // 2
        y = geo.y() + geo.height() - HUD_H - 80
        self.move(x, y)

    # ---------- Public state setters ----------

    def show_listening(self):
        if self._state == STATE_LISTENING:
            return
        self._state = STATE_LISTENING
        self.position_bottom_center()
        if not self.isVisible():
            self.show()
        if not self._timer.isActive():
            self._timer.start(FRAME_INTERVAL_MS)
        self._listen_frame = 0
        self._fade_to(1.0)

    def show_processing(self):
        if self._state == STATE_PROCESSING:
            return
        self._state = STATE_PROCESSING
        if not self.isVisible():
            self.position_bottom_center()
            self.show()
        self._proc_t = 0.0
        if not self._timer.isActive():
            self._timer.start(FRAME_INTERVAL_MS)
        self._fade_to(1.0)

    def hide_smooth(self):
        if self._state == STATE_HIDDEN:
            return
        self._state = STATE_HIDDEN
        self._timer.stop()
        self._fade_to(0.0)

    def set_audio_level(self, level: float):
        self._audio_level = max(0.0, min(1.0, float(level)))

    # ---------- Animation ----------

    def _tick(self):
        if self._state == STATE_LISTENING:
            self._update_listening()
        elif self._state == STATE_PROCESSING:
            self._update_processing()
        self.update()

    def _update_listening(self):
        # Refresh target heights every few frames so the motion feels "live"
        # without strobing. In between we interpolate.
        self._listen_frame += 1
        if self._listen_frame >= LISTEN_RETARGET_EVERY:
            self._listen_frame = 0
            volume = 0.45 + self._audio_level * 0.55
            mid = (BAR_COUNT - 1) / 2
            for i in range(BAR_COUNT):
                distance = abs(i - mid) / mid if mid else 0
                base = (1 - distance * 0.5) * (BAR_MAX_H - 4) * volume
                t = max(BAR_MIN_H, min(BAR_MAX_H, base + random.random() * 3))
                self._listen_targets[i] = t
        # Smooth ease towards target every frame.
        for i in range(BAR_COUNT):
            self._bar_heights[i] += (self._listen_targets[i] - self._bar_heights[i]) * LISTEN_EASE

    def _update_processing(self):
        self._proc_t += PROC_T_STEP
        for i in range(BAR_COUNT):
            if i == 0 or i == BAR_COUNT - 1:
                target = float(BAR_MIN_H)
            else:
                offset = (i - 1) * 0.9
                target = 6.0 + (math.sin(self._proc_t - offset) * 0.5 + 0.5) * 14.0
            self._bar_heights[i] += (target - self._bar_heights[i]) * PROC_EASE

    # ---------- Fade ----------

    def _fade_to(self, target: float):
        self._fade.stop()
        self._fade.setStartValue(self.windowOpacity())
        self._fade.setEndValue(target)
        self._fade.start()

    def _after_fade(self):
        if self._state == STATE_HIDDEN and self.windowOpacity() <= 0.01:
            self.hide()
            self._bar_heights = [float(BAR_MIN_H)] * BAR_COUNT
            self._listen_targets = [float(BAR_MIN_H)] * BAR_COUNT

    # ---------- Painting ----------

    def paintEvent(self, _event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        # Step 1: hard-clear the canvas to fully transparent. Without this,
        # Windows leaks the system background into the corners of the pill.
        p.setCompositionMode(QPainter.CompositionMode.CompositionMode_Source)
        p.fillRect(self.rect(), Qt.GlobalColor.transparent)
        # Step 2: normal compositing for the actual pill + bars.
        p.setCompositionMode(QPainter.CompositionMode.CompositionMode_SourceOver)

        p.setBrush(QBrush(QColor(10, 10, 10)))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawRoundedRect(self.rect(), HUD_H / 2, HUD_H / 2)

        total_w = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_GAP
        start_x = (HUD_W - total_w) // 2
        p.setBrush(QBrush(QColor(255, 255, 255)))
        for i, h in enumerate(self._bar_heights):
            x = start_x + i * (BAR_WIDTH + BAR_GAP)
            y = (HUD_H - h) / 2
            p.drawRoundedRect(int(x), int(y), BAR_WIDTH, int(h), 1.5, 1.5)

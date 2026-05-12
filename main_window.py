"""Main GUI window — OpenLess-inspired design: black/white + electric blue,
hairline borders, Inter + PingFang typography, dashboard-style overview.
"""
import time
from pathlib import Path

from PyQt6.QtCore import QObject, Qt, QTimer, QSize, pyqtSignal
from PyQt6.QtGui import (
    QAction, QIcon, QPainter, QPixmap, QColor, QFont, QLinearGradient,
    QPen, QBrush,
)
from PyQt6.QtWidgets import (
    QApplication, QComboBox, QFrame, QHBoxLayout, QLabel, QListWidget,
    QListWidgetItem, QMainWindow, QProgressBar, QPushButton, QStackedWidget,
    QSystemTrayIcon, QVBoxLayout, QWidget, QMenu, QFormLayout, QMessageBox,
    QGridLayout, QSizePolicy, QGraphicsDropShadowEffect, QScrollArea,
)

import stats
from voice_engine import VoiceEngine, key_label, list_usable_microphones

ASSETS_DIR = Path(__file__).parent / "assets"

BRAND_NAME = "VoCo"
LANG_OPTIONS = [("韩语", "ko"), ("英语", "en"), ("日语", "ja"), ("中文", "zh")]
LANG_LABEL = {code: label for label, code in LANG_OPTIONS}
KEY_OPTIONS = [
    ("CapsLock", "caps_lock"), ("右Alt", "alt_r"), ("左Alt", "alt_l"),
    ("右Ctrl", "ctrl_r"), ("左Ctrl", "ctrl_l"),
    ("右Shift", "shift_r"), ("左Shift", "shift_l"),
    ("F8", "f8"), ("F9", "f9"), ("F10", "f10"), ("F11", "f11"), ("F12", "f12"),
    ("Insert", "insert"), ("Tab", "tab"),
]
MODE_LABEL = {"polish": "润色", "translate": "翻译", "raw": "原文"}

# OpenLess-inspired palette.
INK = "#0a0a0b"
INK_2 = "#2a2a2d"
INK_3 = "rgba(10, 10, 11, 0.62)"
INK_4 = "rgba(10, 10, 11, 0.42)"
INK_5 = "rgba(10, 10, 11, 0.24)"
WHITE = "#ffffff"
CANVAS = "#f7f7f8"
SURFACE = "#ffffff"
SURFACE_2 = "#fafafa"
LINE = "rgba(0, 0, 0, 0.08)"
LINE_SOFT = "rgba(0, 0, 0, 0.05)"
BLUE = "#2563eb"
BLUE_HOVER = "#1d4ed8"
BLUE_SOFT = "#eff4ff"
OK = "#16a34a"
OK_SOFT = "#ecfdf5"
WARN = "#d97706"
ERR = "#dc2626"
RECORDING = "#dc2626"

FONT_FAMILY = "'Inter', 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif"
MONO = "'JetBrains Mono', 'Consolas', monospace"


class EngineBridge(QObject):
    state_changed = pyqtSignal(str)
    result_ready = pyqtSignal(str, str, str)
    error_occurred = pyqtSignal(str)
    audio_level = pyqtSignal(float)


# ---------- Icons ----------

def make_brand_icon(size: int = 128) -> QIcon:
    """User-supplied logo from assets/, else minimal black circle + white mic."""
    for name in ("logo.png", "logo.svg", "logo.ico", "logo.jpg"):
        f = ASSETS_DIR / name
        if f.exists():
            icon = QIcon(str(f))
            if not icon.isNull():
                return icon
    pix = QPixmap(size, size)
    pix.fill(Qt.GlobalColor.transparent)
    p = QPainter(pix)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    p.setBrush(QColor(INK))
    p.setPen(Qt.PenStyle.NoPen)
    p.drawEllipse(0, 0, size, size)
    p.setBrush(QColor("#ffffff"))
    mic_w = int(size * 0.16)
    mic_h = int(size * 0.32)
    cx, cy = size // 2, size // 2 - int(size * 0.05)
    p.drawRoundedRect(cx - mic_w // 2, cy - mic_h // 2, mic_w, mic_h, mic_w // 2, mic_w // 2)
    pen = QPen(QColor("#ffffff"))
    pen.setWidth(max(2, size // 32))
    pen.setCapStyle(Qt.PenCapStyle.RoundCap)
    p.setPen(pen)
    p.setBrush(Qt.BrushStyle.NoBrush)
    arc_r = int(size * 0.16)
    p.drawArc(cx - arc_r, cy - int(size * 0.02), arc_r * 2, arc_r * 2, 0, -180 * 16)
    p.drawLine(cx, cy + arc_r, cx, cy + arc_r + int(size * 0.08))
    p.end()
    return QIcon(pix)


def make_status_icon(color: str, size: int = 64) -> QIcon:
    is_recording = color == RECORDING
    tray_file = ASSETS_DIR / ("tray_recording.png" if is_recording else "tray_idle.png")
    if tray_file.exists():
        icon = QIcon(str(tray_file))
        if not icon.isNull():
            return icon
    if not is_recording:
        logo = ASSETS_DIR / "logo.png"
        if logo.exists():
            icon = QIcon(str(logo))
            if not icon.isNull():
                return icon
    pix = QPixmap(size, size)
    pix.fill(Qt.GlobalColor.transparent)
    p = QPainter(pix)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    p.setBrush(QColor(RECORDING) if is_recording else QColor(INK))
    p.setPen(Qt.PenStyle.NoPen)
    p.drawEllipse(4, 4, size - 8, size - 8)
    p.setBrush(QColor(255, 255, 255, 245))
    p.drawRoundedRect(size // 2 - 6, size // 2 - 14, 12, 22, 5, 5)
    p.drawRect(size // 2 - 10, size // 2 + 10, 20, 3)
    p.end()
    return QIcon(pix)


def _shadow(widget: QWidget, blur: int = 20, opacity: int = 18):
    eff = QGraphicsDropShadowEffect(widget)
    eff.setBlurRadius(blur)
    eff.setOffset(0, 2)
    eff.setColor(QColor(0, 0, 0, opacity))
    widget.setGraphicsEffect(eff)


# ---------- Reusable atoms ----------

class Card(QFrame):
    def __init__(self, padding: int = 16, parent=None):
        super().__init__(parent)
        self.setStyleSheet(
            f"Card {{ background: {SURFACE}; border: 1px solid {LINE}; "
            f"border-radius: 14px; }}"
        )
        self.setObjectName("")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self._inner = QVBoxLayout(self)
        self._inner.setContentsMargins(padding, padding, padding, padding)
        self._inner.setSpacing(0)

    def inner(self) -> QVBoxLayout:
        return self._inner


def _pill(text: str, tone: str = "default") -> QLabel:
    if tone == "ok":
        css = f"color: {OK}; background: {OK_SOFT}; border: 1px solid rgba(22,163,74,0.18);"
    elif tone == "warn":
        css = f"color: {WARN}; background: #fff7ed; border: 1px solid rgba(217,119,6,0.18);"
    elif tone == "blue":
        css = f"color: {BLUE}; background: {BLUE_SOFT}; border: 1px solid rgba(37,99,235,0.18);"
    else:
        css = f"color: {INK_2}; background: transparent; border: 1px solid {LINE};"
    lbl = QLabel(text)
    lbl.setStyleSheet(
        f"QLabel {{ {css} padding: 2px 8px; border-radius: 999px; "
        f"font-size: 11px; font-weight: 500; }}"
    )
    return lbl


def _h1(text: str) -> QLabel:
    lbl = QLabel(text)
    lbl.setStyleSheet(
        f"font-size: 22px; font-weight: 600; color: {INK}; letter-spacing: -0.3px;"
    )
    return lbl


def _muted(text: str, size: int = 12) -> QLabel:
    lbl = QLabel(text)
    lbl.setStyleSheet(f"font-size: {size}px; color: {INK_3};")
    return lbl


# ---------- Pages ----------

class HomePage(QWidget):
    def __init__(self, engine: VoiceEngine, on_open_history):
        super().__init__()
        self.engine = engine
        self.on_open_history = on_open_history
        self.setStyleSheet(f"background: {CANVAS};")

        outer = QVBoxLayout(self)
        outer.setContentsMargins(28, 24, 28, 24)
        outer.setSpacing(14)

        # Header
        header = QHBoxLayout()
        header.setContentsMargins(0, 0, 0, 0)
        header.addWidget(_h1("概览"))
        header.addStretch()
        self.status_pill = _pill("● 就绪", "ok")
        header.addWidget(self.status_pill)
        outer.addLayout(header)

        # Shortcut hint
        self.shortcut_label = QLabel(self._shortcut_html())
        self.shortcut_label.setStyleSheet(f"color: {INK_3}; font-size: 12px;")
        self.shortcut_label.setTextFormat(Qt.TextFormat.RichText)
        outer.addWidget(self.shortcut_label)

        # Provider cards row (2 columns).
        providers = QHBoxLayout()
        providers.setSpacing(12)
        self.asr_card = ProviderCard("识别引擎", "SenseVoice 本地", "iic/SenseVoiceSmall", "ok", icon="mic")
        self.llm_card = ProviderCard("AI 引擎", "Claude Haiku 4.5", "bltcy.ai / claude-haiku-4-5", "ok", icon="ai")
        providers.addWidget(self.asr_card)
        providers.addWidget(self.llm_card)
        outer.addLayout(providers)

        # Metric cards row (4 columns).
        metrics = QHBoxLayout()
        metrics.setSpacing(12)
        self.m_chars_today = MetricCard("今日字数", "0", "字", "")
        self.m_duration_today = MetricCard("今日时长", "0", "秒", "")
        self.m_total_chars = MetricCard("累计字数", "0", "字", "")
        self.m_total_count = MetricCard("累计次数", "0", "次", "全部识别", accent=True)
        for w in (self.m_chars_today, self.m_duration_today, self.m_total_chars, self.m_total_count):
            metrics.addWidget(w)
        outer.addLayout(metrics)

        # Bottom: week chart + recent list.
        bottom = QHBoxLayout()
        bottom.setSpacing(12)

        self.week_card = Card(padding=18)
        self.week_card.setMinimumHeight(220)
        wl = self.week_card.inner()
        wl_head = QHBoxLayout()
        wl_head.addWidget(self._cap("近 7 天"))
        wl_head.addStretch()
        wl_head.addWidget(self._cap("次"))
        wl.addLayout(wl_head)
        wl.addSpacing(10)
        self.week_chart = WeekChart()
        wl.addWidget(self.week_chart, 1)

        self.recent_card = Card(padding=0)
        self.recent_card.setMinimumHeight(220)
        rl = self.recent_card.inner()
        rl_head = QHBoxLayout()
        rl_head.setContentsMargins(18, 14, 18, 14)
        rl_head.addWidget(self._cap("最近识别"))
        rl_head.addStretch()
        more_btn = QPushButton("查看全部 →")
        more_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        more_btn.setStyleSheet(
            f"QPushButton {{ background: transparent; color: {BLUE}; "
            f"border: none; font-size: 12px; padding: 0; }}"
            f"QPushButton:hover {{ color: {BLUE_HOVER}; }}"
        )
        more_btn.clicked.connect(lambda: self.on_open_history())
        rl_head.addWidget(more_btn)
        rl.addLayout(rl_head)

        sep = QFrame()
        sep.setFixedHeight(1)
        sep.setStyleSheet(f"background: {LINE};")
        rl.addWidget(sep)

        self.recent_list = QVBoxLayout()
        self.recent_list.setContentsMargins(0, 0, 0, 0)
        self.recent_list.setSpacing(0)
        recent_holder = QWidget()
        recent_holder.setLayout(self.recent_list)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setWidget(recent_holder)
        rl.addWidget(scroll, 1)

        bottom.addWidget(self.week_card, 5)
        bottom.addWidget(self.recent_card, 7)
        outer.addLayout(bottom, 1)

        self.refresh()
        self._timer = QTimer(self)
        self._timer.timeout.connect(self.refresh)
        self._timer.start(2000)

    def _cap(self, text: str) -> QLabel:
        l = QLabel(text)
        l.setStyleSheet(
            f"font-size: 11px; color: {INK_3}; font-weight: 600; letter-spacing: 0.6px;"
        )
        return l

    def _shortcut_html(self) -> str:
        p = key_label(self.engine.polish_name)
        t = key_label(self.engine.translate_name)
        kbd = lambda s: (
            f"<span style='background:#f0f0f2;color:{INK};padding:2px 7px;"
            f"border-radius:6px;font-size:11px;border:1px solid {LINE};font-weight:500;'>{s}</span>"
        )
        return f"按住 {kbd(p)} 润色 　 按住 {kbd(p)}+{kbd(t)} 翻译"

    def refresh_shortcuts(self):
        self.shortcut_label.setText(self._shortcut_html())

    def refresh(self):
        agg = stats.snapshot()
        history = stats.history_snapshot()

        # Today's slice.
        now = time.time()
        today_start = time.mktime(time.localtime(now)[:3] + (0, 0, 0, 0, 0, -1))
        today_entries = [h for h in history if h["created_at"] >= today_start]
        chars_today = sum(len(e["final"]) for e in today_entries)
        duration_today = sum(e["duration_ms"] for e in today_entries) // 1000

        self.m_chars_today.set_value(str(chars_today))
        self.m_duration_today.set_value(str(duration_today))
        self.m_total_chars.set_value(str(agg["total_chars"]))
        self.m_total_count.set_value(str(agg["recognize_count"]))

        self.week_chart.set_data(stats.daily_counts(7))

        # Rebuild recent list (latest 5).
        while self.recent_list.count():
            item = self.recent_list.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        if not history:
            empty = QLabel("还没有识别记录,按住快捷键说话试试。")
            empty.setStyleSheet(f"color: {INK_4}; font-size: 12px; padding: 24px 18px;")
            empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.recent_list.addWidget(empty)
        else:
            for entry in history[:5]:
                self.recent_list.addWidget(RecentRow(entry))
            self.recent_list.addStretch(1)

    def set_status(self, state: str):
        if state == "recording":
            self.status_pill.setText("● 正在录音…")
            self.status_pill.setStyleSheet(
                f"QLabel {{ color: {RECORDING}; background: #fef2f2; "
                f"border: 1px solid rgba(220,38,38,0.2); padding: 2px 8px; "
                f"border-radius: 999px; font-size: 11px; font-weight: 500; }}"
            )
        elif state == "processing":
            self.status_pill.setText("● 识别中…")
            self.status_pill.setStyleSheet(
                f"QLabel {{ color: {WARN}; background: #fff7ed; "
                f"border: 1px solid rgba(217,119,6,0.2); padding: 2px 8px; "
                f"border-radius: 999px; font-size: 11px; font-weight: 500; }}"
            )
        else:
            self.status_pill.setText("● 就绪")
            self.status_pill.setStyleSheet(
                f"QLabel {{ color: {OK}; background: {OK_SOFT}; "
                f"border: 1px solid rgba(22,163,74,0.18); padding: 2px 8px; "
                f"border-radius: 999px; font-size: 11px; font-weight: 500; }}"
            )

    def show_result(self, mode: str, raw: str, final: str):
        # The session record will repopulate the list via refresh() within 2s.
        self.refresh()


class ProviderCard(Card):
    def __init__(self, kind: str, name: str, subname: str, status: str, icon: str = "mic"):
        super().__init__(padding=16)
        h = QHBoxLayout()
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(12)
        # Icon block.
        icon_label = QLabel()
        pix = QPixmap(38, 38)
        pix.fill(Qt.GlobalColor.transparent)
        p = QPainter(pix)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setBrush(QColor(BLUE_SOFT))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawRoundedRect(0, 0, 38, 38, 10, 10)
        p.setBrush(QColor(BLUE))
        if icon == "mic":
            p.drawRoundedRect(15, 10, 8, 14, 4, 4)
            pen = QPen(QColor(BLUE))
            pen.setWidth(2)
            pen.setCapStyle(Qt.PenCapStyle.RoundCap)
            p.setPen(pen)
            p.setBrush(Qt.BrushStyle.NoBrush)
            p.drawArc(11, 16, 16, 10, 0, -180 * 16)
            p.drawLine(19, 26, 19, 30)
        else:  # ai sparkle
            p.drawEllipse(15, 8, 8, 8)
            p.drawEllipse(11, 18, 6, 6)
            p.drawEllipse(21, 20, 6, 6)
        p.end()
        icon_label.setPixmap(pix)
        h.addWidget(icon_label)

        right = QVBoxLayout()
        right.setSpacing(2)
        top = QHBoxLayout()
        top.setSpacing(8)
        kind_lbl = QLabel(kind)
        kind_lbl.setStyleSheet(
            f"font-size: 10px; color: {INK_4}; font-weight: 600; letter-spacing: 0.8px;"
        )
        top.addWidget(kind_lbl)
        if status == "ok":
            top.addWidget(_pill("已配置", "ok"))
        else:
            top.addWidget(_pill("未配置", "default"))
        top.addStretch()
        right.addLayout(top)
        name_lbl = QLabel(name)
        name_lbl.setStyleSheet(f"font-size: 14px; font-weight: 600; color: {INK};")
        right.addWidget(name_lbl)
        sub_lbl = QLabel(subname)
        sub_lbl.setStyleSheet(f"font-size: 11px; color: {INK_3}; font-family: {MONO};")
        right.addWidget(sub_lbl)
        h.addLayout(right, 1)
        self.inner().addLayout(h)


class MetricCard(Card):
    def __init__(self, label: str, value: str, unit: str, trend: str, accent: bool = False):
        super().__init__(padding=16)
        v = self.inner()
        v.setSpacing(6)
        head = QHBoxLayout()
        head.setContentsMargins(0, 0, 0, 0)
        head.setSpacing(6)
        dot = QLabel()
        dot.setFixedSize(8, 8)
        dot.setStyleSheet(
            f"background: {BLUE if accent else INK_5}; border-radius: 4px;"
        )
        head.addWidget(dot)
        head.addWidget(_muted(label, 11))
        head.addStretch()
        v.addLayout(head)
        row = QHBoxLayout()
        row.setSpacing(4)
        self.value_lbl = QLabel(value)
        self.value_lbl.setStyleSheet(
            f"font-size: 26px; font-weight: 600; letter-spacing: -0.5px; "
            f"color: {BLUE if accent else INK};"
        )
        row.addWidget(self.value_lbl)
        unit_lbl = QLabel(unit)
        unit_lbl.setStyleSheet(f"color: {INK_4}; font-size: 11px;")
        row.addWidget(unit_lbl, alignment=Qt.AlignmentFlag.AlignBottom)
        row.addStretch()
        v.addLayout(row)
        trend_lbl = QLabel(trend or " ")
        trend_lbl.setStyleSheet(f"color: {INK_4}; font-size: 11px;")
        v.addWidget(trend_lbl)

    def set_value(self, value: str):
        self.value_lbl.setText(value)


class WeekChart(QWidget):
    """7-day bar chart, today highlighted in blue."""
    def __init__(self):
        super().__init__()
        self.data = [0] * 7
        self.setMinimumHeight(130)

    def set_data(self, data: list):
        self.data = list(data)[-7:]
        while len(self.data) < 7:
            self.data.insert(0, 0)
        self.update()

    def paintEvent(self, ev):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w = self.width()
        h = self.height() - 24  # leave space for day labels
        if h < 20:
            return
        bar_count = 7
        gap = 10
        bar_w = (w - gap * (bar_count - 1)) / bar_count
        max_v = max(self.data) if max(self.data) > 0 else 1
        days = ["六前", "五前", "四前", "三前", "前天", "昨天", "今天"]
        for i, v in enumerate(self.data):
            x = i * (bar_w + gap)
            bh = (v / max_v) * (h - 16) if max_v > 0 else 0
            bh = max(3, bh)
            is_today = i == bar_count - 1
            color = QColor(BLUE) if is_today else QColor(INK)
            p.setBrush(color)
            p.setPen(Qt.PenStyle.NoPen)
            if v == 0:
                p.setOpacity(0.10)
            else:
                p.setOpacity(1.0 if is_today else 0.78)
            p.drawRoundedRect(int(x), int(h - bh), int(bar_w), int(bh), 3, 3)
            p.setOpacity(1.0)
            # Count above bar.
            p.setPen(QColor(BLUE if is_today else INK_3))
            font = QFont(); font.setPointSize(8)
            p.setFont(font)
            p.drawText(int(x), int(h - bh - 12), int(bar_w), 12,
                       Qt.AlignmentFlag.AlignCenter, str(v))
            # Day label.
            p.setPen(QColor(BLUE if is_today else INK_4))
            font2 = QFont(); font2.setPointSize(8)
            if is_today: font2.setBold(True)
            p.setFont(font2)
            p.drawText(int(x), self.height() - 16, int(bar_w), 14,
                       Qt.AlignmentFlag.AlignCenter, days[i])
        p.end()


class RecentRow(QWidget):
    def __init__(self, entry: dict):
        super().__init__()
        h = QHBoxLayout(self)
        h.setContentsMargins(18, 10, 18, 10)
        h.setSpacing(12)
        # Time + pill.
        left = QVBoxLayout()
        left.setSpacing(4)
        t = time.strftime("%H:%M", time.localtime(entry["created_at"]))
        time_lbl = QLabel(t)
        time_lbl.setStyleSheet(f"color: {INK_3}; font-size: 11px; font-family: {MONO};")
        left.addWidget(time_lbl)
        mode = entry.get("mode", "")
        tone = "blue" if mode == "translate" else "default"
        label_text = MODE_LABEL.get(mode, mode)
        if mode == "translate" and entry.get("target_lang"):
            label_text += f"→{LANG_LABEL.get(entry['target_lang'], entry['target_lang'])}"
        left.addWidget(_pill(label_text, tone))
        h.addLayout(left)
        # Text.
        text = entry.get("final", "")
        first_line = (text.splitlines() or [""])[0]
        if len(first_line) > 60:
            first_line = first_line[:58] + "…"
        body = QLabel(first_line or "—")
        body.setStyleSheet(f"color: {INK_2}; font-size: 13px;")
        body.setWordWrap(False)
        h.addWidget(body, 1)
        # Duration.
        dur_ms = entry.get("duration_ms", 0)
        if dur_ms >= 1000:
            dur_txt = f"{dur_ms/1000:.1f}s"
        else:
            dur_txt = f"{dur_ms}ms"
        dur = QLabel(dur_txt)
        dur.setStyleSheet(f"color: {INK_4}; font-size: 10px; font-family: {MONO};")
        h.addWidget(dur)
        # Bottom hairline.
        self.setStyleSheet(
            f"RecentRow {{ border-bottom: 1px solid {LINE_SOFT}; }}"
        )
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)


class HistoryPage(QWidget):
    def __init__(self):
        super().__init__()
        self.setStyleSheet(f"background: {CANVAS};")
        v = QVBoxLayout(self)
        v.setContentsMargins(28, 24, 28, 24)
        v.setSpacing(14)
        v.addWidget(_h1("历史记录"))
        v.addWidget(_muted("所有过往识别记录,最新的在最上面。"))

        self.list_card = Card(padding=0)
        self.list_inner = self.list_card.inner()
        self.list_inner.setContentsMargins(0, 0, 0, 0)
        self.list_inner.setSpacing(0)

        self.scroll_widget = QWidget()
        self.scroll_layout = QVBoxLayout(self.scroll_widget)
        self.scroll_layout.setContentsMargins(0, 0, 0, 0)
        self.scroll_layout.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setWidget(self.scroll_widget)
        self.list_inner.addWidget(scroll)
        v.addWidget(self.list_card, 1)

        self.refresh()
        self._timer = QTimer(self)
        self._timer.timeout.connect(self.refresh)
        self._timer.start(3000)

    def refresh(self):
        while self.scroll_layout.count():
            item = self.scroll_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        history = stats.history_snapshot()
        if not history:
            empty = QLabel("还没有任何识别记录。")
            empty.setStyleSheet(f"color: {INK_4}; font-size: 13px; padding: 40px;")
            empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.scroll_layout.addWidget(empty)
            self.scroll_layout.addStretch(1)
            return
        for entry in history:
            self.scroll_layout.addWidget(RecentRow(entry))
        self.scroll_layout.addStretch(1)


class _PlaceholderPage(QWidget):
    def __init__(self, title: str, subtitle: str):
        super().__init__()
        self.setStyleSheet(f"background: {CANVAS};")
        v = QVBoxLayout(self)
        v.setContentsMargins(28, 24, 28, 24)
        v.setSpacing(14)
        v.addWidget(_h1(title))
        v.addWidget(_muted(subtitle))
        soon = _pill("即将推出", "blue")
        soon.setMaximumWidth(80)
        v.addWidget(soon)
        v.addStretch()


class SettingsPage(QWidget):
    def __init__(self, engine: VoiceEngine, bridge: "EngineBridge", on_change):
        super().__init__()
        self.engine = engine
        self.bridge = bridge
        self.on_change = on_change
        self.setStyleSheet(f"background: {CANVAS};")

        v = QVBoxLayout(self)
        v.setContentsMargins(28, 24, 28, 24)
        v.setSpacing(14)
        v.addWidget(_h1("设置"))

        # ---------- Microphone section ----------
        mic_card = Card(padding=0)
        mi = mic_card.inner()
        mi.setContentsMargins(0, 0, 0, 0)
        mi.setSpacing(0)
        mic_section = QLabel("麦克风")
        mic_section.setStyleSheet(
            f"font-size: 10px; font-weight: 600; color: {INK_3}; "
            f"letter-spacing: 1px; padding: 16px 18px 8px 18px;"
        )
        mi.addWidget(mic_section)

        self.mic_combo = QComboBox()
        self.mic_combo.setStyleSheet(
            "QComboBox { padding: 6px 12px; border: 1px solid rgba(0,0,0,0.12); "
            "border-radius: 8px; background: white; font-size: 13px; min-width: 280px; }"
            f"QComboBox:hover {{ border-color: {BLUE}; }}"
        )
        self._populate_mic_combo()
        self.mic_combo.currentIndexChanged.connect(self._on_mic_changed)
        mi.addWidget(self._row("使用的麦克风", self.mic_combo))

        # Live audio level meter.
        self.mic_meter = QProgressBar()
        self.mic_meter.setRange(0, 100)
        self.mic_meter.setValue(0)
        self.mic_meter.setTextVisible(False)
        self.mic_meter.setFixedHeight(8)
        self.mic_meter.setStyleSheet(
            f"QProgressBar {{ background: rgba(0,0,0,0.05); border-radius: 4px; border: none; }}"
            f"QProgressBar::chunk {{ background: {BLUE}; border-radius: 4px; }}"
        )
        mi.addWidget(self._row("实时音量（对着麦说话看跳条）", self.mic_meter))

        self.rerun_btn = QPushButton("重新运行首次设置向导")
        self.rerun_btn.setStyleSheet(
            f"QPushButton {{ background: transparent; color: {BLUE}; "
            f"border: 1px solid {LINE}; border-radius: 8px; padding: 6px 14px; font-size: 12px; }}"
            f"QPushButton:hover {{ border-color: {BLUE}; }}"
        )
        self.rerun_btn.clicked.connect(self._on_rerun_wizard)
        mi.addWidget(self._row("出问题了？", self.rerun_btn, last=True))

        v.addWidget(mic_card)

        self.bridge.audio_level.connect(self._on_audio_level)

        # ---------- Hotkey section ----------
        card = Card(padding=0)
        ci = card.inner()
        ci.setContentsMargins(0, 0, 0, 0)
        ci.setSpacing(0)
        section = QLabel("快捷键 与 触发")
        section.setStyleSheet(
            f"font-size: 10px; font-weight: 600; color: {INK_3}; "
            f"letter-spacing: 1px; padding: 16px 18px 8px 18px;"
        )
        ci.addWidget(section)

        self.polish_combo = self._make_key_combo(engine.polish_name)
        self.polish_combo.currentIndexChanged.connect(self._on_polish_changed)
        ci.addWidget(self._row("录音键（按住=润色）", self.polish_combo))

        self.translate_combo = self._make_key_combo(engine.translate_modifier_name)
        self.translate_combo.currentIndexChanged.connect(self._on_translate_changed)
        ci.addWidget(self._row("翻译附加键（与录音键同时按=翻译）", self.translate_combo))

        self.mode_combo = QComboBox()
        self.mode_combo.addItem("按住说话 松开识别", "hold")
        self.mode_combo.addItem("点一下开始 再点一下结束", "toggle")
        self.mode_combo.setCurrentIndex(0 if engine.trigger_mode == "hold" else 1)
        self.mode_combo.currentIndexChanged.connect(self._on_mode_changed)
        ci.addWidget(self._row("触发方式", self.mode_combo))

        self.lang_combo = QComboBox()
        for label, code in LANG_OPTIONS:
            self.lang_combo.addItem(label, code)
        for i in range(self.lang_combo.count()):
            if self.lang_combo.itemData(i) == engine.translate_target:
                self.lang_combo.setCurrentIndex(i)
                break
        self.lang_combo.currentIndexChanged.connect(self._on_lang_changed)
        ci.addWidget(self._row("翻译目标语言", self.lang_combo, last=True))

        v.addWidget(card)

        note = QLabel("修改后立即生效。按住录音键 = 润色出字；录音期间同时按住翻译附加键 = 翻译出字。")
        note.setStyleSheet(f"color: {INK_4}; font-size: 12px;")
        note.setWordWrap(True)
        v.addWidget(note)

        v.addStretch()

    def _row(self, label: str, widget: QWidget, last: bool = False) -> QWidget:
        row = QWidget()
        border = "" if last else f"border-bottom: 1px solid {LINE};"
        row.setStyleSheet(f"QWidget {{ {border} }}")
        h = QHBoxLayout(row)
        h.setContentsMargins(18, 12, 18, 12)
        lbl = QLabel(label)
        lbl.setStyleSheet(f"font-size: 13px; color: {INK};")
        h.addWidget(lbl)
        h.addStretch()
        h.addWidget(widget)
        return row

    def _make_key_combo(self, current: str) -> QComboBox:
        c = QComboBox()
        for label, code in KEY_OPTIONS:
            c.addItem(label, code)
        for i in range(c.count()):
            if c.itemData(i) == current:
                c.setCurrentIndex(i)
                break
        c.setStyleSheet(
            "QComboBox { padding: 6px 12px; border: 1px solid rgba(0,0,0,0.12); "
            "border-radius: 8px; background: white; font-size: 13px; min-width: 200px; }"
            f"QComboBox:hover {{ border-color: {BLUE}; }}"
        )
        return c

    def _on_polish_changed(self, idx):
        code = self.polish_combo.itemData(idx)
        if code == self.translate_combo.currentData():
            QMessageBox.warning(self, "冲突", "录音键和翻译附加键不能相同")
            for i in range(self.polish_combo.count()):
                if self.polish_combo.itemData(i) == self.engine.polish_name:
                    self.polish_combo.setCurrentIndex(i)
                    break
            return
        self.engine.update_setting("trigger_polish", code)
        self.on_change()

    def _on_translate_changed(self, idx):
        code = self.translate_combo.itemData(idx)
        if code == self.polish_combo.currentData():
            QMessageBox.warning(self, "冲突", "录音键和翻译附加键不能相同")
            for i in range(self.translate_combo.count()):
                if self.translate_combo.itemData(i) == self.engine.translate_modifier_name:
                    self.translate_combo.setCurrentIndex(i)
                    break
            return
        self.engine.update_setting("trigger_translate_modifier", code)
        self.on_change()

    def _on_mode_changed(self, idx):
        self.engine.update_setting("trigger_mode", self.mode_combo.itemData(idx))

    def _on_lang_changed(self, idx):
        self.engine.set_translate_target(self.lang_combo.itemData(idx))

    def _populate_mic_combo(self):
        self.mic_combo.blockSignals(True)
        self.mic_combo.clear()
        mics = list_usable_microphones()
        if not mics:
            self.mic_combo.addItem("没找到可用麦克风", None)
            self.mic_combo.setEnabled(False)
        else:
            current = self.engine.config.get("input_device", "")
            chosen_idx = 0
            for i, (idx, name) in enumerate(mics):
                self.mic_combo.addItem(name, name)
                if name == current or (current and current in name):
                    chosen_idx = i
            self.mic_combo.setCurrentIndex(chosen_idx)
        self.mic_combo.blockSignals(False)

    def _on_mic_changed(self, idx):
        name = self.mic_combo.itemData(idx)
        if not name:
            return
        self.engine.update_setting("input_device", name)

    def _on_audio_level(self, level: float):
        self.mic_meter.setValue(int(level * 100))

    def _on_rerun_wizard(self):
        from setup_wizard import SetupWizard
        # Hand off mic + keyboard ownership to the wizard.
        self.engine.set_paused(True)
        try:
            if self.engine._stream is not None:
                self.engine._stream.stop()
                self.engine._stream.close()
                self.engine._stream = None
        except Exception:
            pass
        if self.engine._listener is not None:
            try:
                self.engine._listener.stop()
            except Exception:
                pass
            self.engine._listener = None
        wizard = SetupWizard(self.engine, parent=self.window())
        wizard.exec()
        # Restart engine fully with whatever the wizard saved.
        self.engine.start()
        self.engine.set_paused(False)
        self._populate_mic_combo()
        self.on_change()


class Sidebar(QWidget):
    def __init__(self):
        super().__init__()
        self.setFixedWidth(200)
        self.setStyleSheet(
            f"background: {WHITE}; border-right: 1px solid {LINE};"
        )

        v = QVBoxLayout(self)
        v.setContentsMargins(0, 24, 0, 16)
        v.setSpacing(0)

        brand = QWidget()
        bh = QHBoxLayout(brand)
        bh.setContentsMargins(20, 0, 20, 24)
        bh.setSpacing(10)
        logo = QLabel()
        logo.setPixmap(make_brand_icon(28).pixmap(28, 28))
        bh.addWidget(logo)
        name = QLabel(BRAND_NAME)
        name.setStyleSheet(
            f"color: {INK}; font-size: 17px; font-weight: 700; letter-spacing: -0.2px;"
        )
        bh.addWidget(name)
        bh.addStretch()
        v.addWidget(brand)

        self.list = QListWidget()
        self.list.setStyleSheet(
            "QListWidget { background: transparent; border: none; padding: 0 10px; outline: none; }"
            f"QListWidget::item {{ color: {INK_2}; padding: 9px 14px; "
            "border-radius: 8px; margin-bottom: 2px; font-size: 13px; font-weight: 500; }"
            f"QListWidget::item:hover {{ background: {SURFACE_2}; }}"
            f"QListWidget::item:selected {{ background: {BLUE_SOFT}; "
            f"color: {BLUE}; font-weight: 600; }}"
        )
        for name_text in ("概览", "历史记录", "词典", "设置"):
            QListWidgetItem(name_text, self.list)
        self.list.setCurrentRow(0)
        v.addWidget(self.list, 1)

        ver = QLabel(f"v0.5  ·  本地识别")
        ver.setStyleSheet(f"color: {INK_5}; font-size: 11px; padding: 0 24px;")
        v.addWidget(ver)


class MainWindow(QMainWindow):
    def __init__(self, engine: VoiceEngine, bridge: EngineBridge):
        super().__init__()
        self.engine = engine
        self.bridge = bridge
        self.setWindowTitle(BRAND_NAME)
        self.setWindowIcon(make_brand_icon())
        self.resize(1080, 720)
        self.setStyleSheet(f"QMainWindow {{ background: {CANVAS}; }}")

        central = QWidget()
        self.setCentralWidget(central)
        h = QHBoxLayout(central)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(0)

        self.sidebar = Sidebar()
        h.addWidget(self.sidebar)

        self.pages = QStackedWidget()
        self.history_page = HistoryPage()
        self.home_page = HomePage(engine, on_open_history=lambda: self.sidebar.list.setCurrentRow(1))
        self.dictionary_page = _PlaceholderPage(
            "词典",
            "自定义术语和专有名词,VoCo 会用它们提高识别准确度。",
        )
        self.settings_page = SettingsPage(engine, bridge, on_change=self.home_page.refresh_shortcuts)
        for w in (self.home_page, self.history_page, self.dictionary_page, self.settings_page):
            self.pages.addWidget(w)
        h.addWidget(self.pages, 1)

        self.sidebar.list.currentRowChanged.connect(self.pages.setCurrentIndex)

        bridge.state_changed.connect(self.home_page.set_status)
        bridge.result_ready.connect(self.home_page.show_result)
        bridge.error_occurred.connect(self._show_error)

    def _show_error(self, msg: str):
        print(f"[error] {msg}")

    def closeEvent(self, event):
        event.ignore()
        self.hide()


class TrayController:
    def __init__(self, window: MainWindow, engine: VoiceEngine, app: QApplication):
        self.window = window
        self.engine = engine
        self.app = app

        self.tray = QSystemTrayIcon(make_status_icon("idle"), app)
        self.tray.setToolTip(BRAND_NAME)

        menu = QMenu()
        menu.setStyleSheet(
            f"QMenu {{ background: white; border: 1px solid {LINE}; "
            "border-radius: 8px; padding: 4px; }"
            "QMenu::item { padding: 7px 24px; border-radius: 6px; font-size: 13px; }"
            f"QMenu::item:selected {{ background: {BLUE_SOFT}; color: {BLUE}; }}"
        )
        open_act = QAction("打开主界面", menu)
        open_act.triggered.connect(self.show_window)
        menu.addAction(open_act)
        menu.addSeparator()

        lang_menu = QMenu("翻译目标", menu)
        self._lang_actions = []
        for label, code in LANG_OPTIONS:
            a = QAction(label, lang_menu, checkable=True)
            a.setChecked(code == engine.translate_target)
            a.triggered.connect(lambda checked, c=code: self._set_lang(c))
            lang_menu.addAction(a)
            self._lang_actions.append((a, code))
        menu.addMenu(lang_menu)

        self.pause_act = QAction("暂停语音输入", menu, checkable=True)
        self.pause_act.triggered.connect(self._toggle_pause)
        menu.addAction(self.pause_act)

        menu.addSeparator()
        quit_act = QAction(f"退出 {BRAND_NAME}", menu)
        quit_act.triggered.connect(self.quit)
        menu.addAction(quit_act)

        self.tray.setContextMenu(menu)
        self.tray.activated.connect(self._on_activate)
        self.tray.show()

    def show_window(self):
        self.window.show()
        self.window.raise_()
        self.window.activateWindow()

    def _on_activate(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self.show_window()

    def _set_lang(self, code: str):
        self.engine.set_translate_target(code)
        for a, c in self._lang_actions:
            a.setChecked(c == code)
        for i in range(self.window.settings_page.lang_combo.count()):
            if self.window.settings_page.lang_combo.itemData(i) == code:
                self.window.settings_page.lang_combo.blockSignals(True)
                self.window.settings_page.lang_combo.setCurrentIndex(i)
                self.window.settings_page.lang_combo.blockSignals(False)
                break

    def _toggle_pause(self, checked):
        self.engine.set_paused(checked)

    def set_recording_icon(self, recording: bool):
        self.tray.setIcon(make_status_icon(RECORDING if recording else "idle"))

    def quit(self):
        self.engine.stop()
        self.tray.hide()
        self.app.quit()

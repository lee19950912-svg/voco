"""Main GUI window — OpenLess-inspired design: black/white + electric blue,
hairline borders, Inter + PingFang typography, dashboard-style overview.
"""
import time
from pathlib import Path

from PyQt6.QtCore import QObject, QPoint, QPointF, Qt, QTimer, QSize, pyqtSignal
from PyQt6.QtGui import (
    QAction, QIcon, QPainter, QPainterPath, QPixmap, QColor, QFont,
    QLinearGradient, QPen, QBrush,
)
from PyQt6.QtSvg import QSvgRenderer
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

# Design tokens — synced with voxo/DESIGN-NOTES.md (oklch → hex equivalents).
INK = "#1d2230"           # --fg
INK_2 = "#353a4a"         # --fg-soft
INK_3 = "#6e7484"         # --muted
INK_4 = "#a3a8b3"         # --muted-2
INK_5 = "rgba(29, 34, 48, 0.24)"
WHITE = "#ffffff"
CANVAS = "#fbfbfc"        # --bg
SURFACE = "#ffffff"       # --surface
SURFACE_2 = "#f4f5f7"     # --surface-2
SURFACE_3 = "#e9ebef"     # --surface-3
LINE = "#e2e5ea"          # --border
LINE_STRONG = "#cdd1d8"   # --border-strong
LINE_SOFT = "rgba(0, 0, 0, 0.04)"
BLUE = "#5b6bf0"          # --accent (blue-violet)
BLUE_HOVER = "#4c5be0"
BLUE_SOFT = "#eef0fd"     # --accent-soft
OK = "#2ea778"            # --success
OK_SOFT = "#e9f7f0"
WARN = "#d99a2e"          # --warning
ERR = "#d44a3a"           # --danger
RECORDING = "#d44a3a"

# Pure system font stack per design notes — no third-party fonts.
FONT_FAMILY = "-apple-system, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif"
MONO = "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace"


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


def _center_combo(c: QComboBox) -> None:
    """Center-align the displayed selected text inside a non-editable QComboBox.

    Qt's QComboBox renders the current text via a hidden QLineEdit only when
    editable=True. Trick: make it editable but read-only, then center-align the
    line edit. Also paint the popup items centered via the item delegate.
    """
    c.setEditable(True)
    le = c.lineEdit()
    le.setReadOnly(True)
    le.setAlignment(Qt.AlignmentFlag.AlignCenter)
    le.setCursor(Qt.CursorShape.ArrowCursor)
    le.setFocusPolicy(Qt.FocusPolicy.NoFocus)
    le.setStyleSheet("QLineEdit { background: transparent; border: none; }")
    # Center popup items too so the menu matches the selected display.
    for i in range(c.count()):
        c.setItemData(i, Qt.AlignmentFlag.AlignCenter, Qt.ItemDataRole.TextAlignmentRole)


_ICONS_DIR = Path(__file__).parent / "assets" / "icons"
_SVG_CACHE: dict = {}


def _lucide_pixmap(name: str, size: int, color: str) -> QPixmap:
    """Load a Lucide SVG from assets/icons and rasterize at `size` in `color`.

    Lucide SVGs use stroke="currentColor". We substitute it with the requested
    color before handing the raw bytes to QSvgRenderer, so the same SVG can
    be tinted any color without extra assets.
    """
    cache_key = f"{name}:{color}"
    svg_bytes = _SVG_CACHE.get(cache_key)
    if svg_bytes is None:
        path = _ICONS_DIR / f"{name}.svg"
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return QPixmap(size, size)
        svg_bytes = text.replace("currentColor", color).encode("utf-8")
        _SVG_CACHE[cache_key] = svg_bytes
    renderer = QSvgRenderer(svg_bytes)
    pix = QPixmap(size, size)
    pix.fill(Qt.GlobalColor.transparent)
    p = QPainter(pix)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    renderer.render(p)
    p.end()
    return pix


# Sidebar icon name → Lucide SVG file name.
_NAV_ICON_MAP = {
    "home": "house",
    "clock": "history",
    "book": "book-open",
    "gear": "settings",
}


def _nav_icon(name: str, color: str = INK_3, size: int = 18) -> QIcon:
    svg_name = _NAV_ICON_MAP.get(name, name)
    return QIcon(_lucide_pixmap(svg_name, size, color))


def _key_chip(text: str) -> str:
    """HTML snippet rendering a key as a thin-bordered keycap (no gray fill)."""
    return (
        f"<span style='border: 1px solid rgba(0,0,0,0.18); "
        f"padding: 1px 7px; border-radius: 5px; "
        f"font-family: \"JetBrains Mono\", \"Consolas\", monospace; "
        f"font-size: 11px; font-weight: 600; color: {INK_2};'>"
        f"{text}</span>"
    )


class _TipBanner(QFrame):
    """Soft gradient banner with rotating usage tips. Pure decoration + nudge."""
    TIPS = [
        ("💡", "按住录音键说话，松开自动出字。任何输入框都能用。"),
        ("🌐", "想翻译？按住录音键的同时再按翻译附加键，立刻翻成你设的语言。"),
        ("🎯", "识别不准？打开「词典」加上专有名词，下次准多了。"),
        ("🎤", "声音小？右上角「设置」→ 麦克风，换一个更近的麦。"),
    ]

    def __init__(self):
        super().__init__()
        self.setFixedHeight(96)
        self.setStyleSheet("background: transparent;")
        self._idx = 0
        self._build_ui()
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._rotate)
        self._timer.start(8000)

    def _build_ui(self):
        h = QHBoxLayout(self)
        h.setContentsMargins(22, 18, 22, 18)
        h.setSpacing(16)
        self.icon_lbl = QLabel(self.TIPS[0][0])
        self.icon_lbl.setStyleSheet(
            f"font-size: 28px; background: rgba(255,255,255,0.6); "
            f"border-radius: 14px; padding: 4px;"
        )
        self.icon_lbl.setFixedSize(48, 48)
        self.icon_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h.addWidget(self.icon_lbl)
        text_col = QVBoxLayout()
        text_col.setSpacing(2)
        self.title_lbl = QLabel("小贴士")
        self.title_lbl.setStyleSheet(
            f"font-size: 11px; color: {INK_3}; font-weight: 600; letter-spacing: 0.6px;"
        )
        text_col.addWidget(self.title_lbl)
        self.tip_lbl = QLabel(self.TIPS[0][1])
        self.tip_lbl.setStyleSheet(
            f"font-size: 14px; color: {INK}; font-weight: 500;"
        )
        self.tip_lbl.setWordWrap(True)
        text_col.addWidget(self.tip_lbl)
        h.addLayout(text_col, 1)

    def _rotate(self):
        self._idx = (self._idx + 1) % len(self.TIPS)
        icon, text = self.TIPS[self._idx]
        self.icon_lbl.setText(icon)
        self.tip_lbl.setText(text)
        self.update()

    def paintEvent(self, ev):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = self.rect().adjusted(0, 0, -1, -1)
        grad = QLinearGradient(0, 0, float(rect.width()), float(rect.height()))
        grad.setColorAt(0.0, QColor("#dbeafe"))
        grad.setColorAt(0.55, QColor("#ede9fe"))
        grad.setColorAt(1.0, QColor("#fce7f3"))
        p.setBrush(QBrush(grad))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawRoundedRect(rect, 16, 16)
        p.end()


# ---------- Pages ----------

class HomePage(QWidget):
    def __init__(self, engine: VoiceEngine):
        super().__init__()
        self.engine = engine
        self.setStyleSheet(f"background: {CANVAS};")

        outer = QVBoxLayout(self)
        outer.setContentsMargins(40, 36, 40, 28)
        outer.setSpacing(22)

        # ---------- Hero ----------
        hero_top = QHBoxLayout()
        hero_top.setContentsMargins(0, 0, 0, 0)
        self.status_pill = _pill("● 就绪", "ok")
        hero_top.addStretch()
        hero_top.addWidget(self.status_pill)
        outer.addLayout(hero_top)

        self.title_lbl = QLabel("说出来，写下来")
        self.title_lbl.setStyleSheet(
            f"font-size: 34px; font-weight: 700; color: {INK}; "
            f"letter-spacing: -0.8px;"
        )
        outer.addWidget(self.title_lbl)

        self.shortcut_label = QLabel(self._shortcut_html())
        self.shortcut_label.setStyleSheet(f"color: {INK_3}; font-size: 14px;")
        self.shortcut_label.setTextFormat(Qt.TextFormat.RichText)
        self.shortcut_label.setWordWrap(True)
        outer.addWidget(self.shortcut_label)

        # ---------- 4 metric cards ----------
        metrics = QHBoxLayout()
        metrics.setSpacing(14)
        self.m_chars_today = MetricCard("今日字数", "0", "字", icon="edit")
        self.m_total_chars = MetricCard("累计字数", "0", "字", icon="mic")
        self.m_total_count = MetricCard("累计次数", "0", "次", icon="sparkle")
        self.m_translate_count = MetricCard("翻译次数", "0", "次", icon="globe", accent=True)
        for w in (self.m_chars_today, self.m_total_chars, self.m_total_count, self.m_translate_count):
            metrics.addWidget(w)
        outer.addLayout(metrics)

        # ---------- Gradient tip banner ----------
        outer.addWidget(_TipBanner())

        outer.addStretch()

        self.refresh()
        self._timer = QTimer(self)
        self._timer.timeout.connect(self.refresh)
        self._timer.start(2000)

    def _shortcut_html(self) -> str:
        p = key_label(self.engine.polish_name)
        t = key_label(self.engine.translate_name)
        return (
            f"按住 {_key_chip(p)} 录音并润色出字 　·　 "
            f"按住 {_key_chip(p)}+{_key_chip(t)} 录音并翻译出字"
        )

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

        self.m_chars_today.set_value(str(chars_today))
        self.m_total_chars.set_value(str(agg["total_chars"]))
        self.m_total_count.set_value(str(agg["recognize_count"]))
        self.m_translate_count.set_value(str(agg.get("translate_count", 0)))

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


class MetricCard(Card):
    """Speakly-style stat card: round soft-blue icon block + big number + label."""
    def __init__(self, label: str, value: str, unit: str, icon: str = "edit", accent: bool = False):
        super().__init__(padding=26)
        self.setMinimumHeight(140)
        h = QHBoxLayout()
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(18)

        icon_box = QLabel()
        icon_box.setFixedSize(52, 52)
        icon_box.setStyleSheet("background: transparent;")
        icon_box.setPixmap(self._draw_icon(icon))
        h.addWidget(icon_box, alignment=Qt.AlignmentFlag.AlignVCenter)

        right = QVBoxLayout()
        right.setSpacing(4)
        value_row = QHBoxLayout()
        value_row.setContentsMargins(0, 0, 0, 0)
        value_row.setSpacing(8)
        self.value_lbl = QLabel(value)
        self.value_lbl.setStyleSheet(
            f"background: transparent; font-size: 36px; font-weight: 700; "
            f"letter-spacing: -0.8px; color: {BLUE if accent else INK};"
        )
        value_row.addWidget(self.value_lbl, alignment=Qt.AlignmentFlag.AlignBottom)
        unit_lbl = QLabel(unit)
        unit_lbl.setStyleSheet(
            f"background: transparent; color: {INK_3}; font-size: 14px; font-weight: 500;"
        )
        value_row.addWidget(unit_lbl, alignment=Qt.AlignmentFlag.AlignBottom)
        value_row.addStretch()
        right.addLayout(value_row)
        label_lbl = QLabel(label)
        label_lbl.setStyleSheet(f"background: transparent; color: {INK_3}; font-size: 13px;")
        right.addWidget(label_lbl)
        h.addLayout(right, 1)
        self.inner().addLayout(h)

    # Metric card icon name → Lucide SVG file name.
    _ICON_MAP = {
        "edit": "pen-line",
        "mic": "mic",
        "sparkle": "sparkles",
        "globe": "globe",
    }

    def _draw_icon(self, name: str) -> QPixmap:
        size = 52
        pix = QPixmap(size, size)
        pix.fill(Qt.GlobalColor.transparent)
        p = QPainter(pix)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        # Soft blue rounded-square background.
        p.setBrush(QColor(BLUE_SOFT))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawRoundedRect(0, 0, size, size, 14, 14)
        # Lucide SVG centered inside the background, sized at ~58% of the block.
        icon_size = 28
        svg = _lucide_pixmap(self._ICON_MAP.get(name, name), icon_size, BLUE)
        offset = (size - icon_size) // 2
        p.drawPixmap(offset, offset, svg)
        p.end()
        return pix

    def set_value(self, value: str):
        self.value_lbl.setText(value)


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
        self.mic_combo.setMinimumWidth(320)
        self._populate_mic_combo()
        _center_combo(self.mic_combo)
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
        self.mode_combo.setMinimumWidth(220)
        self.mode_combo.addItem("按住说话 松开识别", "hold")
        self.mode_combo.addItem("点一下开始 再点一下结束", "toggle")
        self.mode_combo.setCurrentIndex(0 if engine.trigger_mode == "hold" else 1)
        _center_combo(self.mode_combo)
        self.mode_combo.currentIndexChanged.connect(self._on_mode_changed)
        ci.addWidget(self._row("触发方式", self.mode_combo))

        self.lang_combo = QComboBox()
        self.lang_combo.setMinimumWidth(220)
        for label, code in LANG_OPTIONS:
            self.lang_combo.addItem(label, code)
        for i in range(self.lang_combo.count()):
            if self.lang_combo.itemData(i) == engine.translate_target:
                self.lang_combo.setCurrentIndex(i)
                break
        _center_combo(self.lang_combo)
        self.lang_combo.currentIndexChanged.connect(self._on_lang_changed)
        ci.addWidget(self._row("翻译目标语言", self.lang_combo, last=True))

        v.addWidget(card)

        note = QLabel("修改后立即生效。按住录音键 = 润色出字；录音期间同时按住翻译附加键 = 翻译出字。")
        note.setStyleSheet(f"color: {INK_4}; font-size: 12px;")
        note.setWordWrap(True)
        v.addWidget(note)

        v.addStretch()

    def _row(self, label: str, widget: QWidget, last: bool = False) -> QWidget:
        wrap = QWidget()
        wv = QVBoxLayout(wrap)
        wv.setContentsMargins(0, 0, 0, 0)
        wv.setSpacing(0)

        row = QWidget()
        h = QHBoxLayout(row)
        h.setContentsMargins(20, 13, 20, 13)
        lbl = QLabel(label)
        lbl.setStyleSheet(f"background: transparent; font-size: 13px; color: {INK};")
        h.addWidget(lbl)
        h.addStretch()
        h.addWidget(widget)
        wv.addWidget(row)

        if not last:
            sep = QFrame()
            sep.setFixedHeight(1)
            sep.setStyleSheet(
                f"background: rgba(0, 0, 0, 0.07); margin-left: 20px; margin-right: 20px;"
            )
            wv.addWidget(sep)
        return wrap

    def _make_key_combo(self, current: str) -> QComboBox:
        c = QComboBox()
        c.setMinimumWidth(220)
        for label, code in KEY_OPTIONS:
            c.addItem(label, code)
        for i in range(c.count()):
            if c.itemData(i) == current:
                c.setCurrentIndex(i)
                break
        _center_combo(c)
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
        # Re-apply center alignment to all popup items (cleared above).
        for i in range(self.mic_combo.count()):
            self.mic_combo.setItemData(i, Qt.AlignmentFlag.AlignCenter, Qt.ItemDataRole.TextAlignmentRole)
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
        self.list.setIconSize(QSize(18, 18))
        self.list.setStyleSheet(
            "QListWidget { background: transparent; border: none; padding: 0 10px; outline: none; }"
            f"QListWidget::item {{ color: {INK_2}; padding: 10px 14px; "
            "border-radius: 8px; margin-bottom: 3px; font-size: 13px; font-weight: 500; }"
            f"QListWidget::item:hover {{ background: {SURFACE_2}; }}"
            f"QListWidget::item:selected {{ background: {BLUE_SOFT}; "
            f"color: {BLUE}; font-weight: 600; }}"
        )
        nav_items = [
            ("概览", "home"),
            ("历史记录", "clock"),
            ("词典", "book"),
            ("设置", "gear"),
        ]
        self._nav_keys = [k for _, k in nav_items]
        for name_text, icon in nav_items:
            item = QListWidgetItem(_nav_icon(icon, INK_3), name_text)
            self.list.addItem(item)
        self.list.setCurrentRow(0)
        self.list.currentRowChanged.connect(self._refresh_icons)
        self._refresh_icons(0)
        v.addWidget(self.list, 1)

    def _refresh_icons(self, current: int):
        for i, key in enumerate(self._nav_keys):
            color = BLUE if i == current else INK_3
            self.list.item(i).setIcon(_nav_icon(key, color))


class _StatusBar(QFrame):
    """Hairline status bar at the bottom of the main window."""
    def __init__(self):
        super().__init__()
        self.setFixedHeight(34)
        self.setStyleSheet(
            f"background: {WHITE}; border-top: 1px solid {LINE};"
        )
        h = QHBoxLayout(self)
        h.setContentsMargins(20, 0, 20, 0)
        h.setSpacing(14)
        version = QLabel(f"{BRAND_NAME} v0.6")
        version.setStyleSheet(f"font-size: 11px; color: {INK_3}; font-weight: 500;")
        h.addWidget(version)
        sep = QLabel("·")
        sep.setStyleSheet(f"font-size: 11px; color: {INK_5};")
        h.addWidget(sep)
        engine_l = QLabel("本地引擎 · 100% 离线")
        engine_l.setStyleSheet(f"font-size: 11px; color: {INK_3};")
        h.addWidget(engine_l)
        h.addStretch()
        self.right_lbl = QLabel("● 就绪")
        self.right_lbl.setStyleSheet(f"font-size: 11px; color: {OK}; font-weight: 500;")
        h.addWidget(self.right_lbl)


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
        root = QVBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        body = QWidget()
        h = QHBoxLayout(body)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(0)

        self.sidebar = Sidebar()
        h.addWidget(self.sidebar)

        self.pages = QStackedWidget()
        self.history_page = HistoryPage()
        self.home_page = HomePage(engine)
        self.dictionary_page = _PlaceholderPage(
            "词典",
            "自定义术语和专有名词,VoCo 会用它们提高识别准确度。",
        )
        self.settings_page = SettingsPage(engine, bridge, on_change=self.home_page.refresh_shortcuts)
        for w in (self.home_page, self.history_page, self.dictionary_page, self.settings_page):
            self.pages.addWidget(w)
        h.addWidget(self.pages, 1)

        root.addWidget(body, 1)
        root.addWidget(_StatusBar())

        self.sidebar.list.currentRowChanged.connect(self.pages.setCurrentIndex)

        bridge.state_changed.connect(self.home_page.set_status)
        bridge.result_ready.connect(self.home_page.show_result)
        bridge.error_occurred.connect(self._show_error)

        # Floating HUD that floats at the bottom of the screen during recording.
        # Created here (after MainWindow has a thread context) and driven by the
        # same engine signals as the home-page status text.
        from hud_widget import VoiceHUD
        self.hud = VoiceHUD()
        bridge.state_changed.connect(self._on_hud_state)
        bridge.audio_level.connect(self.hud.set_audio_level)

    def _on_hud_state(self, state: str):
        if state == "recording":
            self.hud.show_listening()
        elif state == "processing":
            self.hud.show_processing()
        else:  # 'idle' or anything else → fade out
            self.hud.hide_smooth()

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

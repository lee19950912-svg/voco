"""System tray icon with right-click menu.

Visual feedback: icon color flips white -> red while recording.
Menu lets the user pick translate target language and quit without
hunting for the console window.
"""
from typing import Callable, List, Optional
import pystray
from PIL import Image, ImageDraw

_icon: Optional[pystray.Icon] = None
_translate_target: str = "ko"
_paused: bool = False
_on_quit_cb: Optional[Callable[[], None]] = None

LANG_LABEL = {
    "ko": "韩语",
    "en": "英语",
    "ja": "日语",
    "zh": "中文",
    "yue": "粤语",
    "ru": "俄语",
    "fr": "法语",
    "de": "德语",
    "es": "西班牙语",
}


def _make_image(color: str) -> Image.Image:
    """Draw a 64x64 microphone-ish circle. Simple, works on light/dark taskbars."""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((8, 8, 56, 56), fill=color, outline="black", width=2)
    d.rectangle((28, 22, 36, 42), fill="black")
    d.rectangle((22, 44, 42, 48), fill="black")
    return img


def _build_menu() -> pystray.Menu:
    def _make_lang_setter(lang_code: str):
        def _setter(icon, item):
            global _translate_target
            _translate_target = lang_code
        return _setter

    def _make_lang_check(lang_code: str):
        return lambda item: _translate_target == lang_code

    lang_items = [
        pystray.MenuItem(
            LANG_LABEL.get(code, code),
            _make_lang_setter(code),
            checked=_make_lang_check(code),
            radio=True,
        )
        for code in ("ko", "en", "ja", "zh")
    ]

    def _toggle_pause(icon, item):
        global _paused
        _paused = not _paused

    def _quit(icon, item):
        icon.stop()
        if _on_quit_cb:
            _on_quit_cb()

    return pystray.Menu(
        pystray.MenuItem("翻译目标", pystray.Menu(*lang_items)),
        pystray.MenuItem(
            "暂停语音输入",
            _toggle_pause,
            checked=lambda item: _paused,
        ),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出", _quit),
    )


def start(initial_target: str = "ko", on_quit: Optional[Callable[[], None]] = None) -> None:
    """Spin up the tray in a background thread. Returns immediately."""
    global _icon, _translate_target, _on_quit_cb
    _translate_target = initial_target
    _on_quit_cb = on_quit
    _icon = pystray.Icon(
        "voice_input",
        _make_image("white"),
        "语音输入法",
        menu=_build_menu(),
    )
    _icon.run_detached()


def set_recording(active: bool) -> None:
    """Flip the tray icon color to signal recording state. Safe to call from any thread."""
    if _icon is None:
        return
    _icon.icon = _make_image("red" if active else "white")


def get_translate_target() -> str:
    return _translate_target


def is_paused() -> bool:
    return _paused

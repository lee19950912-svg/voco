"""Application entry point.

Boots the Qt app, the VoiceEngine, and wires them together via EngineBridge.
The main window starts hidden — the user can open it from the system tray.
"""
import sys

from PyQt6.QtWidgets import QApplication

from main_window import EngineBridge, MainWindow, TrayController
from setup_wizard import SetupWizard
from voice_engine import VoiceEngine


def main() -> int:
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)  # Keep running when window is closed; tray controls quit.

    # Set a sensible global font so PingFang/Inter/YaHei pick automatically.
    from PyQt6.QtGui import QFont
    font = QFont()
    font.setFamilies(["Inter", "Segoe UI", "Microsoft YaHei", "PingFang SC", "sans-serif"])
    font.setPointSize(10)
    app.setFont(font)

    engine = VoiceEngine()

    # First-run setup: pick mic + verify hotkeys before booting the engine.
    if not engine.config.get("first_run_completed", False):
        wizard = SetupWizard(engine)
        wizard.exec()

    bridge = EngineBridge()

    # Engine callbacks (potentially on background threads) -> Qt signals (main thread).
    engine.on_state_change = bridge.state_changed.emit
    engine.on_result = bridge.result_ready.emit
    engine.on_error = bridge.error_occurred.emit
    engine.on_audio_level = bridge.audio_level.emit

    window = MainWindow(engine, bridge)
    tray = TrayController(window, engine, app)

    # Tray icon color reflects recording state.
    bridge.state_changed.connect(lambda s: tray.set_recording_icon(s == "recording"))

    engine.start()

    # Show window on first launch so the user sees the new GUI.
    window.show()

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())

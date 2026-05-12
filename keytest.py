"""Print the name of any key pressed. Press ESC to exit."""
import sys
from pynput import keyboard


def log(msg: str):
    print(msg, flush=True)
    sys.stdout.flush()


def on_press(key):
    try:
        log(f"按下: {key}")
    except AttributeError:
        log(f"按下未知键: {key}")


def on_release(key):
    if key == keyboard.Key.esc:
        log("退出。")
        return False


log("按任意键看名字。按 ESC 退出。")
log("（如果按键没反应，按 Ctrl+C 退出，告诉我现象）")

with keyboard.Listener(on_press=on_press, on_release=on_release) as listener:
    listener.join()

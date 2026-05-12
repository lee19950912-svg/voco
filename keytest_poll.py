"""Polling-based right Alt detection. Bypasses keyboard hook plugins.

Press right Alt and watch the state change. Press Ctrl+C to exit.
"""
import ctypes
import time

VK_RMENU = 0xA5
VK_LMENU = 0xA4
VK_RCONTROL = 0xA3
VK_CAPITAL = 0x14

user32 = ctypes.windll.user32


def is_pressed(vk_code: int) -> bool:
    return bool(user32.GetAsyncKeyState(vk_code) & 0x8000)


print("开始轮询。试着按下并松开 右Alt / 左Alt / 右Ctrl / CapsLock。按 Ctrl+C 退出。", flush=True)

prev = {"右Alt": False, "左Alt": False, "右Ctrl": False, "CapsLock": False}
mapping = {
    "右Alt": VK_RMENU,
    "左Alt": VK_LMENU,
    "右Ctrl": VK_RCONTROL,
    "CapsLock": VK_CAPITAL,
}

try:
    while True:
        for name, vk in mapping.items():
            now = is_pressed(vk)
            if now != prev[name]:
                print(f"{name}: {'按下' if now else '松开'}", flush=True)
                prev[name] = now
        time.sleep(0.02)
except KeyboardInterrupt:
    print("\n退出。")

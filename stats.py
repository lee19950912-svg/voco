"""Persistent usage stats: aggregate counters + per-session history.

Two files:
- stats.json:   running totals (chars, durations, mode counts)
- history.json: rolling list of recent sessions (capped at 1000)

Loaded on startup, saved on each recognition. Thread-safe.
"""
import json
import threading
import time
import uuid
from pathlib import Path

STATS_PATH = Path("stats.json")
HISTORY_PATH = Path("history.json")
HISTORY_CAP = 1000

_lock = threading.Lock()

_default_stats = {
    "total_seconds": 0.0,
    "total_chars": 0,
    "polish_count": 0,
    "translate_count": 0,
    "recognize_count": 0,
}


def _load(path: Path, default):
    if not path.exists():
        return default() if callable(default) else dict(default)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default() if callable(default) else dict(default)


def load_stats() -> dict:
    data = _load(STATS_PATH, _default_stats)
    for k, v in _default_stats.items():
        data.setdefault(k, v)
    return data


def load_history() -> list:
    data = _load(HISTORY_PATH, list)
    if not isinstance(data, list):
        return []
    return data


_data = load_stats()
_history = load_history()


def _save_stats():
    try:
        with open(STATS_PATH, "w", encoding="utf-8") as f:
            json.dump(_data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _save_history():
    try:
        with open(HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(_history, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def record_session(mode: str, raw: str, final: str, target_lang: str, duration_seconds: float) -> None:
    """Persist one recognition session and bump the aggregate counters."""
    with _lock:
        _data["total_seconds"] += max(0.0, duration_seconds)
        _data["total_chars"] += len(final or "")
        _data["recognize_count"] += 1
        if mode == "polish":
            _data["polish_count"] += 1
        elif mode == "translate":
            _data["translate_count"] += 1
        entry = {
            "id": uuid.uuid4().hex[:12],
            "mode": mode,
            "raw": raw or "",
            "final": final or "",
            "target_lang": target_lang if mode == "translate" else "",
            "duration_ms": int(max(0.0, duration_seconds) * 1000),
            "created_at": time.time(),
        }
        _history.insert(0, entry)
        if len(_history) > HISTORY_CAP:
            del _history[HISTORY_CAP:]
        _save_stats()
        _save_history()


def snapshot() -> dict:
    with _lock:
        return dict(_data)


def history_snapshot() -> list:
    with _lock:
        return list(_history)


def daily_counts(days: int = 7) -> list:
    """Return [count for day_n, ..., count for today], length = days."""
    buckets = [0] * days
    now = time.time()
    today_midnight = time.mktime(time.localtime(now)[:3] + (0, 0, 0, 0, 0, -1))
    with _lock:
        for entry in _history:
            diff = int((today_midnight - time.mktime(time.localtime(entry["created_at"])[:3] + (0, 0, 0, 0, 0, -1))) // 86400)
            if 0 <= diff < days:
                buckets[days - 1 - diff] += 1
    return buckets

# VoCo — desktop app (`voco-tauri`)

The VoCo Windows desktop app: hold a hotkey, speak, and your words are
transcribed and polished / translated by AI, then typed at the cursor.
Built with Tauri 2 (Rust) + React + Tailwind.

## Run

```bash
pnpm install
pnpm tauri dev
```

On first launch (or later in Settings → AI service), fill in an
OpenAI-compatible endpoint and API key — see the repo root
[README](../README.md) for the full setup and key configuration.

## Stack

| Path | What's in it |
|------|--------------|
| `src-tauri/` | Rust backend — audio capture, ASR, AI polish/translate, global hotkey, paste-to-cursor |
| `src/` | React + Tailwind frontend — main window, HUD overlay, setup wizard |

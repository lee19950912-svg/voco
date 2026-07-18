# VoCo · Voice Input Method

Hold a hotkey and speak — your voice is transcribed in real time, polished / translated by AI, and typed straight into any input field.
A Windows desktop app built with Tauri + React + Rust.

## Features

- 🎙️ **Real-time speech recognition** — powered by Volcano Engine short-audio recognition, accurate for Chinese
- ✨ **AI polishing** — turns casual speech into clean, well-formed writing
- 🌐 **Instant translation** — speak Chinese, get English / Korean out
- 📝 **Auto-formatting & code-aware output** — formats the text to match the context you're in
- ⌨️ **Works everywhere** — WeChat, Slack, Lark, Cursor… anywhere you can type
- 🔒 **Privacy first** — API keys and history stay on your machine

## Repository structure

| Directory | Description |
|-----------|-------------|
| `voco-tauri/` | **Current desktop app** (Tauri + React + Rust) — active development |
| `voco-landing/` | Product landing page (React + Vite) |
| Root `*.py` | Early PyQt prototype, archived and no longer maintained |

## Quick start (desktop app)

```bash
cd voco-tauri
cp .env.example .env      # then fill in your own API keys (see below)
pnpm install
pnpm tauri dev
```

You'll need [Rust](https://www.rust-lang.org/), [Node.js](https://nodejs.org/) and pnpm installed first.

## Configuring keys

This repository contains **no secrets**. Before running, register and fill in `voco-tauri/.env` yourself (template at `voco-tauri/.env.example`):

- Volcano Engine (speech recognition): https://www.volcengine.com/
- DeepSeek (AI polishing): https://platform.deepseek.com/

## License

[MIT](LICENSE) © 2026 Qing

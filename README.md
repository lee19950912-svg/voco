# VoCo · Voice Input Method

Hold a hotkey and speak — your voice is transcribed in real time, polished / translated by AI, and typed straight into any input field.
A Windows desktop app built with Tauri + React + Rust.

## Features

- 🎙️ **Real-time speech recognition** — via any OpenAI-compatible transcription endpoint
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

## Quick start (desktop app)

```bash
cd voco-tauri
cp .env.example .env      # then fill in your own API keys (see below)
pnpm install
pnpm tauri dev
```

You'll need [Rust](https://www.rust-lang.org/), [Node.js](https://nodejs.org/) and pnpm installed first.

## Configuring keys

This repository contains **no secrets** — VoCo is bring-your-own-key. On first launch (or later in Settings → AI service), paste an **OpenAI-compatible** endpoint and API key. Anything OpenAI-compatible works: OpenAI directly, a domestic relay, or a local model server.

- Chat (polish + translate) and speech-to-text share one endpoint by default; speech-to-text can be split onto a separate endpoint when needed.
- Keys are stored locally and never uploaded. A `.env` with `OPENAI_API_KEY` is also honored as a fallback (see `voco-tauri/.env.example`).

## License

[MIT](LICENSE) © 2026 Qing

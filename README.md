# VoCo · 语音输入法

按住热键说话，实时转成文字并用 AI 顺手润色 / 翻译，直接输出到任何输入框。
Windows 桌面应用，基于 Tauri + React + Rust。

## 功能

- 🎙️ **实时语音识别** —— 火山引擎「一句话识别」，中文识别准
- ✨ **AI 润色** —— 把口语自动整理成通顺的书面语
- 🌐 **即时翻译** —— 说中文，直接出英文 / 韩文
- 📝 **自动分点、代码场景优化** —— 说什么场景就整理成什么格式
- ⌨️ **随处可用** —— 微信、Slack、飞书、Cursor……任何能打字的地方
- 🔒 **隐私优先** —— API 密钥和历史记录都存在本地

## 目录结构

| 目录 | 说明 |
|------|------|
| `voco-tauri/` | **当前桌面端**（Tauri + React + Rust）—— 活跃开发 |
| `voco-landing/` | 产品落地页（React + Vite） |
| 根目录 `*.py` | 早期 PyQt 原型，已归档、停止维护 |

## 快速开始（桌面端）

```bash
cd voco-tauri
cp .env.example .env      # 然后填入自己的 API Key（见下）
pnpm install
pnpm tauri dev
```

需要先装好 [Rust](https://www.rust-lang.org/)、[Node.js](https://nodejs.org/) 和 pnpm。

## 配置密钥

本仓库**不含任何密钥**，运行前需自行注册并填入 `voco-tauri/.env`（模板见 `voco-tauri/.env.example`）：

- 火山引擎（语音识别）：https://www.volcengine.com/
- DeepSeek（AI 润色）：https://platform.deepseek.com/

## License

[MIT](LICENSE) © 2026 Qing

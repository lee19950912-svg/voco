# VoCo 发版流程

第一次发版前一次性设置好托管（约 10 分钟），之后每个新版本只要 3 步、5 分钟。

---

## 一次性设置（只做一次）

### 选托管

| 选项 | 价格 | 国内速度 | 推荐度 |
|---|---|---|---|
| **GitHub Releases**（默认）| 免费 | 一般（github.com 国内可达但慢）| ⭐⭐⭐ 起步首选 |
| **腾讯云 COS** | 几块钱/月起 | 快 | 用户量起来后再换 |
| **Azure Blob** | 几块钱/月起 | 国内不稳 | 不推荐 |

### 用 GitHub Releases 的步骤

1. 在 GitHub 上建一个 repo（公开/私有都行，公开更方便）
2. 把项目 push 上去（`git remote add origin ... && git push -u origin master`）
3. 编辑 **`src-tauri/tauri.conf.json`**：把 `endpoints` 里的 URL 中的 `REPLACE_ME` 改成 `你的GitHub用户名/仓库名`
   - 例如：`https://github.com/qing/voco/releases/latest/download/latest.json`
4. 编辑 **`scripts/publish-release.ps1`**：把 `downloadUrl` 里的 `REPLACE_ME` 同步改掉
5. 提交这两处改动

### 用腾讯云 COS 的步骤（后期升级）

1. 注册腾讯云 → 开通 COS → 建 bucket（华东/华南/华北自选）
2. 把 endpoints URL 改成 `https://<bucket>.cos.<region>.myqcloud.com/voco/latest.json`
3. 把 publish-release.ps1 里的 downloadUrl 也改
4. 上传脚本可用 `coscmd` CLI

---

## 每次发版（3 步）

### 1. 改版本号

编辑 **3 个文件**，版本号要保持一致：

| 文件 | 字段 |
|---|---|
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `version` |
| `package.json` | `version` |

### 2. 打包

```powershell
pnpm tauri build
```

约 3-5 分钟。产物会在 `src-tauri/target/release/bundle/nsis/` 下，包括：
- `VoCo_<版本>_x64-setup.exe`（安装包）
- `VoCo_<版本>_x64-setup.exe.sig`（签名）

### 3. 组装发布

```powershell
.\scripts\publish-release.ps1
```

会产出 `release/v<版本>/` 目录，里面有：
- 安装包 exe
- 签名 sig
- `latest.json`（更新元数据）

按终端打印的清单，把这 3 个文件上传到 GitHub Releases（或你选的托管）。

---

## 私钥安全

- 私钥位置：**`C:\Users\LEE\.tauri\voco-signer.key`**
- **绝对不要进 git**（已在 .gitignore 之外，因为根本不在仓库内）
- **绝对不要丢**：丢了之后所有现有用户都收不到更新（因为新版本的签名验证失败）
- **备份建议**：复制到加密 U 盘 / 1Password 等密码管理器
- 当前密钥**没设密码**（生成时用了 `-p ""`），所以拿到私钥文件 = 能签名。如果以后想加密，跑：
  ```
  pnpm tauri signer generate -p "你的强密码" -w "..." -f
  ```
  生成新密钥对，**但所有用户必须重装一次** 才能收到后续更新（因为公钥变了）

---

## 测试更新流程（推荐每次发版前做一次）

1. 装当前版本：双击 `release/vX.Y.Z/VoCo_*_setup.exe`
2. 在系统托盘看到 VoCo 在跑
3. 改版本号到 X.Y.(Z+1)，再打包 + 跑 publish-release
4. 上传 v(Z+1) 到托管
5. 在装着 vX.Y.Z 的电脑上，VoCo 设置页 → "检查更新"
6. 应该看到 "v(Z+1) 可用 → 下载中 → 安装" 流程
7. 装好后版本号应该变成 X.Y.(Z+1)

如果第 1 次失败，最常见原因：
- `tauri.conf.json` 的 `endpoints` URL 不对
- `latest.json` 没传到那个 URL 能访问到的位置
- `latest.json` 里的 `url` 不对
- 公钥不匹配（一般不会发生，除非你重新生成过密钥又忘了同步 conf）

---

## 想自动化（CI）

GitHub Actions 模板（未来再做）：
- 监听 git tag `v*` 推送
- 跑 `pnpm tauri build`（需要 Windows runner）
- 签名时把私钥从 GitHub Secrets 里读出来（`TAURI_SIGNING_PRIVATE_KEY` env var）
- 自动 `gh release create` + 上传 assets

第一版手工发够用了，先不弄。

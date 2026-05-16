# publish-release.ps1
#
# 把一次成功的 `pnpm tauri build` 的产物组装成一份"可发布的更新包"。
# 不上传——只产出 release/ 目录，里面是你接下来要 push 到 GitHub Releases
# （或腾讯云 COS 等任何托管）的所有文件 + 一份现成的 latest.json。
#
# 用法（PowerShell，在项目 voco-tauri 目录下）：
#   pnpm tauri build       # 先打包
#   .\scripts\publish-release.ps1
#
# 然后照终端打印的「上传清单」把文件传到托管。
#
# 不动 git、不动远程，只读 build 产物 + 写 release/ 文件夹。

$ErrorActionPreference = "Stop"

# --- 定位项目根 ---------------------------------------------------------
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$tauriConf = Join-Path $projectRoot "src-tauri\tauri.conf.json"
if (-not (Test-Path $tauriConf)) {
    Write-Error "找不到 tauri.conf.json，确定在 voco-tauri 目录下运行了吗？"
    exit 1
}

# --- 读版本号 -----------------------------------------------------------
$conf = Get-Content $tauriConf -Raw | ConvertFrom-Json
$version = $conf.version
if (-not $version) {
    Write-Error "tauri.conf.json 里没读到 version 字段"
    exit 1
}
Write-Host "▶ 当前版本: v$version" -ForegroundColor Cyan

# --- 找打包产物 ---------------------------------------------------------
$bundleDir = Join-Path $projectRoot "src-tauri\target\release\bundle\nsis"
if (-not (Test-Path $bundleDir)) {
    Write-Error "找不到打包产物：$bundleDir。先跑 pnpm tauri build。"
    exit 1
}

# Tauri NSIS updater 产物（启用 createUpdaterArtifacts 后才生成）：
#   VoCo_<version>_x64-setup.exe          ← 真正的安装包
#   VoCo_<version>_x64-setup.exe.sig      ← 签名（updater 用来验真伪）
$setupExe = Get-ChildItem $bundleDir -Filter "VoCo_${version}_x64-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$setupSig = Get-ChildItem $bundleDir -Filter "VoCo_${version}_x64-setup.exe.sig" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $setupExe) {
    Write-Error "找不到安装包 VoCo_${version}_x64-setup.exe。"
    exit 1
}
if (-not $setupSig) {
    Write-Error "找不到签名 .sig 文件，确认 tauri.conf.json 里 createUpdaterArtifacts: true。"
    exit 1
}

$signature = (Get-Content $setupSig.FullName -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# --- 生成 latest.json ---------------------------------------------------
# 占位 URL — 后面贴托管真链接到这里。
# 默认假设托管在 GitHub Releases；想换腾讯云 COS / Azure 直接改这个 URL。
$downloadUrl = "https://github.com/REPLACE_ME/voco/releases/download/v$version/VoCo_${version}_x64-setup.exe"

$latest = @{
    version    = "v$version"
    notes      = "VoCo v$version"
    pub_date   = $pubDate
    platforms  = @{
        "windows-x86_64" = @{
            signature = $signature
            url       = $downloadUrl
        }
    }
}

# --- 准备 release/ 目录 -------------------------------------------------
$releaseDir = Join-Path $projectRoot "release\v$version"
if (Test-Path $releaseDir) {
    Remove-Item $releaseDir -Recurse -Force
}
New-Item -ItemType Directory $releaseDir -Force | Out-Null

# 复制安装包 + 签名 + latest.json
Copy-Item $setupExe.FullName (Join-Path $releaseDir $setupExe.Name)
Copy-Item $setupSig.FullName (Join-Path $releaseDir $setupSig.Name)
# Write latest.json as UTF-8 WITHOUT BOM. PowerShell 5.1's `Out-File -Encoding
# utf8` adds a BOM, which trips serde_json on the Tauri updater side
# ("trailing characters at position 0"). Use .NET API directly with
# UTF8Encoding(false) to guarantee no BOM across PS 5.1 / 7+.
$jsonText = $latest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText(
    (Join-Path $releaseDir "latest.json"),
    $jsonText,
    [System.Text.UTF8Encoding]::new($false)
)

# --- 报告 ---------------------------------------------------------------
Write-Host ""
Write-Host "▶ 打包完成：$releaseDir" -ForegroundColor Green
Write-Host ""
Write-Host "上传清单："
Get-ChildItem $releaseDir | ForEach-Object {
    $size = "{0:N1} MB" -f ($_.Length / 1MB)
    Write-Host ("  · " + $_.Name + "  ($size)")
}

Write-Host ""
Write-Host "下一步（手工）：" -ForegroundColor Yellow
Write-Host "  1. 去 GitHub Releases 新建一个 tag = v$version 的 release"
Write-Host "  2. 把 release\v$version\ 里的 3 个文件都拖上去当 assets"
Write-Host "  3. 第一次发布前，编辑 latest.json，把 url 里的 REPLACE_ME 换成你的 GitHub user/repo"
Write-Host "  4. 同步更新 src-tauri\tauri.conf.json 的 endpoints URL（也要把 REPLACE_ME 换掉）"
Write-Host ""
Write-Host "之后每次发版只跑这个脚本就行，文件名 / 签名都自动生成。"

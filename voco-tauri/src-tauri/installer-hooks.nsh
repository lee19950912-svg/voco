; VoCo NSIS installer hooks — handle the "still running" case gracefully
; on update. VoCo lives in the tray as a permanent daemon, so users almost
; never close it manually. Without this, a hot upgrade would fail with the
; classic "file is being used by another process" error.
;
; Pattern copied from Typeless (resources/build/installer.nsh) and adapted
; to Tauri v2's NSIS hook macros. We poll via PowerShell because Get-Process
; works consistently across Chinese and English Windows locales — `tasklist`
; output format varies.
;
; Total budget: 20 seconds (40 checks × 500 ms). After that we proceed
; anyway — the file overwrite may still succeed because taskkill /F was
; aggressive, and at worst the user reruns the installer.

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "VoCo: 检查是否在运行..."

  ; Hard kill first. /F = force, /T = include child processes. Suppresses
  ; the error if not running.
  nsExec::ExecToStack '"taskkill" /F /T /IM "VoCo.exe"'
  Pop $1
  Pop $0

  ; Poll up to 40 × 500ms = 20s for process to fully exit.
  ; $R0 = attempt counter, $R2 = seconds elapsed (rough)
  StrCpy $R0 0

  CheckVocoProcess:
    nsExec::ExecToStack 'powershell -NoProfile -Command "Get-Process -Name VoCo -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"'
    Pop $1
    Pop $0

    ; Empty output = process gone. Numeric PID = still running.
    StrCmp $0 "" VocoExited

    IntOp $R0 $R0 + 1
    IntOp $R2 $R0 / 2
    DetailPrint "VoCo: 等待退出（$R2 秒，最多 20 秒）..."

    ; Give up after 40 attempts (20s) and just proceed.
    IntCmp $R0 40 GiveUpWaiting

    Sleep 500
    Goto CheckVocoProcess

  GiveUpWaiting:
    DetailPrint "VoCo: 超时未退出，继续安装（可能会要求重启）"
    Goto DonePreinstall

  VocoExited:
    DetailPrint "VoCo: 已退出，继续安装"
    ; Brief grace period so the OS releases file handles before we overwrite.
    Sleep 200

  DonePreinstall:
!macroend

; Uninstaller — also try to stop VoCo so we can delete its files. Same
; pattern but no need to wait for graceful exit (user explicitly chose to
; uninstall, force kill is fine).
!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToStack '"taskkill" /F /T /IM "VoCo.exe"'
  Pop $1
  Pop $0
  Sleep 1000
!macroend

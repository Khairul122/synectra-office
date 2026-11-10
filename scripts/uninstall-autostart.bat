@echo off
setlocal
set "TARGET_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%TARGET_DIR%\SynectraOffice.lnk"

if exist "%SHORTCUT_PATH%" (
  del /f /q "%SHORTCUT_PATH%"
  echo [Synectra Office] Autostart berhasil dihapus.
) else (
  echo [Synectra Office] Shortcut autostart tidak ditemukan di folder Startup.
)
endlocal

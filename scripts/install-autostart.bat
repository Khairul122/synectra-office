@echo off
setlocal
cd /d "%~dp0"

set "TARGET_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%TARGET_DIR%\SynectraOffice.lnk"
set "VBS_PATH=%~dp0start-dev-hidden.vbs"

echo [Synectra Office] Mendaftarkan autostart pada: %SHORTCUT_PATH%

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%VBS_PATH%'; $s.WorkingDirectory = '%~dp0..'; $s.WindowStyle = 7; $s.Save()"

if exist "%SHORTCUT_PATH%" (
  echo [Synectra Office] Autostart berhasil dipasang.
) else (
  echo [Synectra Office] Gagal memasang shortcut autostart.
)
endlocal

@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start.ps1"
if errorlevel 1 (
  echo.
  echo Spider failed to start. See the message above.
  pause
  exit /b 1
)
endlocal

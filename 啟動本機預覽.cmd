@echo off
setlocal
cd /d "%~dp0"
set "PREVIEW_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PREVIEW_PYTHON%" (
  echo Local Python runtime not found. Please ask the developer to configure the preview runtime.
  pause
  exit /b 1
)
"%PREVIEW_PYTHON%" "scripts\start_local_preview.py"
if errorlevel 1 pause
endlocal

@echo off
setlocal

set SCRIPT_DIR=%~dp0
set PS_SCRIPT=%SCRIPT_DIR%diagnose-windows-installer.ps1
set OUTPUT_DIR=%SCRIPT_DIR%videogenerate-installer-diagnose

if not exist "%PS_SCRIPT%" (
  echo Missing script: "%PS_SCRIPT%"
  echo.
  pause
  exit /b 1
)

echo Running VideoGenerate installer diagnostic...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -OutputDir "%OUTPUT_DIR%"
set EXIT_CODE=%ERRORLEVEL%

echo.
if "%EXIT_CODE%"=="0" (
  echo Diagnostic finished successfully.
) else (
  echo Diagnostic failed with exit code %EXIT_CODE%.
)
echo.
pause
exit /b %EXIT_CODE%

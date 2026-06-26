@echo off
setlocal

set SCRIPT_DIR=%~dp0
set PS_SCRIPT=%SCRIPT_DIR%cleanup-videogenerate-install.ps1

if not exist "%PS_SCRIPT%" (
  echo Missing script: "%PS_SCRIPT%"
  echo.
  pause
  exit /b 1
)

echo Running VideoGenerate cleanup...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
set EXIT_CODE=%ERRORLEVEL%

echo.
if "%EXIT_CODE%"=="0" (
  echo Cleanup finished successfully.
) else (
  echo Cleanup failed with exit code %EXIT_CODE%.
)
echo.
pause
exit /b %EXIT_CODE%

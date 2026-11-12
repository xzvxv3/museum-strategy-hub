@echo off
setlocal
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js LTS and reopen this file.
  pause
  exit /b 1
)
if exist backend\.venv\Scripts\python.exe goto packages
where py >nul 2>nul
if errorlevel 1 (
  python -m venv backend\.venv
) else (
  py -3 -m venv backend\.venv
)
if errorlevel 1 goto failed
:packages
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if errorlevel 1 goto failed
call npm.cmd --prefix frontend ci
if errorlevel 1 goto failed
echo Setup complete. Run 02_start_windows.bat next.
pause
exit /b 0
:failed
echo Setup failed. Check the error above.
pause
exit /b 1

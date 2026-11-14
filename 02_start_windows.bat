@echo off
setlocal
cd /d "%~dp0"
if not exist backend\.venv\Scripts\python.exe goto setup
if not exist frontend\node_modules goto setup
start "Museum Flow Backend" cmd /k call "%~dp0run_backend_windows.cmd"
start "Museum Flow Frontend" cmd /k call "%~dp0run_frontend_windows.cmd"
echo Open http://127.0.0.1:5173 after both servers are ready.
echo Stop both servers with Ctrl+C before starting again.
pause
exit /b 0
:setup
echo Run 01_setup_windows.bat first.
pause
exit /b 1

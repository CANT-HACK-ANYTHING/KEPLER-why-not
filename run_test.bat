@echo off
REM RelayEV Escrow Test Runner for Windows CMD
echo Starting RelayEV FastAPI Backend in background...
start /B "" "backend\venv\Scripts\python.exe" -m uvicorn main:app --port 8000 --app-dir backend
timeout /t 3 /nobreak >nul

echo Running test_escrow.py...
backend\venv\Scripts\python.exe test_escrow.py

echo Stopping background server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
pause

# RelayEV One-Click Escrow Test Runner
# This script launches the FastAPI server, executes test_escrow.py, and cleanly stops the server.

Write-Host "Starting RelayEV FastAPI Escrow Backend..." -ForegroundColor Cyan
$server = Start-Process -FilePath ".\backend\venv\Scripts\python.exe" -ArgumentList "-m uvicorn main:app --port 8000" -WorkingDirectory ".\backend" -PassThru
Start-Sleep -Seconds 2

try {
    & ".\backend\venv\Scripts\python.exe" ".\test_escrow.py"
} finally {
    Write-Host "Cleaning up server process..." -ForegroundColor Yellow
    Stop-Process -Id $server.Id -Force
}


$ErrorActionPreference = "Stop"
Write-Host "ABHEDYA-CHAKRA local setup" -ForegroundColor Cyan

if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw "Python launcher 'py' was not found." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js was not found. Install Node.js 20+ first." }

py -3.11 -m venv backend/.venv
& ".\backend\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\backend\.venv\Scripts\python.exe" -m pip install -r backend/requirements.txt

Push-Location frontend
npm install
Pop-Location

Write-Host "Setup complete." -ForegroundColor Green
Write-Host "1) Put the official CSV in data/raw/"
Write-Host "2) Run: .\backend\.venv\Scripts\python.exe scripts\ingest.py --csv data\raw\transactions.csv"
Write-Host "3) Run backend: .\backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000"
Write-Host "4) Run frontend in another terminal: cd frontend; npm run dev"

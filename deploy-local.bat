@echo off
title AlgoAddicts - Operation Abhedya-Chakra Platform
echo =========================================================================
echo       ALGOADDICTS: ABHEDYA-CHAKRA CYBER FORENSICS PLATFORM
echo               Indore Police / Void Hacks() 8.0
echo =========================================================================
echo.

if not exist "D:\AlgoAddicts\data\processed\abhedya.duckdb" (
    echo [*] Ingesting 2,000,000 transaction dataset into DuckDB...
    python scripts\ingest.py --csv data\fixtures\Transactions.csv
)

echo [*] Starting Backend API Server on http://127.0.0.1:8000 ...
start "AlgoAddicts Backend" cmd /k "cd /d D:\AlgoAddicts && python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo [*] Starting Frontend UI on http://localhost:5173 ...
start "AlgoAddicts Frontend" cmd /k "cd /d D:\AlgoAddicts\frontend && npm run dev"

echo.
echo =========================================================================
echo [OK] Deployment Successful!
echo [OK] Backend API: http://127.0.0.1:8000 (Swagger: http://127.0.0.1:8000/docs)
echo [OK] Frontend UI: http://localhost:5173
echo =========================================================================

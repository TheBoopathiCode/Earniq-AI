@echo off
setlocal enabledelayedexpansion
title Earniq AI Setup

echo.
echo  ============================================================
echo   Earniq AI -- One-Command Setup
echo  ============================================================
echo.

:: ── 1. Check Python ──────────────────────────────────────────────────────────
set PYTHON=
python --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON=python
) else (
    py --version >nul 2>&1
    if not errorlevel 1 (
        set PYTHON=py
    ) else (
        echo  ERROR: Python not found.
        echo  Download Python 3.10+ from https://python.org/downloads
        echo  Make sure to check "Add Python to PATH" during install.
        pause & exit /b 1
    )
)
for /f "tokens=2" %%v in ('%PYTHON% --version 2^>^&1') do set PY_VER=%%v
echo  [OK] Python %PY_VER%

:: ── 2. Check Node ─────────────────────────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found.
    echo  Download from https://nodejs.org (v18+ required)
    pause & exit /b 1
)
for /f %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER%
echo.

:: ── 3. Backend virtual environment ───────────────────────────────────────────
cd /d "%~dp0backend"

echo  [1/5] Creating Python virtual environment...
if not exist venv (
    %PYTHON% -m venv venv
    if errorlevel 1 ( echo  ERROR: venv creation failed. & pause & exit /b 1 )
)
call venv\Scripts\activate.bat
echo        Done.

:: ── 4. Install Python deps ────────────────────────────────────────────────────
echo  [2/5] Installing Python dependencies (first run: 2-3 min)...
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if errorlevel 1 ( echo  ERROR: pip install failed. Check internet connection. & pause & exit /b 1 )
echo        Done.

:: ── 5. Backend .env ──────────────────────────────────────────────────────────
if not exist .env (
    copy .env.example .env >nul
    echo  [OK] Created backend\.env from .env.example
) else (
    echo  [OK] backend\.env already exists
)

:: ── 6. Database init ─────────────────────────────────────────────────────────
echo  [3/5] Initialising database and seeding zones...
%PYTHON% init_db.py
if errorlevel 1 ( echo  ERROR: Database init failed. & pause & exit /b 1 )
echo        Done.

:: ── 7. Train ML models ───────────────────────────────────────────────────────
echo  [4/5] Training ML models (XGBoost + Fraud + Income baseline)...
%PYTHON% train_model.py
if errorlevel 1 ( echo  ERROR: ML training failed. & pause & exit /b 1 )
echo        Done.

:: ── 8. Frontend setup ────────────────────────────────────────────────────────
cd /d "%~dp0"

if not exist .env (
    copy .env.example .env >nul
    echo  [OK] Created frontend .env from .env.example
) else (
    echo  [OK] Frontend .env already exists
)

echo  [5/5] Installing Node.js dependencies...
npm install --silent
if errorlevel 1 ( echo  ERROR: npm install failed. & pause & exit /b 1 )
echo        Done.

:: ── 9. Start servers ─────────────────────────────────────────────────────────
echo.
echo  ============================================================
echo   Setup complete! Starting servers...
echo  ============================================================
echo.
echo   Worker App   -^>  http://localhost:5173
echo   API Docs     -^>  http://localhost:8000/docs
echo   Admin Login  -^>  http://localhost:5173  (Insurer Admin tab)
echo.
echo   Demo credentials:
echo     Worker : register with any phone + password earniq2026
echo     Admin  : admin / earniq2026
echo.
echo   Two windows will open. Close them to stop the servers.
echo  ============================================================
echo.

start "Earniq Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000 --host 0.0.0.0"
timeout /t 4 /nobreak >nul
start "Earniq Frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo  Both servers starting in separate windows.
echo  Open http://localhost:5173 in your browser.
echo.
pause

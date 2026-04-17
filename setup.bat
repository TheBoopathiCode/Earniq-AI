@echo off
setlocal enabledelayedexpansion

echo.
echo  ============================================================
echo   Earniq AI -- Full Setup and Start
echo  ============================================================
echo.

:: ── Check Python ─────────────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    py --version >nul 2>&1
    if errorlevel 1 (
        echo  ERROR: Python not found.
        echo  Download from https://python.org/downloads
        echo  Make sure to check "Add Python to PATH" during install.
        pause
        exit /b 1
    )
    set PYTHON=py
) else (
    set PYTHON=python
)

:: ── Check Node ────────────────────────────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found.
    echo  Download from https://nodejs.org
    pause
    exit /b 1
)

echo  [1/6] Python and Node.js found. OK.
echo.

:: ── Backend setup ─────────────────────────────────────────────────────────────
cd /d "%~dp0backend"

echo  [2/6] Creating Python virtual environment...
if not exist venv (
    %PYTHON% -m venv venv
    if errorlevel 1 (
        echo  ERROR: Failed to create virtual environment.
        pause
        exit /b 1
    )
)
echo        Done.

echo  [3/6] Installing Python dependencies (this takes 2-3 minutes first time)...
call venv\Scripts\activate.bat
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo  ERROR: pip install failed. Check your internet connection.
    pause
    exit /b 1
)
echo        Done.

echo  [4/6] Setting up database and seeding zones...
if not exist .env (
    copy .env.example .env >nul
    echo        Created .env from .env.example
)
%PYTHON% init_db.py
if errorlevel 1 (
    echo  ERROR: Database init failed.
    pause
    exit /b 1
)
echo        Done.

echo  [5/6] Training ML models (XGBoost + Fraud + Income + Premium)...
%PYTHON% train_model.py
if errorlevel 1 (
    echo  ERROR: ML training failed.
    pause
    exit /b 1
)
echo        Done.

:: ── Frontend setup ────────────────────────────────────────────────────────────
cd /d "%~dp0"

echo  [6/6] Installing Node.js dependencies...
if not exist .env (
    copy .env.example .env >nul
    echo        Created frontend .env from .env.example
)
npm install --silent
if errorlevel 1 (
    echo  ERROR: npm install failed.
    pause
    exit /b 1
)
echo        Done.

echo.
echo  ============================================================
echo   Setup complete. Starting servers...
echo  ============================================================
echo.
echo   Backend  -> http://localhost:8000
echo   Frontend -> http://localhost:5173
echo   API Docs -> http://localhost:8000/docs
echo.
echo   Press Ctrl+C in each window to stop.
echo  ============================================================
echo.

:: ── Start backend in new window ───────────────────────────────────────────────
start "Earniq Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"

:: ── Wait 3 seconds then start frontend ───────────────────────────────────────
timeout /t 3 /nobreak >nul
start "Earniq Frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo  Both servers are starting in separate windows.
echo  Open http://localhost:5173 in your browser.
echo.
pause

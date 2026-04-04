@echo off
echo ========================================
echo   EarniqAI - One Click Setup
echo ========================================

echo.
echo [1/4] Installing Python dependencies...
cd backend
pip install -r requirements.txt

echo.
echo [2/4] Setting up database...
if not exist .env (
    copy .env.example .env
    echo Created .env from .env.example
    echo IMPORTANT: Edit backend\.env and set your MySQL password
    pause
)
python seed.py

echo.
echo [3/4] Installing Node dependencies...
cd ..
npm install

echo.
echo [4/4] Starting servers...
echo Starting backend on http://localhost:8000
start cmd /k "cd backend && uvicorn app.main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

echo Starting frontend on http://localhost:5173
start cmd /k "npm run dev"

echo.
echo ========================================
echo   EarniqAI is running!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo ========================================

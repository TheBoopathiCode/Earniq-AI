#!/bin/bash
set -e

echo ""
echo "============================================================"
echo "  Earniq AI -- Full Setup and Start"
echo "============================================================"
echo ""

# ── Check Python ──────────────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    echo "ERROR: Python not found. Install from https://python.org/downloads"
    exit 1
fi

# ── Check Node ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js not found. Install from https://nodejs.org"
    exit 1
fi

echo "[1/6] Python ($($PYTHON --version)) and Node ($(node --version)) found. OK."
echo ""

# ── Backend setup ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

echo "[2/6] Creating Python virtual environment..."
if [ ! -d "venv" ]; then
    $PYTHON -m venv venv
fi
source venv/bin/activate
echo "       Done."

echo "[3/6] Installing Python dependencies (2-3 minutes first time)..."
pip install -r requirements.txt --quiet
echo "       Done."

echo "[4/6] Setting up database and seeding zones..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "       Created .env from .env.example"
fi
$PYTHON init_db.py
echo "       Done."

echo "[5/6] Training ML models..."
$PYTHON train_model.py
echo "       Done."

# ── Frontend setup ────────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"

echo "[6/6] Installing Node.js dependencies..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "       Created frontend .env from .env.example"
fi
npm install --silent
echo "       Done."

echo ""
echo "============================================================"
echo "  Setup complete. Starting servers..."
echo "============================================================"
echo ""
echo "  Backend  -> http://localhost:8000"
echo "  Frontend -> http://localhost:5173"
echo "  API Docs -> http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo "============================================================"
echo ""

# ── Start both servers ────────────────────────────────────────────────────────
# Backend in background
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Frontend in foreground
cd "$SCRIPT_DIR"
npm run dev &
FRONTEND_PID=$!

# Trap Ctrl+C to kill both
trap "echo ''; echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT

echo "Both servers running. Open http://localhost:5173"
wait

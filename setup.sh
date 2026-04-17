#!/bin/bash
set -e

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
info() { echo -e "${YELLOW}  → $1${NC}"; }
err()  { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

echo ""
echo "============================================================"
echo "  Earniq AI — One-Command Setup"
echo "============================================================"
echo ""

# ── 1. Check Python ───────────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then PYTHON=python3
elif command -v python &>/dev/null; then PYTHON=python
else err "Python not found. Install from https://python.org/downloads (3.10+ required)"; fi

PY_VER=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$($PYTHON -c "import sys; print(sys.version_info.major)")
PY_MINOR=$($PYTHON -c "import sys; print(sys.version_info.minor)")
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
    err "Python 3.10+ required. Found $PY_VER. Download from https://python.org/downloads"
fi
ok "Python $PY_VER"

# ── 2. Check Node ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    err "Node.js not found. Install from https://nodejs.org (v18+ required)"
fi
ok "Node.js $(node --version)"

# ── 3. Backend setup ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

info "Creating Python virtual environment..."
if [ ! -d "venv" ]; then
    $PYTHON -m venv venv
fi
source venv/bin/activate
ok "Virtual environment ready"

info "Installing Python dependencies (first run: 2-3 min)..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
ok "Python dependencies installed"

# ── 4. Backend .env ───────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    cp .env.example .env
    ok "Created backend/.env from .env.example"
else
    ok "backend/.env already exists"
fi

# ── 5. Database init + zone seeding ──────────────────────────────────────────
info "Initialising database and seeding zones..."
$PYTHON init_db.py
ok "Database ready (SQLite: earniq.db)"

# ── 6. Train ML models ────────────────────────────────────────────────────────
info "Training ML models (XGBoost + Fraud + Income baseline)..."
$PYTHON train_model.py
ok "ML models trained and saved"

# ── 7. Frontend setup ─────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"

if [ ! -f ".env" ]; then
    cp .env.example .env
    ok "Created frontend .env from .env.example"
else
    ok "Frontend .env already exists"
fi

info "Installing Node.js dependencies..."
npm install --silent
ok "Node dependencies installed"

# ── 8. Start servers ──────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Setup complete! Starting servers..."
echo "============================================================"
echo ""
echo "  Worker App   →  http://localhost:5173"
echo "  API Docs     →  http://localhost:8000/docs"
echo "  Admin Login  →  http://localhost:5173  (Insurer Admin tab)"
echo ""
echo "  Demo credentials:"
echo "    Worker  : register with any phone + password earniq2026"
echo "    Admin   : admin / earniq2026"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo "============================================================"
echo ""

# Start backend
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0 &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 4

# Start frontend
cd "$SCRIPT_DIR"
npm run dev &
FRONTEND_PID=$!

# Trap Ctrl+C
trap "echo ''; echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait

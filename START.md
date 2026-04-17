# Earniq AI — Start Here

## What you need installed (one-time)

| Tool | Version | Download |
|---|---|---|
| Python | 3.10 or higher | https://python.org/downloads |
| Node.js | 18 or higher | https://nodejs.org |
| Git | any | https://git-scm.com |

> **Redis is optional.** The app works without it — caching is just disabled.
> **MySQL is optional.** The app uses SQLite by default — no database setup needed.

---

## Run the project (3 steps, copy-paste each block)

### Step 1 — Backend

Open a terminal in the `earniq/backend` folder and run:

```bash
# 1a. Create a Python virtual environment
python -m venv venv

# 1b. Activate it
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# 1c. Install ALL dependencies (this is the only command you need)
pip install -r requirements.txt

# 1d. Copy the environment file
cp .env.example .env

# 1e. Create tables + seed 25 zones across 5 cities
python init_db.py

# 1f. Train the ML models (XGBoost risk scorer + fraud detector)
python train_model.py

# 1g. Start the backend API
uvicorn app.main:app --reload --port 8000
```

Backend is now running at: http://localhost:8000
API docs (Swagger): http://localhost:8000/docs

---

### Step 2 — Frontend

Open a **second terminal** in the `earniq` folder (the root, not backend) and run:

```bash
# 2a. Install all Node dependencies
npm install

# 2b. Start the frontend dev server
npm run dev
```

Frontend is now running at: http://localhost:5173

---

### Step 3 — Open the app

| URL | What it is |
|---|---|
| http://localhost:5173 | Worker PWA (register, dashboard, demo) |
| http://localhost:5173 (Admin tab) | Insurer Intelligence Center |
| http://localhost:8000/docs | Full API documentation |
| http://localhost:8000/health | System health check |

---

## Demo walkthrough (5 minutes)

1. Open http://localhost:5173
2. Click **Register** — fill in any phone number, name, select Zomato + Chennai + Velachery
3. Set working hours to 8, orders to 15, UPI ID to `demo@upi`
4. After registration, you land on the **Worker Dashboard**
5. In the right sidebar, find **Live Demo — Auto Claim Engine**
6. Click **Heavy Rain** trigger → DCS slider jumps to 74
7. Click **Simulate Auto Claim** → watch the 6-step pipeline run
8. Payout simulator shows the Razorpay mock response with full formula breakdown
9. Click the **Admin** tab (top nav) → see the Insurer Intelligence Center with live charts

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'app'`**
→ Make sure you are running commands from inside the `backend/` folder, not the root.

**`sqlite3.OperationalError: no such table`**
→ Run `python init_db.py` again from the `backend/` folder.

**`ML model not found`**
→ Run `python train_model.py` from the `backend/` folder.

**`Port 8000 already in use`**
→ Run `uvicorn app.main:app --reload --port 8001` and update `vite.config.ts` proxy target to `http://localhost:8001`.

**`npm install` fails**
→ Make sure Node.js 18+ is installed: `node --version`

**Registration returns 400 "Phone already registered"**
→ That phone number is already in the database. Use a different number or run `python init_db.py` to reset.

**Registration returns 403 "active_days < minimum 7"**
→ The BCR underwriting check requires `working_hours >= 7`. Set working hours to 8 in the registration form.

---

## Project structure

```
earniq/
├── backend/                  Python FastAPI backend
│   ├── app/
│   │   ├── main.py           Entry point — all routers + middleware
│   │   ├── models.py         SQLAlchemy DB models
│   │   ├── database.py       DB engine (SQLite default, MySQL optional)
│   │   ├── auth.py           JWT auth
│   │   ├── routers/          API endpoints
│   │   │   ├── auth.py       POST /auth/register, /auth/login
│   │   │   ├── claims.py     POST /claims/simulate
│   │   │   ├── dashboard.py  GET  /dashboard
│   │   │   ├── admin_dashboard.py  GET /admin/dashboard
│   │   │   └── simulation.py POST /simulation/start
│   │   ├── services/
│   │   │   ├── premium_engine.py   Hybrid payout formula
│   │   │   ├── fraud_engine.py     3-layer fraud detection
│   │   │   ├── dcs_engine.py       Disruption Confidence Score
│   │   │   ├── bcr_engine.py       Burn Cost Ratio controls
│   │   │   └── monitoring.py       Background polling tasks
│   │   └── ml/
│   │       ├── predict_risk.py     XGBoost risk scorer
│   │       ├── predict_fraud.py    Isolation Forest fraud detector
│   │       └── income_baseline.py  Linear regression income predictor
│   ├── init_db.py            Creates tables + seeds 25 zones
│   ├── train_model.py        Trains all ML models
│   ├── requirements.txt      ALL Python dependencies (pip install -r requirements.txt)
│   └── .env.example          Copy to .env and fill in values
│
├── src/                      React TypeScript frontend
│   └── app/
│       ├── components/
│       │   ├── Dashboard.tsx         Worker dashboard
│       │   ├── dashboard/
│       │   │   ├── DemoPanel.tsx     Live demo with hybrid payout formula
│       │   │   └── PayoutSimulator.tsx  Razorpay mock response
│       │   └── insurer/
│       │       ├── InsurerDashboard.tsx  Admin intelligence center
│       │       └── SimulationPanel.tsx   Trigger simulation
│       └── lib/
│           ├── store.ts      Premium calculation (mirrors backend formula)
│           └── api.ts        HTTP client
│
├── package.json              Node dependencies (npm install)
└── START.md                  ← You are here
```

---

## Environment variables explained

All variables live in `backend/.env`. The defaults in `.env.example` work out of the box for local development.

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./earniq.db` | Database connection. SQLite needs no setup. |
| `SECRET_KEY` | `earniq-ai-secret-...` | JWT signing key. Change in production. |
| `REDIS_URL` | `redis://localhost:6379/0` | Cache. App works without Redis. |
| `RAZORPAY_KEY_ID` | test key | Razorpay test mode. Works as-is for demo. |
| `OWM_API_KEY` | provided | OpenWeatherMap free tier. Works as-is. |
| `AQICN_TOKEN` | provided | AQICN free tier. Works as-is. |
| `ALLOWED_ORIGINS` | localhost ports | CORS whitelist. Add your domain in production. |
| `ENV` | `development` | Set to `production` to enable HTTPS redirect. |

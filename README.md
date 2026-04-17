# Earniq AI — Parametric Income Insurance for Gig Workers
##**PITCH DECK**
https://drive.google.com/file/d/1zKTeHndMtS6VVyani-vhl6ePG16MPbgA/view?usp=sharing
> **"We prevent income loss before it happens — and automatically compensate whatever we couldn't prevent."**

AI-powered parametric income insurance for food delivery workers (Zomato / Swiggy). Payouts trigger automatically from live weather, AQI, and platform data — zero claim forms, 90-second UPI payout.

---

## Quick Start — 3 Steps

```bash
# 1. Clone
git clone https://github.com/TheBoopathiCode/Earniq-AI.git
cd Earniq-AI

# 2. Run setup (installs everything + starts both servers)
bash setup.sh          # Linux / Mac
# OR
setup.bat              # Windows (double-click or run in cmd)

# 3. Open browser
# Worker App  → http://localhost:5173
# API Docs    → http://localhost:8000/docs
# Admin Login → http://localhost:5173  (click "Insurer Admin" tab)
```

> **Windows users:** Double-click `setup.bat` — it opens two terminal windows automatically.

---

## Demo Credentials

| Role | Credential |
|---|---|
| Worker login | Any registered phone + password `earniq2026` |
| Admin dashboard | Username: `admin` · Password: `earniq2026` |
| Demo OTP | Shown on screen during registration (no SMS needed) |

---

## Features

| Feature | Detail |
|---|---|
| **Parametric triggers** | Rain >15mm/hr · Heat >44°C · AQI >300 · Zone lockdown · Platform outage |
| **Zero-touch claims** | Auto-generated when income drops >40% + DCS >70 |
| **90-second payout** | Razorpay UPI test mode — real transaction flow |
| **3-layer fraud engine** | Rule checks + GPS validation + Isolation Forest ML |
| **Syndicate detection** | Ring fraud via claim velocity + temporal clustering |
| **XGBoost risk scoring** | 8-feature worker risk profile at onboarding |
| **Live zone heatmap** | Leaflet.js map with real-time DCS per zone |
| **5 cities** | Chennai · Delhi · Mumbai · Hyderabad · Kolkata |
| **Insurer dashboard** | Live claims queue · fraud alerts · loss ratio analytics |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS (PWA) |
| Backend | FastAPI + Uvicorn (Python 3.10+) |
| Database | SQLite (default, zero-config) / MySQL (production) |
| ML | XGBoost · scikit-learn · Isolation Forest |
| Background tasks | asyncio (built-in) · Celery + Redis (optional) |
| Payments | Razorpay test mode (UPI) |
| Maps | Leaflet.js + OpenStreetMap |
| External APIs | OpenWeatherMap · AQICN |

---

## Project Structure

```
earniq/
├── backend/
│   ├── app/
│   │   ├── routers/        # auth, claims, dashboard, zones, workers …
│   │   ├── services/       # DCS engine, fraud engine, premium engine, monitoring
│   │   ├── ml/             # XGBoost risk, Isolation Forest fraud, income baseline
│   │   ├── fraud/          # 3-layer fraud pipeline
│   │   ├── models.py       # SQLAlchemy ORM models
│   │   ├── database.py     # DB engine + session
│   │   └── main.py         # FastAPI app + lifespan
│   ├── init_db.py          # Creates tables + seeds 25 zones across 5 cities
│   ├── train_model.py      # Trains all ML models (XGBoost + fraud + income)
│   ├── requirements.txt
│   └── .env.example
├── src/
│   └── app/
│       ├── components/     # Dashboard, Registration, Insurer, UI
│       ├── hooks/          # useZones, usePollingEngine, useZoneLiveDcs
│       ├── lib/            # api.ts, types.ts, store.ts
│       └── App.tsx
├── setup.sh                # Linux/Mac one-command setup
├── setup.bat               # Windows one-command setup
└── .env.example
```

---

## Environment Variables

Copy `.env.example` → `.env` (setup scripts do this automatically).

**Frontend** (`.env`):
```
VITE_API_URL=/api
VITE_OWM_KEY=your_openweathermap_key
VITE_AQICN_KEY=your_aqicn_token
```

**Backend** (`backend/.env`):
```
DATABASE_URL=sqlite:///./earniq.db
SECRET_KEY=change-this-in-production
OWM_API_KEY=your_openweathermap_key
AQICN_TOKEN=your_aqicn_token
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

> The app works fully with SQLite and without Razorpay/OWM keys — mock data fills in automatically.

---

## Example API Responses

**POST /api/auth/register** — success:
```json
{
  "access_token": "eyJ...",
  "worker": {
    "id": "12",
    "name": "Arjun Kumar",
    "city": "chennai",
    "zone": { "id": "ch-vel", "name": "Velachery", "currentDcs": 11.3 },
    "riskScore": 9
  },
  "policy": {
    "tier": "standard",
    "weeklyPremium": 121.5,
    "coverageCap": 600,
    "triggersActive": ["rain", "heat", "aqi", "lockdown"]
  }
}
```

**GET /api/zones** — live DCS per zone:
```json
[
  { "id": "ch-vel", "name": "Velachery", "city": "chennai", "currentDcs": 11.3, "activeDisruption": false },
  { "id": "dl-ito", "name": "ITO",       "city": "delhi",   "currentDcs": 72.4, "activeDisruption": true  }
]
```

**POST /api/claims** — auto-approved claim:
```json
{
  "claim_id": "CLM-0042",
  "status": "approved",
  "fraud_score": 8,
  "payout_amount": 180.0,
  "utr": "UTR2244XXXX",
  "message": "Payout of ₹180 sent to your UPI within 90 seconds"
}
```

---

## How Parametric Triggers Work

```
Every 15 min: disruption_monitor() polls OpenWeatherMap + AQICN per zone
              DCS = weather×0.35 + aqi×0.20 + traffic×0.15 + govt×0.20 + idle×0.10

Every 10 min: income_tracker() compares actual vs expected orders
              loss_pct = (expected - actual) / expected × 100

Auto-claim fires when:
  loss_pct > 40%  AND  DCS > 70  AND  worker GPS in affected zone

Fraud engine runs in ~2 seconds:
  Layer 1: Rule checks (weather mismatch, zone mismatch, duplicate)
  Layer 2: GPS velocity + dwell validation
  Layer 3: Isolation Forest anomaly vs 8-week baseline

fraud_score < 30  → Auto-approve → Razorpay UPI payout ≤90s
fraud_score 30-69 → 2-hour insurer review
fraud_score ≥ 70  → Auto-reject + appeal option
```

---

## Requirements

- Python 3.10+
- Node.js 18+
- Git

No MySQL, Redis, or Docker required for local demo — SQLite is the default database.

---

*Guidewire DEVTrails 2026 · Earniq AI · Persona: Food Delivery Partners*
*Cities: Chennai · Delhi · Mumbai · Hyderabad · Kolkata*

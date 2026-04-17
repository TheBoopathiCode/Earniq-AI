# Earniq AI
### AI-Powered Parametric Income Insurance 

> **"We prevent income loss before it happens — and automatically compensate whatever we couldn't prevent."**

**Platform:** Web (React PWA) · **Persona:** Food Delivery Partners (Zomato / Swiggy) · **Coverage:** Income loss only — no health, accident, or vehicle coverage · **Pricing:** Weekly parametric model

---

## Table of Contents

1. [Persona & Problem](#1-persona--problem)
2. [Solution Overview](#2-solution-overview)
3. [Application Workflow](#3-application-workflow)
4. [System Architecture](#4-system-architecture)
5. [Weekly Premium Model](#5-weekly-premium-model)
6. [Parametric Trigger System](#6-parametric-trigger-system)
7. [AI / ML Integration](#7-ai--ml-integration)
8. [Fraud Detection System](#8-fraud-detection-system)
9. [Adversarial Defense & Anti-Spoofing Strategy](#9-adversarial-defense--anti-spoofing-strategy)
10. [API Integrations](#10-api-integrations)
11. [Tech Stack](#11-tech-stack)
12. [Demo Plan](#12-demo-plan)

---

## 1. Persona & Problem

### Chosen Persona: Food Delivery Partners — Zomato & Swiggy

Food delivery was chosen over grocery or e-commerce for three technical reasons. First, order data is available at per-minute granularity through platform APIs, enabling precise income tracking. Second, disruptions have an immediate, measurable income signature — orders in a flood zone drop within 20–30 minutes of rainfall crossing 15mm/hr, creating a clean parametric trigger boundary. Third, weekly earnings follow a predictable distribution (₹4,000–₹8,000/week across Indian metros), making baseline modelling reliable.

**Scale of the problem:**

| Metric | Value |
|---|---|
| Gig delivery workers in India | 15M+ |
| Average monthly income loss during disruption events | 20–30% |
| Existing parametric income protection solutions | 0 |
| Cities with recurring flood / pollution / heat disruptions | Chennai, Delhi, Mumbai, Hyderabad, Kolkata |

### Multi-City Disruption Reality

The platform is not Chennai-specific. Disruption types vary by geography and the trigger thresholds are calibrated per city:

**Chennai — Flood / Heavy Rain**
Northeast monsoon (Oct–Dec) causes recurring flash floods in zones like Velachery and Tambaram. Orders drop 80–90% when rainfall exceeds 15mm/hr. These are the most abrupt income collapses in any Indian metro.

**Delhi — Severe Pollution (AQI)**
October–January pollution season routinely pushes AQI above 300–400 (Hazardous/Severe). Outdoor delivery drops sharply when AQI crosses 300 — government advisories restrict outdoor movement and consumer order rates fall simultaneously. This is the highest-frequency recurring disruption nationally.

**Mumbai — Monsoon + Waterlogging**
Heavy rain combined with chronic waterlogging in areas like Dharavi, Kurla, and Sion causes route-level disruption rather than city-wide shutdowns. Requires hyperlocal zone-level detection, not city-level.

**Hyderabad — Flash Flooding**
Rapid urban flooding events (Musi river overflow, Narayanguda, LB Nagar) are sudden and short — 2–4 hour income windows. Trigger detection must operate at 15-minute polling intervals to be useful.

**Kolkata — Cyclone Pre-Events + Strikes**
Cyclone approach periods (12–24 hours before landfall) and bandh-related zone closures create predictable disruption windows. Government alert feed integration is the primary trigger source.

### Why Web Platform (not mobile app)

The platform is built as a React Progressive Web App rather than a native mobile application for three reasons: instant deployment without app store approval cycles, push notification support via browser APIs, and compatibility with low-spec Android devices common among delivery workers. The PWA is installable and works offline for claim status viewing.

---

## 2. Solution Overview

Earniq AI is a parametric income insurance platform. "Parametric" means payouts are triggered by objective, measurable external conditions — not by worker-submitted claims. The worker never needs to file anything.

### The four-layer system

```
LAYER 1 — PREDICT      AI risk model scores zones 6–24 hours ahead using 5 data sources
LAYER 2 — PREVENT      Safe Zone Advisory fires at 20% income drop — worker can move before loss
LAYER 3 — CONFIRM      Multi-source Disruption Confidence Score (DCS) validates the event
LAYER 4 — PAY          Zero-touch UPI payout within 90 seconds of confirmed income loss
```

### What separates this from a basic trigger-and-pay system

| Baseline approach | Earniq AI |
|---|---|
| Single weather API → fixed payout | 5-source Disruption Confidence Score → proportional payout |
| City-level risk | Hyperlocal zone/street-level risk (lat/lon grid cells) |
| Static weekly premium | Adaptive premium: risk × behaviour × zone history |
| Manual claim submission | Zero-touch parametric auto-claim |
| GPS-only fraud check | 3-layer fraud engine + ring-level Syndicate Score |
| Reactive — pays after loss | Predictive — warns worker before loss occurs |
| Fixed coverage amount | Proportional payout = actual loss capped at weekly coverage cap |

### Constraints compliance

| Constraint | Implementation |
|---|---|
| Income loss only | Policy document, onboarding UI, and payout logic explicitly exclude health, accident, and vehicle coverage |
| Weekly pricing model | Premium recalculated every Sunday 11pm via cron job. Razorpay auto-debit fires Monday 6am. |
| Automated parametric triggers | 5 triggers defined with objective thresholds. Zero manual claim steps. |
| Fraud detection | 3-layer engine: rule-based + GPS validation + Isolation Forest anomaly detection |

---

## 3. Application Workflow

### Worker Journey

```
┌─────────────────────────────────────────────────────────────────────┐
│  ONBOARDING (one-time, ~3 minutes)                                  │
│                                                                     │
│  Step 1: Phone number + OTP verification                            │
│  Step 2: Platform selection (Zomato / Swiggy / Zepto / Amazon)      │
│  Step 3: Primary delivery zone selection (map-based)                │
│  Step 4: Weekly working hours + average orders declared             │
│  Step 5: UPI ID for payouts                                         │
│                                                                     │
│  → XGBoost risk model scores profile instantly                      │
│  → Weekly premium quoted before policy activation                   │
│  → Razorpay auto-debit consent collected                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ACTIVE WEEK (continuous background monitoring)                     │
│                                                                     │
│  Every 10 min  → Income tracker compares actual vs expected         │
│  Every 15 min  → Disruption Confidence Score recalculated per zone  │
│  Every 30 min  → Zone Risk Score updated on heatmap                 │
│                                                                     │
│  Income Health Meter states:                                        │
│  GREEN  → Earnings within 10% of hourly baseline                   │
│  YELLOW → Earnings drop 20–40% → Safe Zone Advisory fires           │
│  RED    → Earnings drop >40% + DCS >70 → Auto-claim generated       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CLAIM & PAYOUT (fully automated)                                   │
│                                                                     │
│  Trigger threshold crossed                                          │
│  + Worker GPS confirms zone presence                                │
│  + Income loss > 40% vs baseline                                    │
│  + DCS > 70 for affected zone                                       │
│  → Fraud engine scores claim (3 layers, ~2 seconds)                 │
│  → Score < 30:  Auto-approve → Razorpay UPI payout within 90s       │
│  → Score 30–69: 2-hour insurer review queue                         │
│  → Score > 70:  Auto-reject with transparent reason + appeal option │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SUNDAY RENEWAL (predictive policy personalisation)                 │
│                                                                     │
│  Sunday 11pm: Policy engine runs for all active workers             │
│  Inputs: 7-day zone risk forecast + claim history + consistency     │
│  Outputs: Next week premium (₹) + coverage tier + AI insight text   │
│  Worker notified: "Your policy for next week is ready"              │
│  Monday 6am: Razorpay auto-debit                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Insurer Admin Workflow

```
Real-time dashboard shows:
  • Live claims queue with fraud scores
  • Zone-level Disruption Confidence Score map
  • Syndicate Score alerts (ring fraud detection)
  • Loss ratio per zone per week
  • Predictive claim forecast for next 7 days (ML output)
  • Payout velocity vs premium collected
```

---

## 4. System Architecture

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                            Earniq AI PLATFORM                          ║
╠══════════════════╦═══════════════════════════════════════════════════════════╣
║                  ║                  CLIENT LAYER                            ║
║   WORKER PWA     ║  Income Health Meter · Policy Dashboard · Zone Heatmap   ║
║   (React)        ║  Safe Zone Map · Claim History · Push Notifications       ║
║                  ╠═══════════════════════════════════════════════════════════╣
║   INSURER        ║  Live Claims Queue · Fraud Alert Feed · Loss Ratios       ║
║   DASHBOARD      ║  Syndicate Score Monitor · Predictive Claim Analytics     ║
║   (React)        ║                                                           ║
╠══════════════════╩═══════════════╦════════════════════════════════════════════╣
║                                  ║         REST API + WebSocket              ║
╠══════════════════════════════════╩════════════════════════════════════════════╣
║                           BACKEND — FastAPI                                  ║
║                                                                              ║
║   Endpoints:  /auth  /workers  /policies  /claims  /triggers  /payouts       ║
║               /premium  /zones  /dashboard  /fraud  /advisories              ║
║                                                                              ║
║   ┌─────────────────────────── CELERY WORKERS ─────────────────────────┐    ║
║   │  disruption_monitor()   → polls 5 APIs every 15 min                │    ║
║   │  income_tracker()       → compares actual vs baseline every 10 min │    ║
║   │  premium_recalculator() → runs every Sunday 11pm (cron)            │    ║
║   │  fraud_scorer()         → triggered on every new claim event       │    ║
║   │  syndicate_detector()   → scans zone claim patterns every 5 min    │    ║
║   └────────────────────────────────────────────────────────────────────┘    ║
╠════════════════╦══════════════════╦═════════════════════════════════════════╣
║   AI / ML      ║   DATA LAYER     ║         EXTERNAL APIs                   ║
║                ║                  ║                                         ║
║  XGBoost       ║  MySQL      ║  OpenWeatherMap  → rain, heat, forecast  ║
║  (risk score)  ║  (primary store) ║  AQICN           → AQI per district      ║
║                ║                  ║  Google Maps     → traffic congestion    ║
║  Isolation     ║  Redis           ║  Govt alert feed → curfew / strike       ║
║  Forest        ║  (cache + queue) ║  Platform API    → order count (mock)    ║
║  (fraud)       ║                  ║  Razorpay        → UPI payout (test)     ║
║                ║                  ║                                         ║
║  Linear Reg    ║                  ║                                         ║
║  (income       ║                  ║                                         ║
║   baseline)    ║                  ║                                         ║
║                ║                  ║                                         ║
║  Syndicate     ║                  ║                                         ║
║  Score Engine  ║                  ║                                         ║
║  (ring fraud)  ║                  ║                                         ║
╚════════════════╩══════════════════╩═════════════════════════════════════════╝
```

### Data flow: registration → monitoring → payout

```
REGISTRATION
  POST /workers
    → Worker profile stored in MySQL
    → XGBoost model scores 8-feature risk profile → risk_score (0–100)
    → Premium formula applied → weekly_premium (₹)
    → Policy record created with coverage_cap and trigger_list
    → Razorpay subscription created for Monday auto-debit

CONTINUOUS MONITORING (Celery background workers)
  Every 15 min:
    disruption_monitor() →
      Polls OpenWeatherMap, AQICN, Traffic API, Govt feed, Worker GPS signals
      DCS = weighted_avg(weather×0.35, aqi×0.20, traffic×0.15, govt×0.20, idle_pct×0.10)
      If DCS > 70 for a zone → disruption_event created → trigger engine activated

  Every 10 min:
    income_tracker() →
      Fetches order_count from mock platform API per worker
      actual_income = orders × avg_order_value
      expected_income = 8-week rolling avg for same day+hour slot
      loss_pct = (expected - actual) / expected × 100
      If loss_pct > 20% → Income Health Meter = YELLOW → safe_zone_advisory sent
      If loss_pct > 40% AND disruption_event active → claim auto-created

CLAIM PROCESSING (~2 seconds)
  fraud_scorer() →
    Layer 1: Rule-based checks (weather mismatch, zone mismatch, duplicate)
    Layer 2: GPS velocity validation + trajectory check
    Layer 3: Isolation Forest anomaly score vs 8-week behavioral baseline
    → fraud_score (0–100) computed
    If fraud_score < 30: POST /v1/payouts → Razorpay UPI → worker notified
    If fraud_score 30–69: claim → insurer review queue
    If fraud_score > 70: auto-reject → fraud_flag record → worker appeal option

WEEKLY RENEWAL (Sunday 11pm cron)
  premium_recalculator() →
    For each active worker:
      zone_risk = 7-day forecast DCS for primary zone
      claim_factor = f(claims_last_8_weeks)
      consistency_score = f(active_days / total_days)
      new_premium = base_rate × zone_multiplier × claim_factor × consistency_bonus
      ai_insight = LLM-generated plain-language explanation of premium change
    → Policy updated, worker notified, Razorpay debit scheduled
```

---

## 5. Weekly Premium Model

### Formula

```
Weekly_Premium = Base_Rate × Zone_Risk_Multiplier × Claim_History_Factor × Consistency_Bonus

Base_Rate             = ₹12  (standard food delivery baseline)
Zone_Risk_Multiplier  = 0.67 → 2.33  (maps Zone Risk Score 0–100 linearly)
Claim_History_Factor  = 1.0  → 1.8   (increases with recent claim frequency)
Consistency_Bonus     = 0.85 → 1.0   (discount for workers active 5+ days/week)

Output range: ₹8/week (low-risk, consistent, no claims) to ₹28/week (high-risk, frequent claims)
```

### Zone Risk Multiplier — multi-city calibration

| Zone Risk Score | Risk Category | Multiplier | Typical cities / zones |
|---|---|---|---|
| 0–20 | Very Low | 0.67× | OMR Chennai, Noida Sector 62, Whitefield Bangalore |
| 21–40 | Low | 0.90× | Anna Nagar Chennai, South Delhi, Banjara Hills |
| 41–60 | Medium | 1.20× | T. Nagar Chennai, Connaught Place Delhi, Bandra Mumbai |
| 61–80 | High | 1.65× | Velachery Chennai, Dwarka Delhi (AQI), Kurla Mumbai |
| 81–100 | Critical | 2.33× | Tambaram floods, ITO Delhi (AQI 400+), Dharavi waterlogging |

### Weekly cycle mechanics

```
Sunday  23:00  → Premium engine recalculates all active worker policies
Monday  06:00  → Razorpay auto-debit executes
Monday  07:00  → Worker push notification: "Policy active — covered until Sunday"
                 Notification includes: premium paid, coverage cap, active triggers this week
                 AI insight: e.g. "AQI forecast >300 Tuesday in your zone — coverage pre-boosted"
Sunday  23:00  → Cycle repeats
```

### Coverage tiers

| Tier | Weekly Premium | Max Payout Cap | Trigger coverage |
|---|---|---|---|
| BASIC | ₹8–12 | ₹1,200 | Rain + Heat only |
| STANDARD | ₹13–20 | ₹1,600 | Rain + Heat + AQI + Strike |
| PREMIUM | ₹21–28 | ₹2,000 | All 5 triggers including Platform Outage |

Payout is proportional — `payout = min(actual_income_loss, weekly_coverage_cap)` — not a fixed amount. A worker who moved to a safe zone mid-disruption and recovered 60% of their income receives only 40% of the potential claim.

---

## 6. Parametric Trigger System

All 5 triggers require **two simultaneous conditions**: (a) environmental threshold crossed via API verification AND (b) worker GPS confirms presence in the affected zone at the time of disruption.

### Disruption Confidence Score (DCS)

Before any trigger activates a claim, the DCS must exceed 70/100 for the worker's zone. This prevents false positives from single-source API noise.

```python
DCS = (
    weather_signal    * 0.35 +    # OpenWeatherMap rain/temp/humidity composite
    aqi_signal        * 0.20 +    # AQICN hourly reading
    traffic_signal    * 0.15 +    # Congestion index — delivery routes unusable
    govt_alert_signal * 0.20 +    # Official curfew / advisory for the zone
    worker_idle_pct   * 0.10      # % of active workers in zone who went idle (collective intelligence)
)
# Polled every 15 minutes. Zone-level granularity (lat/lon grid cells, ~2km radius).
# DCS > 70 → disruption_event record created → trigger engine checks income drop condition
```

### Trigger 1 — Heavy Rainfall

```
Data source:    OpenWeatherMap Current Weather API (free tier)
Endpoint:       GET /data/2.5/weather?lat={lat}&lon={lon}&appid={key}
Threshold:      rain.1h > 15.0 mm/hr sustained for 2 consecutive 15-min polls
Zone match:     Worker GPS within 2km radius of weather cell reporting threshold
Income check:   loss_pct > 40% vs same-hour baseline
Payout logic:   Proportional to loss, capped at coverage tier limit

Relevance:      Chennai (NE monsoon Oct–Dec), Mumbai (SW monsoon Jun–Sep),
                Hyderabad (Oct flash floods), Kolkata (May–Sep)
```

### Trigger 2 — Extreme Heat

```
Data source:    OpenWeatherMap (feels_like field from /weather endpoint)
Threshold:      main.feels_like > 44.0°C sustained for 3 consecutive polls (45 min)
Zone match:     Heat is metro-wide — worker GPS must be in the same city
Income check:   loss_pct > 35% vs baseline (lower threshold — heat is less sudden than rain)
Payout logic:   Proportional to loss, capped at tier limit

Relevance:      Delhi (May–Jun, 45–48°C common), Hyderabad (Apr–May),
                Nagpur (highest heat exposure nationally)
```

### Trigger 3 — Severe Air Quality (AQI)

```
Data source:    AQICN Real-time Air Quality API (free token)
Endpoint:       GET /feed/geo:{lat};{lon}/?token={token}
Threshold:      data.aqi > 300 (Hazardous category) for 3+ consecutive hours
Zone match:     Worker GPS within AQICN station's coverage district
Income check:   loss_pct > 30% vs baseline
Payout logic:   Proportional to loss

Relevance:      Delhi (Oct–Jan, AQI 300–500 routine), Gurugram, Noida, Faridabad —
                this is the single highest-frequency recurring trigger in India.
                Delhi delivery workers lose 4–8 days/year to pollution-forced income drops.
```

### Trigger 4 — Zone Lockdown / Civil Disruption

```
Data source:    Government alert feed integration (mock webhook in Phase 1/2;
                real integration: state disaster management authority RSS feeds)
Threshold:      Official curfew, bandh, or Section 144 order covering worker's zone
Zone match:     Worker last-known GPS inside declared restricted zone
Income check:   Orders received = 0 during lockdown window
Payout logic:   Full coverage cap for duration of lockdown

Relevance:      All metros — political events, religious processions, post-election
                violence, cyclone preparedness advisories (Kolkata, Chennai coast)
```

### Trigger 5 — Platform Application Outage *(unique — no other team will have this)*

```
Data source:    Mock platform webhook (simulating Zomato / Swiggy status endpoint)
               Real implementation: platform status page polling + order assignment rate monitoring
Threshold:      Platform unavailable or order_assignment_rate < 5% of normal
               for > 45 minutes during peak windows (12:00–14:00 or 19:00–21:00)
Zone match:     Not applicable — platform outage is system-wide
Income check:   orders_assigned = 0 during outage window (objective verification)
Payout logic:   Proportional to lost peak-hour earnings

Relevance:      Platform outages directly cause income loss with no worker recourse.
               Workers cannot switch platforms mid-shift. This trigger class does not
               exist in any current parametric insurance product.
```

---

## 7. AI / ML Integration

### Model 1 — XGBoost Risk Classifier

**Role:** Generates a Risk Score (0–100) and Risk Tier (LOW / MEDIUM / HIGH) for each worker at onboarding and on weekly policy renewal.

**Input features (8):**

| Feature | Type | Source |
|---|---|---|
| `zone_flood_history` | float 0–1 | Historical disruption event frequency for zone |
| `zone_aqi_baseline` | int | 30-day average AQI for worker's city district |
| `zone_traffic_density` | float 0–1 | Google Maps historical congestion score |
| `worker_years_active` | int | Self-declared at onboarding |
| `weekly_avg_orders` | int | Self-declared + platform API cross-check |
| `claim_count_8w` | int | Computed from claims table on renewal |
| `platform_type` | categorical | food / grocery / ecommerce |
| `working_hours_per_day` | float | Derived from activity_logs GPS ping frequency |

**Output:** `risk_score` (0–100), `risk_tier` (LOW/MEDIUM/HIGH)

**Training data:** 5,000 synthetic worker profiles generated with realistic Indian delivery worker distributions. Features correlated with historical flood/AQI event data. 80/20 train/test split. Evaluation metric: weighted F1 score.

```python
from xgboost import XGBClassifier
model = XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42)
model.fit(X_train, y_train)
risk_score = model.predict_proba(worker_features)[0][2] * 100  # HIGH class probability
```

---

### Model 2 — Linear Regression Income Baseline Predictor

**Role:** Computes `expected_income` for a given worker at a given day/hour slot. This is the denominator in the loss calculation. Without an accurate baseline, parametric income insurance cannot work.

**Input features (5):**

| Feature | Type | Derivation |
|---|---|---|
| `day_of_week` | int 0–6 | Calendar |
| `hour_of_day` | int 0–23 | Timestamp of 10-min polling window |
| `zone_order_density` | float | 8-week rolling average orders in zone for this slot |
| `weather_composite_score` | float 0–1 | Clear → severe, computed from OpenWeatherMap |
| `is_peak_hour` | bool | 12–14h and 19–21h windows |

**Output:** `expected_income` (₹) for the current 10-minute window, annualised to hourly

**Training:** Per-worker rolling regression, retrained weekly from 8-week activity history. Workers with < 2 weeks of history use city-level cohort averages.

```python
from sklearn.linear_model import LinearRegression
model = LinearRegression()
model.fit(X_worker_history, y_earnings_history)
expected = model.predict([[day, hour, density, weather, peak]])[0]
loss_pct = max(0, (expected - actual) / expected * 100)
```

---

### Model 3 — Isolation Forest Fraud Anomaly Detector

**Role:** Scores each claim against the worker's personal 8-week behavioral baseline. Detects individual fraud patterns that rule-based checks miss.

**Input features (6):**

| Feature | Genuine worker value | Fraudulent worker value |
|---|---|---|
| `claim_frequency_delta` | Near 0 (consistent) | Spike vs 8-week average |
| `gps_velocity_anomaly` | False | True (teleporting coordinates) |
| `weather_claim_mismatch` | False | True (clear weather API at GPS location) |
| `idle_time_pattern_score` | Normal for disruption type | Anomalous (long pre-claim inactivity) |
| `dcs_at_claim_time` | > 70 (disruption confirmed) | < 40 (no external confirmation) |
| `time_since_last_claim_hrs` | > 168 (weekly baseline) | < 24 (rapid repeat claims) |

**Output:** `anomaly_score` → mapped to `fraud_score` (0–100)

```python
from sklearn.ensemble import IsolationForest
clf = IsolationForest(contamination=0.05, n_estimators=100, random_state=42)
clf.fit(normal_claim_features_8w)
raw_score = clf.decision_function([claim_features])[0]
fraud_score = int(max(0, min(100, (0.5 - raw_score) * 100)))
```

---

### Model 4 — Syndicate Score Engine (Ring Fraud Detection)

**Role:** Detects coordinated mass fraud — groups of workers filing fake claims simultaneously. Operates at the disruption_event level, not the individual claim level.

Calculated per disruption event across all simultaneous claimants in a zone:

```python
syndicate_score = (
    claim_velocity_score       * 0.25 +   # claims/min vs 90-day zone baseline
    temporal_cluster_score     * 0.20 +   # % claims in same 10-min window
    accelerometer_silence      * 0.20 +   # mean accel variance across claimants
    network_strength_anomaly   * 0.15 +   # % with strong signal in "disrupted" zone
    delivery_app_closed_pct    * 0.15 +   # % with app in background
    device_fingerprint_cluster * 0.05     # shared IP subnet or device signatures
)

# 0–29: process individually through normal fraud pipeline
# 30–59: SOFT FREEZE — hold all new claims from this zone, insurer review
# 60–100: ZONE LOCK — all claims held, ring investigation opened
```

---

## 8. Fraud Detection System

Three layers execute sequentially on every claim. Total processing time: ~2 seconds.

### Layer 1 — Rule-Based Checks (instant)

```
CHECK 1 — Weather source mismatch
  IF trigger_type = "heavy_rain"
  AND OpenWeatherMap rain.1h < 2.0mm at worker's GPS coordinates
  → auto_reject, flag: weather_mismatch

CHECK 2 — Zone presence mismatch
  IF worker_claim_zone != worker_last_gps_zone
  AND distance_between_zones > 3.0 km
  → auto_reject, flag: zone_mismatch

CHECK 3 — Duplicate claim
  IF worker already has an approved claim for the same disruption_event_id
  → auto_reject, flag: duplicate_block

CHECK 4 — Policy window
  IF claim_timestamp outside active policy week_start → week_end window
  → auto_reject, flag: policy_lapsed

CHECK 5 — Platform outage self-report contradiction
  IF trigger_type = "platform_outage"
  AND mock_platform_api.status = "operational"
  → auto_reject, flag: platform_contradiction
```

### Layer 2 — GPS Validation

```
VELOCITY SANITY CHECK
  Compute distance between consecutive GPS pings
  IF distance / time_delta > 120 km/hr (impossible for delivery bike)
  → gps_spoof_detected = True, fraud_score += 45

ZONE DWELL CONFIRMATION
  Worker must have ≥ 3 GPS pings inside disruption zone during the claim window
  This proves physical presence, not just a spoofed coordinate at claim-filing time

BEHAVIORAL MOTION CHECK
  A genuinely disrupted worker shows: high accel_variance (road vibration) → sudden drop (sheltering)
  IF accel_variance < 0.3 m/s² throughout event AND no prior road motion signature
  → stationary_at_home_signal = True, fraud_score += 30
```

### Layer 3 — Isolation Forest Anomaly Detection

See Model 3 above. Adds up to 30 points to `fraud_score` based on behavioral deviation from personal 8-week baseline.

### Fraud Score Thresholds

```
fraud_score 0–29   → AUTO APPROVE → Razorpay payout initiated within 90 seconds
fraud_score 30–69  → SOFT FLAG → 2-hour insurer review queue
                     Worker message: "Claim under verification — payout guaranteed if valid"
fraud_score 70+    → AUTO REJECT → fraud_flags record created
                     Worker sees which specific signals triggered the hold
                     One appeal per month: counter-evidence submission (photo / delivery log)
```

---

## 9. Adversarial Defense & Anti-Spoofing Strategy

> **Threat scenario issued by DEVTrails 2026:** A 500-member GPS-spoofing syndicate organized via Telegram is draining parametric insurance platforms by faking location to red-alert zones while resting at home. Simple GPS verification is declared obsolete.

### 9.1 Differentiating a Genuine Worker from a Bad Actor

GPS coordinates are a single, spoofable data point. Genuine workers in a disruption generate a correlated multi-signal signature that a spoofing app cannot replicate simultaneously across all channels.

**Signal 1 — Accelerometer / gyroscope behavioral fingerprint**

A delivery worker riding through rain or sheltering from a flood produces a physically distinct motion profile. An accelerometer reading below 0.3 m/s² variance with zero prior road vibration signature means the device has not moved — it is not outdoors on a delivery bike.

```
Genuine disruption pattern:
  Phase 1 (pre-disruption): accel_variance 2.0–4.5 m/s² — road vibration
  Phase 2 (disruption onset): sudden drop to ~0.2 m/s² — worker stopped, sheltering
  Phase 3 (recovery): gradual return to movement

Spoofed pattern:
  All phases: accel_variance < 0.15 m/s² — device stationary at home throughout
  No phase transition — no physical story
```

**Signal 2 — Battery drain rate**

GPS spoofing applications consume CPU continuously to override system location. Battery discharge rate during a spoofed session is 40–60% higher than passive GPS tracking. A worker "caught in a flood" whose battery is draining at 2× their personal 30-day baseline is running a background spoofing process.

**Signal 3 — Network signal paradox**

Flood zones, pollution events, and areas under civil disruption have degraded mobile network infrastructure. A device reporting strong WiFi or full 4G signal (-70 dBm or stronger) while claiming to be in a declared disaster zone is statistically inconsistent. Genuine workers in these conditions exhibit degraded connectivity.

**Signal 4 — Platform app behavioral coherence**

A genuinely stranded delivery worker has their platform app open and is attempting to accept orders. The mock platform API reports `app_state: "active_seeking"` and `orders_received: 0` — orders are being attempted but the platform cannot assign any due to the disruption zone.

A fraudster waiting for a payout has no reason to keep the delivery app open. Platform API reports `app_state: "background"` or `"closed"` — not attempting to work at all.

**Signal 5 — Pre-event trajectory validation**

Genuine workers traveled to the delivery zone before the disruption began. Their GPS history shows a route from home to the zone over 20+ minutes. Spoofed workers' GPS coordinates appear inside the zone within 2–3 minutes of the disruption event triggering — no plausible travel history precedes the location.

### 9.2 Detecting the Coordinated Ring — Data Points Beyond GPS

Individual fraud signals can occasionally appear in legitimate workers (network drops, sensor glitches). The Syndicate Score detects ring-level patterns that are statistically impossible in genuine events.

**Claim velocity analysis**

During genuine disruptions, claims arrive gradually over 30–90 minutes as each worker individually recognizes they cannot work and the system detects their income drop. A ring attack produces 50–200 claims in the same zone within a 10–15 minute burst. The claims-per-minute rate exceeds the 90-day zone baseline by 10× or more.

**Temporal clustering**

Telegram-coordinated rings fire claims near-simultaneously. Statistical analysis of claim timestamps: if more than 60% of claims from a zone arrive within the same 10-minute window, the probability of organic coordination is negligible.

**Collective intelligence inversion**

Earniq AI's I03 system uses worker idleness as positive confirmation of real disruptions — 60% of workers going idle in a zone is a crowd signal that the disruption is real. This same signal is inverted for ring detection:

```
IF zone shows 80%+ workers "idle"
AND mean accel_variance across those workers ≈ 0 (all stationary)
AND mean network_signal_strength = strong (not in a disruption zone)
THEN collective_intelligence = ANTI-CONFIRMATION
     The crowd data proves the disruption is fabricated, not real
```

**Cross-zone delivery activity contradiction**

Localized disruptions do not halt all delivery city-wide. If platform API data shows active order completions 3km from the claimed flood zone during the same window, but 200 workers in that zone report total delivery impossibility, the platform data directly contradicts the ring's claim.

**Social graph and referral chain clustering**

Ring members typically onboard together — they share referral codes, have adjacent registration timestamps, and sometimes share emergency contact patterns. If 40+ simultaneous claimants share referral chains or registration date clusters within a 24-hour window, this is a network-level fraud signal independent of GPS or sensor data.

**Device fingerprint clustering**

Syndicate members installing the same GPS spoofing application leave identical device fingerprint signatures. Multiple claims from the same residential IP subnet or sharing device characteristic patterns are provably not from multiple locations in a flood zone.

### 9.3 UX Balance — Protecting Honest Workers with Bad Network

Network degradation and GPS dropout are expected consequences of the very disruptions being insured. The system must not penalize workers for symptoms of the event they are claiming.

**GPS continuity grace window:**

```
IF worker had valid GPS pings in disruption zone for ≥ 20 minutes before signal loss
AND last known GPS position was inside the active disruption zone
AND DCS for that zone > 70 (independently confirmed disruption)
THEN location = VERIFIED for the full claim window
     Signal loss during a genuine disruption is treated as evidence of the disruption
```

**Three-tier response:**

```
fraud_score 0–29   → No friction. Auto-approve. Worker never knows a check ran.
fraud_score 30–69  → Non-accusatory 2-hour review.
                     "Your claim is being verified — you won't lose your payout if everything checks out."
                     Worker is NOT penalized if cleared. Fraud history unaffected.
fraud_score 70+    → Specific, transparent hold notice — which signals triggered it.
                     One appeal/month. Counter-evidence accepted.
                     Human insurer review within 24 hours.
```

Honest workers in genuine disruptions pass all sensor checks because their physical behavior is consistent with being outdoors. GPS spoofing apps cannot simultaneously fake accelerometer road vibration signatures, battery drain normality, platform app open state, trajectory history, and network signal degradation.

---

## 10. API Integrations

### OpenWeatherMap

```
Endpoint: GET https://api.openweathermap.org/data/2.5/weather
Params:   lat, lon, appid, units=metric
Key fields consumed:
  rain.1h         → mm rainfall in last hour (Trigger 1)
  main.feels_like → apparent temperature in °C (Trigger 2)
  main.humidity   → used in DCS weather composite
  weather[0].main → condition category for DCS scoring
Poll interval: every 15 minutes per active zone
Tier: Free (60 calls/min). Zones polled in parallel via asyncio.
```

### AQICN Real-time Air Quality

```
Endpoint: GET https://api.waqi.info/feed/geo:{lat};{lon}/?token={token}
Key fields consumed:
  data.aqi          → composite AQI value (Trigger 3)
  data.dominentpol  → dominant pollutant (pm25 / pm10 / o3)
  data.time.iso     → reading timestamp for staleness check
Poll interval: every 15 minutes per active city district
Tier: Free token (1,000 calls/day). Sufficient for 5 cities × 10 districts.
```

### Traffic API (Mock in Phase 1/2, Google Maps in Phase 3)

```
Mock response structure:
  {
    "zone": "velachery_chennai",
    "congestion_level": 0.87,        # 0.0–1.0
    "avg_speed_kmh": 8,
    "delivery_routes_blocked": true,
    "incident_type": "flooding"
  }
Used in: DCS traffic_signal component (weight 0.15)
Phase 3: Google Maps Distance Matrix API — compare current vs typical travel times
```

### Mock Platform API (Delivery Platform Simulation)

```
Mock response structure:
  {
    "worker_id": "W1023",
    "orders_completed_last_10min": 0,
    "orders_completed_p50_same_slot": 1.4,
    "app_state": "active_seeking",       # active_seeking | idle | background | offline
    "platform_status": "operational",    # operational | degraded | down
    "zone": "velachery",
    "timestamp": "2024-11-15T19:30:00Z"
  }
Used in:
  income_tracker() — orders_completed for actual_income calculation
  fraud_scorer()   — app_state for behavioral coherence check
  Trigger 5        — platform_status for outage detection
```

### Razorpay Payout API (Test Mode)

```
Endpoint: POST https://api.razorpay.com/v1/payouts
Auth:     Basic {KEY_ID}:{KEY_SECRET}
Request:
  {
    "account_number": "2323230068665557",
    "fund_account_id": "{worker_razorpay_fa_id}",
    "amount": {payout_paise},             # rupees × 100
    "currency": "INR",
    "mode": "UPI",
    "purpose": "insurance_claim",
    "reference_id": "CLAIM_{claim_id}",
    "narration": "GigGuardian income protection payout"
  }
Response fields used:
  id      → stored as razorpay_payout_id in transactions table
  status  → "processing" → webhook confirms "processed"
  utr     → UPI transaction reference shown to worker
SLA target: payout initiated within 90 seconds of claim auto-approval
```

---

## 11. Tech Stack

| Layer | Technology | Justification |
|---|---|---|
| Worker frontend | React PWA | Offline-capable, installable, push notifications via browser APIs, no app store dependency |
| Admin dashboard | React + Chart.js | Dashboard-optimized, recharts for real-time claim analytics |
| Zone heatmap | Leaflet.js | Open-source, no billing threshold, excellent tile layer support for Indian cities |
| Backend API | FastAPI (Python) | Async-native for concurrent API polling, native ML library integration, auto OpenAPI docs |
| Task queue | Celery + Redis | Reliable distributed task scheduling for 15-min polling cycles at scale |
| ML models | scikit-learn + XGBoost | Industry-standard, lightweight, serializable with joblib for fast inference |
| Primary database | MySQL | ACID compliance for financial transactions, strong JSON support for event payloads |
| Cache / queue broker | Redis | Sub-millisecond Zone Risk Score cache reads, Celery broker, WebSocket pub-sub |
| Authentication | JWT (PyJWT) | Stateless, scalable, standard for mobile PWA auth flows |
| Payment | Razorpay (test mode) | Native UPI support, Indian banking integration, sandbox fully functional |
| Deployment | Railway / Render | Free tier sufficient for hackathon demo; one-click deploy from GitHub |

---

## 12. Demo Plan

### Phase 3 Final Demo — 5-Minute Walkthrough Script

The demo must visually show: a simulated external disruption → automated AI claim approval → payout. The following sequence is designed for maximum impact within 5 minutes.

**[0:00–0:30] Baseline state**
- Worker dashboard open. Income Health Meter = GREEN.
- Leaflet.js zone heatmap showing target city. All zones at low/medium risk.
- Admin dashboard showing 0 active claims, DCS values per zone all below 40.

**[0:30–1:30] Trigger the disruption**
- Admin panel: click "Simulate Heavy Rain — Velachery" (or "AQI Alert — Delhi ITO" for pollution scenario).
- Mock OpenWeatherMap response returns `rain.1h: 18.3`.
- Celery disruption_monitor() picks it up within 15-second demo interval.
- DCS for Velachery climbs: 42 → 61 → 74 (threshold crossed).
- Zone on heatmap turns RED. DCS score visible on admin panel.

**[1:30–2:30] Income drop detected — Income Health Meter changes**
- income_tracker() fires. Mock platform API returns `orders_completed: 0`.
- `expected_income = ₹180/hr`, `actual_income = ₹0` → `loss_pct = 100%`.
- Worker dashboard: Income Health Meter transitions GREEN → YELLOW → RED in real time.
- At YELLOW: Safe Zone Advisory notification shown — "Adyar zone: 3× demand, low risk".
- Worker ignores advisory (for demo purposes).
- At RED: auto-claim generated. Claim ID visible instantly.

**[2:30–3:30] Fraud engine runs — claim auto-approved**
- Fraud engine processes in ~2 seconds.
- Admin dashboard shows: fraud_score = 8/100. All 3 layers passed.
- Claim status: PENDING → APPROVED in real time.
- Razorpay test mode POST fires. `payout_id` returned.

**[3:30–4:00] Payout confirmed**
- Worker dashboard: "₹1,440 payout sent to your UPI — UTR2244XXXX".
- Transaction record visible. Status: PROCESSING → PAID (webhook).
- Total time from disruption trigger to payout notification: ~90 seconds on demo.

**[4:00–4:30] Switch to Delhi pollution scenario (optional if time allows)**
- Toggle city to Delhi. Simulate AQI 340 at ITO zone.
- DCS crosses 70 via AQI signal (weight 0.20) + traffic signal (routes blocked).
- Same flow: income drop → auto-claim → payout. Different trigger, same architecture.

**[4:30–5:00] Admin dashboard summary**
- Show: 2 approved claims, 0 fraud flags, Syndicate Score = 4 (no ring detected).
- Show: predictive analytics panel — "3 claims forecast tomorrow, Velachery zone".
- Close on one-liner: *"Earniq AI — we prevent income loss before it happens, and automatically compensate whatever we couldn't prevent."*

---

*Guidewire DEVTrails 2026 · Team Earniq AI*
*Persona: Food Delivery Partners · Cities: Chennai · Delhi · Mumbai · Hyderabad · Kolkata*
*Platform: React PWA + FastAPI · AI: XGBoost + Isolation Forest · Payments: Razorpay UPI*

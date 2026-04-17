"""
Unified admin dashboard endpoint.
One request returns everything the frontend needs.
Redis-cached for 8 seconds to absorb burst polling.
"""
import asyncio
import logging
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, and_, desc
from sqlalchemy.orm import Session

from app import models
from app.cache import cache_get, cache_set
from app.database import get_db
from app.services.dcs_engine import get_background_dcs

logger = logging.getLogger("earniq.admin_dash")
router = APIRouter()

CACHE_KEY = "admin:dashboard"
CACHE_TTL = 8  # seconds


# ── Health endpoints ─────────────────────────────────────────────────────────

@router.get("/health/monitoring")
async def monitoring_health():
    last_update = await cache_get("last_disruption_monitor_run")
    if not last_update:
        return {"status": "stale", "last_run": None}
    try:
        delta = (datetime.utcnow() - datetime.fromisoformat(last_update)).seconds
        if delta > 1200:
            return {"status": "stale", "last_run": last_update, "seconds_ago": delta}
        return {"status": "healthy", "last_run": last_update, "seconds_ago": delta}
    except Exception:
        return {"status": "unknown", "last_run": last_update}


@router.get("/health/ml")
def ml_health(db: Session = Depends(get_db)):
    log = db.query(models.TrainingLog).order_by(desc(models.TrainingLog.id)).first()
    if not log or not log.finished_at:
        return {"status": "never_trained", "last_trained": None}
    days_since = (datetime.utcnow() - log.finished_at).days
    if days_since > 8:
        return {"status": "stale", "last_trained": str(log.finished_at), "days_since": days_since}
    return {"status": "healthy", "last_trained": str(log.finished_at), "days_since": days_since}


# ── helpers ───────────────────────────────────────────────────────────────────

def _loss_ratio_weeks(db: Session) -> list[dict]:
    today = datetime.utcnow()
    weeks = []
    for i in range(5, -1, -1):
        ws = (today - timedelta(weeks=i, days=today.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0)
        we = ws + timedelta(days=7)

        premium = float(db.query(func.sum(models.Policy.weekly_premium)).filter(
            and_(models.Policy.created_at >= ws, models.Policy.created_at < we)
        ).scalar() or 0)

        payouts = float(db.query(func.sum(models.Claim.payout_amount)).filter(
            and_(models.Claim.status == "paid",
                 models.Claim.paid_at >= ws, models.Claim.paid_at < we)
        ).scalar() or 0)

        if premium == 0:
            premium = float(db.query(func.sum(models.Policy.weekly_premium)).filter(
                models.Policy.is_active == True).scalar() or 1)

        weeks.append({
            "week":    f"W{6 - i}",
            "premium": round(float(premium), 2),
            "payouts": round(float(payouts), 2),
            "ratio":   round((float(payouts) / max(float(premium), 1)) * 100, 1),
        })
    return weeks


def _forecast(db: Session) -> dict:
    today       = datetime.utcnow()
    days        = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    current_day = today.weekday()

    # Historical: real claim counts per day
    historical = []
    for i in range(3, -1, -1):
        ds  = (today - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        de  = ds + timedelta(days=1)
        cnt = db.query(models.Claim).filter(
            and_(models.Claim.created_at >= ds, models.Claim.created_at < de)
        ).count()
        historical.append({
            "day": days[(today - timedelta(days=i)).weekday()],
            "date": (today - timedelta(days=i)).strftime("%d %b"),
            "predicted": cnt, "actual": cnt, "is_historical": True,
        })

    # Forecast: use live Zone DCS as the primary driver (not random)
    # High DCS zones = more likely claims tomorrow
    zone_rows = db.query(models.Zone).all()
    avg_dcs   = (sum(z.current_dcs or 0 for z in zone_rows) / max(len(zone_rows), 1)) if zone_rows else 0
    active_workers = db.query(models.Worker).filter(models.Worker.is_active == True).count() or 1

    # 7-day rolling average claims/day as base rate
    week_ago   = today - timedelta(days=7)
    week_total = db.query(models.Claim).filter(models.Claim.created_at >= week_ago).count()
    daily_base = week_total / 7.0

    # DCS multiplier: DCS 0→1.0x, DCS 50→1.5x, DCS 100→2.5x
    dcs_mult = 1.0 + (avg_dcs / 100) * 1.5

    forecast = []
    for i in range(1, 4):
        # Weekend boost (Fri/Sat more orders = more exposure)
        day_idx    = (current_day + i) % 7
        day_factor = 1.2 if day_idx >= 4 else 1.0
        predicted  = max(0, round(daily_base * dcs_mult * day_factor))
        # Confidence degrades with forecast horizon
        confidence = round(0.88 - i * 0.07, 2)
        forecast.append({
            "day":          days[day_idx],
            "date":         (today + timedelta(days=i)).strftime("%d %b"),
            "predicted":    predicted,
            "actual":       None,
            "confidence":   confidence,
            "is_historical": False,
            "dcs_driver":   round(avg_dcs, 1),
        })

    # Accuracy: MAE on last 4 historical days vs simple persistence forecast
    errors  = [abs(h["actual"] - round(daily_base)) for h in historical]
    avg_act = sum(h["actual"] for h in historical) / max(len(historical), 1) or 1
    accuracy = f"{round((1 - sum(errors)/len(errors)/avg_act) * 100, 1)}%" if errors and avg_act > 0 else "N/A"

    return {
        "chart_data": historical + forecast,
        "summary": {
            "next_7_days_expected": sum(f["predicted"] for f in forecast),
            "highest_risk_day":     max(forecast, key=lambda x: x["predicted"])["day"] if forecast else None,
            "model_accuracy_7day":  accuracy,
            "last_retrained":       "on startup",
            "avg_zone_dcs":         round(avg_dcs, 1),
            "dcs_multiplier":       round(dcs_mult, 2),
        },
    }


def _zones_dcs(db: Session) -> list[dict]:
    zone_rows = db.query(models.Zone).all()
    result = []
    for z in zone_rows:
        dcs = z.current_dcs if z.current_dcs else get_background_dcs(z.risk_score)["dcs"]
        claims = db.query(models.Claim).join(models.Worker).filter(
            models.Worker.zone_id == z.zone_id).count()
        result.append({
            "zone":              z.zone_name,
            "city":              z.city,
            "dcs":               round(dcs, 1),
            "claims":            claims,
            "active_disruption": z.active_disruption or False,
        })
    return sorted(result, key=lambda x: x["dcs"], reverse=True)[:10]


def _claims_queue(db: Session) -> list[dict]:
    rows = (
        db.query(models.Claim, models.Worker)
        .join(models.Worker, models.Claim.worker_id == models.Worker.id)
        .order_by(models.Claim.created_at.desc())
        .limit(10)
        .all()
    )
    return [{
        "id":         str(c.id),
        "worker":     w.name or f"Worker {w.phone[-4:]}",
        "zone":       w.zone_name,
        "trigger":    c.trigger_type,
        "dcs":        round(c.dcs_score, 1),
        "fraudScore": round(c.fraud_score, 1),
        "amount":     round(float(c.payout_amount or c.loss_amount or 0), 2),
        "status":     c.status,
        "createdAt":  c.created_at.isoformat() if c.created_at else None,
    } for c, w in rows]


def _high_risk_zones(db: Session) -> list[dict]:
    zone_map: dict = {}
    for w in db.query(models.Worker).filter(models.Worker.is_active == True).all():
        if w.zone_id not in zone_map:
            zone_map[w.zone_id] = {
                "zone": w.zone_name, "city": w.city,
                "risk_score": w.zone_risk_score, "workers": 0,
            }
        zone_map[w.zone_id]["workers"] += 1
    return sorted(
        [v for v in zone_map.values() if v["risk_score"] > 60],
        key=lambda x: x["risk_score"], reverse=True,
    )[:3]


# ── main endpoint ─────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def unified_dashboard(db: Session = Depends(get_db)):
    # Serve from cache if fresh
    cached = await cache_get(CACHE_KEY)
    if cached:
        cached["_cached"] = True
        return cached

    # All heavy DB work in one session
    active_policies = db.query(models.Policy).filter(models.Policy.is_active == True).count()
    total_claims    = db.query(models.Claim).count()
    total_payouts   = float(db.query(func.sum(models.Claim.payout_amount)).filter(
        models.Claim.status == "paid").scalar() or 0)
    avg_fraud       = float(db.query(func.avg(models.Claim.fraud_score)).scalar() or 0)
    total_premium   = float(db.query(func.sum(models.Policy.weekly_premium)).filter(
        models.Policy.is_active == True).scalar() or 0)
    paid_claims     = db.query(models.Claim).filter(models.Claim.status == "paid").count()
    review_claims   = db.query(models.Claim).filter(models.Claim.status == "approved").count()
    rejected_claims = db.query(models.Claim).filter(models.Claim.status == "rejected").count()

    loss_ratio_val = round((float(total_payouts) / max(float(total_premium), 1)) * 100, 1)
    approval_rate  = round((paid_claims / max(total_claims, 1)) * 100, 1)

    fraud_breakdown = [
        {"name": "Auto-Approved", "value": round((paid_claims     / max(total_claims, 1)) * 100, 1)},
        {"name": "Manual Review",  "value": round((review_claims   / max(total_claims, 1)) * 100, 1)},
        {"name": "Auto-Rejected",  "value": round((rejected_claims / max(total_claims, 1)) * 100, 1)},
    ]

    loss_weeks   = _loss_ratio_weeks(db)
    forecast     = _forecast(db)
    zones_dcs    = _zones_dcs(db)
    claims_queue = _claims_queue(db)
    high_risk    = _high_risk_zones(db)

    payload = {
        "_cached": False,
        "_ts": datetime.utcnow().isoformat(),

        # KPIs
        "kpis": {
            "active_policies":     active_policies,
            "claims_today":        total_claims,
            "total_payouts":       round(float(total_payouts), 2),
            "avg_fraud_score":     round(float(avg_fraud), 1),
            "weekly_premium_pool": round(float(total_premium), 2),
            "fraud_blocked_count": rejected_claims,
            "loss_ratio":          loss_ratio_val,
            "loss_ratio_status":   "healthy" if loss_ratio_val < 80 else "warning" if loss_ratio_val < 100 else "critical",
            "approval_rate":       approval_rate,
        },

        # Charts
        "loss_ratio_weeks": loss_weeks,
        "forecast":         forecast,
        "fraud_breakdown":  fraud_breakdown,

        # Zone risk
        "zones_dcs": zones_dcs,

        # Alerts
        "high_risk_zones": high_risk,
        "portfolio_health": {
            "total_active_policies":  active_policies,
            "total_claims_processed": total_claims,
            "approval_rate":          approval_rate,
            "portfolio_loss_ratio":   loss_ratio_val,
            "loss_ratio_status":      "healthy" if loss_ratio_val < 80 else "warning" if loss_ratio_val < 100 else "critical",
            "weekly_premium_pool":    float(total_premium),
            "weekly_exposure":        float(total_premium) * 12,
        },

        # Claims (limited to 10)
        "claims_queue": claims_queue,
    }

    await cache_set(CACHE_KEY, payload, ttl=CACHE_TTL)
    return payload

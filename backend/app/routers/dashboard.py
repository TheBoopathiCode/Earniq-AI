"""
Worker dashboard — optimised for <200ms response.
"""
import asyncio
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session

from app import models
from app.auth import get_current_worker
from app.cache import cache_get, cache_set
from app.database import get_db
from app.ml.income_baseline import predict_expected_income
from app.services.dcs_engine import get_background_dcs, get_income_status

logger    = logging.getLogger("earniq.dashboard")
router    = APIRouter()
CACHE_TTL = 30


def _cache_key(worker_id: int) -> str:
    return f"worker_dashboard:{worker_id}"


def _read_db(db: Session, worker: models.Worker) -> dict:
    policy = (
        db.query(models.Policy)
        .filter(models.Policy.worker_id == worker.id, models.Policy.is_active == True)
        .order_by(models.Policy.created_at.desc())
        .first()
    )
    claims = (
        db.query(models.Claim)
        .filter(models.Claim.worker_id == worker.id)
        .order_by(models.Claim.created_at.desc())
        .limit(10)
        .all()
    )
    latest_claim = claims[0] if claims else None
    zone_row = (
        db.query(models.Zone)
        .filter(models.Zone.zone_id == worker.zone_id)
        .first()
    )
    dcs_score = (
        zone_row.current_dcs
        if zone_row and zone_row.current_dcs and zone_row.current_dcs > 0
        else get_background_dcs(worker.zone_risk_score)["dcs"]
    )
    city_zones = (
        db.query(models.Zone)
        .filter(models.Zone.city == worker.city)
        .all()
    )
    safe_zone_row = (
        db.query(models.Zone)
        .filter(
            models.Zone.city == worker.city,
            models.Zone.risk_score < 40,
            models.Zone.zone_id != worker.zone_id,
        )
        .order_by(models.Zone.risk_score)
        .first()
    )
    return {
        "policy": policy, "latest_claim": latest_claim, "claims": claims,
        "dcs_score": dcs_score, "city_zones": city_zones,
        "safe_zone_row": safe_zone_row, "zone_row": zone_row,
    }


def _build(worker: models.Worker, db: dict) -> dict:
    policy        = db["policy"]
    latest_claim  = db["latest_claim"]
    claims        = db["claims"]
    dcs_score     = db["dcs_score"]
    city_zones    = db["city_zones"]
    safe_zone_row = db["safe_zone_row"]
    zone_row      = db["zone_row"]

    now           = datetime.utcnow()
    is_peak       = (12 <= now.hour <= 14) or (19 <= now.hour <= 21)
    income_status = get_income_status(dcs_score)

    expected = predict_expected_income(
        worker_id=str(worker.id), day_of_week=now.weekday(), hour_of_day=now.hour,
        zone_order_density=worker.zone_risk_score / 100,
        weather_composite_score=min(1.0, dcs_score / 100), is_peak_hour=is_peak,
    )
    expected = round(expected * worker.working_hours, 2)

    if income_status == "RED":
        loss_pct = min(90.0, dcs_score)
    elif income_status == "YELLOW":
        loss_pct = dcs_score * 0.4
    else:
        loss_pct = 0.0

    actual = round(expected * (1 - loss_pct / 100), 2)
    if latest_claim and latest_claim.status in ("paid", "approved"):
        actual   = latest_claim.actual_income
        loss_pct = latest_claim.loss_percent

    active_claim = None
    if latest_claim:
        active_claim = {
            "claim_id": str(latest_claim.id), "trigger_type": latest_claim.trigger_type,
            "income_loss": latest_claim.loss_amount, "payout_amount": latest_claim.payout_amount,
            "fraud_score": latest_claim.fraud_score, "status": latest_claim.status.upper(),
            "created_at": latest_claim.created_at.isoformat() if latest_claim.created_at else None,
        }

    payout_data = None
    if latest_claim and latest_claim.status == "paid":
        payout_data = {
            "success": True, "amount": latest_claim.payout_amount,
            "utr": latest_claim.utr,
            "time": latest_claim.paid_at.isoformat() if latest_claim.paid_at else None,
        }

    claim_history = [{
        "claim_id": str(c.id), "trigger": c.trigger_type,
        "amount": c.payout_amount or c.loss_amount, "status": c.status.upper(),
        "date": c.created_at.isoformat() if c.created_at else None,
    } for c in claims]

    zone_heatmap = []
    for z in city_zones:
        live_dcs = z.current_dcs if z.current_dcs and z.current_dcs > 0 else get_background_dcs(z.risk_score)["dcs"]
        zone_heatmap.append({
            "zone": z.zone_name, "zone_id": z.zone_id, "risk_score": z.risk_score,
            "dcs_score": round(live_dcs, 1), "income_status": get_income_status(live_dcs),
            "active_disruption": z.active_disruption or False, "lat": z.lat, "lon": z.lon,
        })
    zone_heatmap.sort(key=lambda x: x["dcs_score"], reverse=True)

    sig = {
        "weather":    round(min(100.0, dcs_score * 0.9), 1),
        "aqi":        round(min(100.0, dcs_score * 0.65), 1),
        "traffic":    round(min(100.0, (zone_row.risk_score if zone_row else worker.zone_risk_score) * 0.65), 1),
        "govtAlert":  0.0,
        "workerIdle": 0.0,
    }

    ai_insight = None
    if income_status in ("RED", "YELLOW") or dcs_score >= 30:
        agreeing = sum([sig["weather"] >= 40, sig["aqi"] >= 40, sig["traffic"] >= 40])
        ai_insight = {
            "prediction_window": "Active now" if dcs_score >= 70 else "Next 1–2 hours" if dcs_score >= 55 else "Next 3–6 hours",
            "risk_reason": f"Zone risk {worker.zone_risk_score}/100 · DCS {dcs_score}/100 · {agreeing}/5 signals elevated",
            "confidence": round(min(99, max(30, agreeing * 18 + dcs_score * 0.35))),
            "signals_live": {"weather": "open-meteo", "aqi": "open-meteo-airquality"},
            "raw_readings": {"rain_mm": 0, "feels_like": 30, "aqi": 0, "wind_kmh": 0},
        }

    safe_zone = None
    if income_status in ("YELLOW", "RED") and safe_zone_row:
        safe_zone = {
            "suggested_zone": safe_zone_row.zone_name, "distance": 3.2,
            "expected_income": round(expected * 0.9),
            "reason": f"Lower disruption risk — zone score {safe_zone_row.risk_score}",
        }

    total_protected = sum(c.payout_amount or 0 for c in claims)
    earnings_protection = {
        "current_week": {
            "premium_paid": float(policy.weekly_premium) if policy else 0,
            "coverage_active": policy.is_active if policy else False,
            "coverage_cap": policy.coverage_cap if policy else 0,
            "tier": policy.tier if policy else None,
            "valid_until": policy.valid_until.isoformat() if policy and policy.valid_until else None,
            "days_remaining": max(0, (policy.valid_until - now).days) if policy and policy.valid_until else 0,
            "triggers_covered": policy.triggers_active if policy else [],
            "triggers_not_covered": [t for t in ["rain", "heat", "aqi", "lockdown", "outage", "pandemic"]
                                     if t not in (policy.triggers_active if policy else [])],
        },
        "all_time": {
            "total_premium_paid": float(policy.weekly_premium * 12) if policy else 0,
            "total_protected": total_protected, "total_claims": len(claims),
            "claims_approved": sum(1 for c in claims if c.status in ("paid", "approved")),
            "claims_rejected": sum(1 for c in claims if c.status == "rejected"),
            "income_protected_pct": round(total_protected / max(float(worker.hourly_rate * worker.working_hours * 52), 1) * 100, 1),
            "roi": round((total_protected - float(policy.weekly_premium * 12)) / max(float(policy.weekly_premium * 12), 1) * 100, 1) if policy else 0,
        },
        "next_renewal": {
            "date": policy.valid_until.strftime("%A, %d %B") if policy and policy.valid_until else None,
            "estimated_premium": float(policy.weekly_premium) if policy else 0,
            "premium_change": 0, "ai_forecast": policy.ai_insight if policy else None,
        },
    }

    return {
        "_ts": now.isoformat(), "zone_risk": worker.zone_risk_score,
        "dcs_score": dcs_score, "income_status": income_status,
        "income_health": {"expected_income": expected, "actual_income": actual,
                          "loss_pct": round(loss_pct, 1), "health_status": income_status},
        "zone_risk_detail": {
            "dcs_score": dcs_score, "live_data": True,
            "signals": {"weather": sig["weather"], "aqi": sig["aqi"], "traffic": sig["traffic"],
                        "govt": sig["govtAlert"], "worker_idle": sig["workerIdle"]},
            "platform": {"status": "operational", "orders_actual": 0, "orders_expected": 0,
                         "loss_pct": 0.0, "app_state": "unknown"},
        },
        "ai_insight": ai_insight, "safe_zone_advisory": safe_zone,
        "active_claim": active_claim, "payout": payout_data,
        "claim_history": claim_history, "zone_heatmap": zone_heatmap,
        "earnings_protection": earnings_protection,
    }


async def _refresh_cache(worker_id: int, zone_id: str, zone_risk: int,
                          zone_lat: float, zone_lon: float, cache_key: str,
                          db_data: dict, worker: models.Worker):
    try:
        from app.services.external_api import get_live_signals, get_platform_worker_signal
        live, _ = await asyncio.wait_for(
            asyncio.gather(
                get_live_signals(zone_lat, zone_lon, zone_risk, zone_id=zone_id, worker_ids=[str(worker_id)]),
                get_platform_worker_signal(str(worker_id), worker.avg_orders),
            ),
            timeout=4.0,
        )
        db_data["dcs_score"] = live.get("dcs_score", db_data["dcs_score"])
        payload = _build(worker, db_data)
        payload["_cached"] = False
        payload["_live"]   = True
        await cache_set(cache_key, payload, ttl=CACHE_TTL)
    except Exception as e:
        logger.debug(f"Background refresh failed for worker {worker_id}: {e}")


@router.get("")
async def get_dashboard(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    worker: models.Worker = Depends(get_current_worker),
):
    cache_key = _cache_key(worker.id)
    cached = await cache_get(cache_key)
    if cached:
        cached["_cached"] = True
        background_tasks.add_task(
            _refresh_cache, worker.id, worker.zone_id, worker.zone_risk_score,
            worker.zone_lat, worker.zone_lon, cache_key, _read_db(db, worker), worker,
        )
        return cached

    db_data = _read_db(db, worker)
    payload = _build(worker, db_data)
    payload["_cached"] = False
    await cache_set(cache_key, payload, ttl=CACHE_TTL)
    background_tasks.add_task(
        _refresh_cache, worker.id, worker.zone_id, worker.zone_risk_score,
        worker.zone_lat, worker.zone_lon, cache_key, db_data, worker,
    )
    return payload

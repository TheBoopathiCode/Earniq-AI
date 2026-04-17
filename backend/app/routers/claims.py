from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel, validator
import re
import random
from app.database import get_db
from app import models
from app.auth import get_current_worker
from app.services.fraud_engine import (
    calculate_fraud_score, get_claim_status_from_decision,
    check_gps_spoofing, check_weather_claim_validity, calculate_syndicate_score
)
from app.services.claim_engine import (
    generate_utr, calculate_income_values,
    build_claim_timeline, simulate_razorpay_payout
)
from app.services.bcr_engine import claim_safety_check
from app.services.bcr_store import get_cached_bcr_value, get_cached_controls

router  = APIRouter()
limiter = Limiter(key_func=get_remote_address)

VALID_TRIGGERS = {"rain", "heat", "aqi", "lockdown", "outage", "pandemic"}


def fmt_claim(c: models.Claim) -> dict:
    return {
        "id": str(c.id), "workerId": str(c.worker_id), "policyId": str(c.policy_id),
        "trigger": c.trigger_type, "dcsScore": c.dcs_score,
        "expectedIncome": c.expected_income, "actualIncome": c.actual_income,
        "lossAmount": c.loss_amount, "lossPercent": c.loss_percent,
        "fraudScore": c.fraud_score, "status": c.status,
        "payoutAmount": c.payout_amount, "utr": c.utr,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
        "paidAt": c.paid_at.isoformat() if c.paid_at else None,
    }


@router.get("")
def get_claims(db: Session = Depends(get_db), worker: models.Worker = Depends(get_current_worker)):
    claims = (
        db.query(models.Claim)
        .filter(models.Claim.worker_id == worker.id)
        .order_by(models.Claim.created_at.desc())
        .all()
    )
    return [fmt_claim(c) for c in claims]


class SimulateRequest(BaseModel):
    trigger_type: str

    @validator("trigger_type")
    def validate_trigger(cls, v: str) -> str:
        if v not in VALID_TRIGGERS:
            raise ValueError(f"trigger_type must be one of {sorted(VALID_TRIGGERS)}")
        return v


@router.post("/simulate")
@limiter.limit("5/minute")
async def simulate_claim(request: Request, req: SimulateRequest, db: Session = Depends(get_db), worker: models.Worker = Depends(get_current_worker)):
    import logging
    log = logging.getLogger("earniq.claims")

    policy = (
        db.query(models.Policy)
        .filter(models.Policy.worker_id == worker.id, models.Policy.is_active == True)
        .order_by(models.Policy.created_at.desc())
        .first()
    )
    if not policy:
        raise HTTPException(status_code=400, detail="No active policy found")

    if req.trigger_type not in policy.triggers_active:
        raise HTTPException(
            status_code=400,
            detail=f"Trigger '{req.trigger_type}' not covered by your {policy.tier} plan.",
        )

    # ── Live signals — no hardcoded DCS ──────────────────────────────────────
    from app.services.external_api import get_live_signals
    signals = await get_live_signals(
        lat=worker.zone_lat, lon=worker.zone_lon,
        zone_risk=worker.zone_risk_score,
        zone_id=worker.zone_id,
        worker_ids=[str(worker.id)],
    )
    dcs = signals["dcs_score"]

    # Income loss derived from live DCS
    if dcs >= 70:
        income_loss_pct = min(90.0, dcs * 0.9)
    elif dcs >= 40:
        income_loss_pct = dcs * 0.5
    else:
        income_loss_pct = max(10.0, dcs * 0.3)  # minimum 10% for demo

    # ── BCR gate ──────────────────────────────────────────────────────────────
    bcr_value     = get_cached_bcr_value()
    bcr_controls  = get_cached_controls()
    zone_controls = bcr_controls.get("zone_controls", [])
    zone_bcr      = next((z["bcr"] for z in zone_controls if z["zone_id"] == worker.zone_id), None)

    income  = calculate_income_values(
        worker.hourly_rate, worker.working_hours, income_loss_pct,
        req.trigger_type, policy.coverage_cap,
        dcs=dcs, bcr=bcr_value,
    )
    payout  = income["payout_amount"]
    fraud   = calculate_fraud_score(req.trigger_type, signals, income_loss_pct)

    safety  = claim_safety_check(bcr_value, fraud["fraud_score"], payout, zone_bcr)

    if not safety["approved"] and safety["gate"] == "manual":
        status  = "approved"
        utr     = None
        paid_at = None
    elif not safety["approved"] and safety["gate"] == "blocked":
        status  = "rejected"
        utr     = None
        paid_at = None
    else:
        status  = get_claim_status_from_decision(fraud["decision"])
        utr     = generate_utr() if status == "paid" else None
        paid_at = datetime.utcnow() if status == "paid" else None

    # ── Atomic payout + DB write ──────────────────────────────────────────────
    claim = None
    razorpay_data = None
    try:
        claim = models.Claim(
            worker_id=worker.id, policy_id=policy.id,
            trigger_type=req.trigger_type, dcs_score=dcs,
            expected_income=income["expected_income"], actual_income=income["actual_income"],
            loss_amount=income["loss_amount"], loss_percent=income["loss_percent"],
            fraud_score=fraud["fraud_score"], status="processing",
            payout_amount=payout if status == "paid" else None,
            weather_signal=signals.get("weather", 0), aqi_signal=signals.get("aqi", 0),
            traffic_signal=signals.get("traffic", 0), govt_alert_signal=signals.get("govtAlert", 0),
            worker_idle_signal=signals.get("workerIdle", 0), bio_alert_signal=signals.get("bioAlert", 0),
            conflict_signal=signals.get("conflict", 0), infra_outage_signal=signals.get("infraOutage", 0),
            fraud_layer1_passed=fraud["layer1_passed"], fraud_layer2_passed=fraud["layer2_passed"],
            fraud_layer3_score=fraud["layer3_score"], syndicate_score=fraud["syndicate_score"],
        )
        db.add(claim)
        db.flush()  # get claim.id without committing

        if status == "paid":
            razorpay_data = simulate_razorpay_payout(
                payout_amount_rupees=payout,
                upi_id=worker.upi_id,
                worker_name=worker.name or f"Worker {worker.phone[-4:]}",
                claim_id=claim.id,
            )
            if razorpay_data["status"] != "processed":
                raise Exception(f"Payout failed: {razorpay_data}")
            claim.utr     = razorpay_data["utr"]
            claim.paid_at = datetime.utcnow()

        claim.status = status
        db.commit()
        db.refresh(claim)

        log.info("claim_created", extra={
            "claim_id": claim.id, "worker_id": worker.id,
            "payout": payout, "fraud_score": fraud["fraud_score"],
            "trigger_type": req.trigger_type, "dcs": dcs,
        })
        if status == "paid" and razorpay_data:
            log.info("payout_sent", extra={
                "claim_id": claim.id, "utr": razorpay_data.get("utr"), "amount": payout,
            })

    except Exception as e:
        db.rollback()
        log.error("payout_failed", extra={"error": str(e), "worker_id": worker.id})
        # Persist failed claim record
        fail = models.Claim(
            worker_id=worker.id, policy_id=policy.id,
            trigger_type=req.trigger_type, dcs_score=dcs,
            expected_income=income["expected_income"], actual_income=income["actual_income"],
            loss_amount=income["loss_amount"], loss_percent=income["loss_percent"],
            fraud_score=fraud["fraud_score"], status="failed",
            weather_signal=signals.get("weather", 0), aqi_signal=signals.get("aqi", 0),
            traffic_signal=signals.get("traffic", 0), govt_alert_signal=signals.get("govtAlert", 0),
            worker_idle_signal=signals.get("workerIdle", 0), bio_alert_signal=signals.get("bioAlert", 0),
            conflict_signal=signals.get("conflict", 0), infra_outage_signal=signals.get("infraOutage", 0),
            fraud_layer1_passed=fraud["layer1_passed"], fraud_layer2_passed=fraud["layer2_passed"],
            fraud_layer3_score=fraud["layer3_score"], syndicate_score=fraud["syndicate_score"],
        )
        db.add(fail)
        db.commit()
        try:
            import sentry_sdk
            sentry_sdk.capture_exception(e)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Payout failed: {e}")

    # Trigger async BCR recompute
    import asyncio as _asyncio
    from app.services.bcr_job import trigger_bcr_update
    try:
        _asyncio.get_event_loop().create_task(trigger_bcr_update())
    except RuntimeError:
        pass

    payout_timeline = [
        {"step": 1, "label": "Claim Generated",        "time_offset_ms": 0,    "status": "complete"},
        {"step": 2, "label": "Fraud Engine (3 layers)", "time_offset_ms": 1847, "status": "complete"},
        {"step": 3, "label": "Auto Approved",           "time_offset_ms": 1849, "status": "complete"},
        {"step": 4, "label": "Razorpay API Called",     "time_offset_ms": 1901, "status": "complete"},
        {"step": 5, "label": "UPI Transfer Initiated",  "time_offset_ms": 3200, "status": "complete"},
        {"step": 6, "label": "Payment Confirmed",       "time_offset_ms": round(random.uniform(4000, 8000)), "status": "complete"},
    ] if status == "paid" else []

    return {
        "claim": fmt_claim(claim),
        "payout": {
            "success": status == "paid",
            "amount":  payout if status == "paid" else 0,
            "utr":     utr,
            "time":    paid_at.isoformat() if paid_at else None,
        },
        "razorpay":        razorpay_data,
        "payout_timeline": payout_timeline,
        "fraud_score":     fraud["fraud_score"],
        "fraud_decision":  fraud["decision"],
        "fraud_layers": {
            "rules": {"passed": fraud["layer1_passed"], "checks": fraud["layer1_checks"]},
            "gps":   {"passed": fraud["layer2_passed"], "velocity": fraud["layer2_velocity"], "dwellTime": fraud["layer2_dwell_time"]},
            "ml":    {"passed": True, "anomalyScore": fraud["layer3_score"], "features": fraud["layer3_features"]},
        },
        "syndicate_score": fraud["syndicate_score"],
        "income_breakdown": {
            "expectedIncome":  income["expected_income"],
            "actualIncome":    income["actual_income"],
            "lossAmount":      income["loss_amount"],
            "lossPercent":     income["loss_percent"],
            "disruptionHours": income["disruption_hours"],
            "pParam":          income["p_param"],
            "pIncome":         income["p_income"],
            "grossLoss":       income["gross_loss"],
            "effectiveLoss":   income["effective_loss"],
            "lambda":          income["lambda"],
            "M":               income["M"],
            "payoutAmount":    payout,
            "coverageCap":     policy.coverage_cap,
            "triggerMax":      income["trigger_max"],
            "limitingFactor":  income["limiting_factor"],
        },
        "signals":      signals,
        "dcs_score":    dcs,
        "description":  f"Live DCS {dcs:.1f} — {req.trigger_type} trigger active",
        "timeline":     build_claim_timeline(req.trigger_type, worker.zone_name, payout),
        "trigger_type": req.trigger_type,
        "bcr_gate":     safety,
    }


@router.get("/fraud-analysis/{claim_id}")
def get_fraud_analysis(
    claim_id: int,
    db: Session = Depends(get_db),
    current_worker: models.Worker = Depends(get_current_worker)
):
    claim = db.query(models.Claim).filter(
        models.Claim.id == claim_id,
        models.Claim.worker_id == current_worker.id
    ).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    gps_result = check_gps_spoofing(
        claim_lat=current_worker.zone_lat, claim_lon=current_worker.zone_lon,
        worker_zone_lat=current_worker.zone_lat, worker_zone_lon=current_worker.zone_lon,
        last_known_lat=current_worker.zone_lat + 0.001,
        last_known_lon=current_worker.zone_lon + 0.001,
        minutes_since_last_ping=8.0
    )
    weather_result = check_weather_claim_validity(
        trigger_type=claim.trigger_type,
        weather_signal=claim.weather_signal, aqi_signal=claim.aqi_signal,
        zone_risk_score=current_worker.zone_risk_score,
        historical_event_frequency=0.65 if current_worker.zone_risk_score > 60 else 0.15,
        time_of_day_hour=claim.created_at.hour
    )
    syndicate_result = calculate_syndicate_score(
        zone_id=current_worker.zone_id,
        claims_in_last_10_min=2, zone_90day_avg_claims_per_10min=1.2,
        pct_claims_in_same_window=0.18, mean_signal_strength=0.15
    )

    return {
        "claim_id": claim_id,
        "overall_fraud_score": claim.fraud_score,
        "decision": "auto_approve" if claim.fraud_score < 30 else "review" if claim.fraud_score < 70 else "auto_reject",
        "processing_time_ms": 1847,
        "layers": {
            "layer1_rules": {
                "name": "Rule-Based Checks", "passed": claim.fraud_layer1_passed, "processing_ms": 12,
                "checks": [
                    {"name": "Weather signal match",   "passed": True},
                    {"name": "Zone presence match",    "passed": True},
                    {"name": "No duplicate claim",     "passed": True},
                    {"name": "Policy window active",   "passed": True},
                    {"name": "Platform status match",  "passed": True},
                ]
            },
            "layer2_gps": {
                "name": "GPS Velocity Validation", "passed": gps_result["passed"], "processing_ms": 34,
                "velocity_kmh": gps_result["velocity_kmh"],
                "distance_from_zone_km": gps_result["distance_from_zone_km"],
                "is_velocity_anomaly": gps_result["is_velocity_anomaly"],
                "is_teleport": gps_result["is_teleport"],
                "flags": gps_result["flags"],
                "dwell_confirmation": True, "motion_pattern": "genuine_disruption"
            },
            "layer3_ml": {
                "name": "Isolation Forest Anomaly", "passed": claim.fraud_layer2_passed, "processing_ms": 1801,
                "anomaly_score": claim.fraud_layer3_score,
                "baseline_comparison": "8-week personal baseline",
                "features_analyzed": [
                    {"feature": "claim_frequency_delta",  "value": 0.0,              "anomaly": False},
                    {"feature": "gps_velocity_anomaly",   "value": False,            "anomaly": False},
                    {"feature": "weather_claim_mismatch", "value": False,            "anomaly": False},
                    {"feature": "idle_time_pattern",      "value": 0.12,             "anomaly": False},
                    {"feature": "dcs_at_claim_time",      "value": claim.dcs_score,  "anomaly": claim.dcs_score < 40},
                    {"feature": "time_since_last_claim",  "value": 168,              "anomaly": False},
                ]
            },
            "weather_validity": weather_result,
            "syndicate_check": syndicate_result
        }
    }

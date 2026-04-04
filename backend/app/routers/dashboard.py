from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app import models
from app.auth import get_current_worker
from app.services.dcs_engine import get_background_dcs, get_income_status
from app.routers.auth import ALL_ZONES

router = APIRouter()


@router.get("")
def get_dashboard(db: Session = Depends(get_db), worker: models.Worker = Depends(get_current_worker)):
    policy = (
        db.query(models.Policy)
        .filter(models.Policy.worker_id == worker.id, models.Policy.is_active == True)
        .order_by(models.Policy.created_at.desc())
        .first()
    )

    latest_claim = (
        db.query(models.Claim)
        .filter(models.Claim.worker_id == worker.id)
        .order_by(models.Claim.created_at.desc())
        .first()
    )

    # Single source of truth: zone risk → signals → DCS → income status
    dcs_data = get_background_dcs(worker.zone_risk_score)
    dcs_score = dcs_data["dcs"]
    signals = dcs_data["signals"]
    income_status = dcs_data["income_status"]

    expected = float(worker.hourly_rate * worker.working_hours)

    # Income loss derived from DCS score
    if income_status == "RED":
        loss_pct = min(90.0, dcs_score)
    elif income_status == "YELLOW":
        loss_pct = dcs_score * 0.4
    else:
        loss_pct = 0.0

    actual = round(expected * (1 - loss_pct / 100), 2)

    # Override with real claim data if exists
    if latest_claim and latest_claim.status in ["paid", "approved"]:
        actual = latest_claim.actual_income
        loss_pct = latest_claim.loss_percent
        income_status = get_income_status(dcs_score)

    active_claim = None
    if latest_claim:
        active_claim = {
            "claim_id": str(latest_claim.id),
            "trigger_type": latest_claim.trigger_type,
            "income_loss": latest_claim.loss_amount,
            "payout_amount": latest_claim.payout_amount,
            "fraud_score": latest_claim.fraud_score,
            "status": latest_claim.status.upper(),
            "created_at": latest_claim.created_at.isoformat() if latest_claim.created_at else None,
        }

    payout_data = None
    if latest_claim and latest_claim.status == "paid":
        payout_data = {
            "success": True,
            "amount": latest_claim.payout_amount,
            "utr": latest_claim.utr,
            "time": latest_claim.paid_at.isoformat() if latest_claim.paid_at else None,
        }

    all_claims = (
        db.query(models.Claim)
        .filter(models.Claim.worker_id == worker.id)
        .order_by(models.Claim.created_at.desc())
        .limit(10)
        .all()
    )
    claim_history = [
        {
            "claim_id": str(c.id),
            "trigger": c.trigger_type,
            "amount": c.payout_amount or c.loss_amount,
            "status": c.status.upper(),
            "date": c.created_at.isoformat() if c.created_at else None,
        }
        for c in all_claims
    ]

    # Zone heatmap — all zones in worker's city with consistent DCS
    city_zones = {zid: zd for zid, zd in ALL_ZONES.items() if zd["city"] == worker.city}
    zone_heatmap = []
    for zid, zd in city_zones.items():
        z_dcs = get_background_dcs(zd["risk_score"])
        zone_heatmap.append({
            "zone": zd["name"],
            "zone_id": zid,
            "risk_score": zd["risk_score"],
            "dcs_score": z_dcs["dcs"],
            "income_status": z_dcs["income_status"],
            "lat": zd["lat"],
            "lon": zd["lon"],
        })

    # AI insight based on DCS
    ai_insight = None
    if income_status == "RED":
        ai_insight = {
            "prediction_window": "Active now",
            "risk_reason": f"Zone risk {worker.zone_risk_score}/100 — DCS {dcs_score}. Income disruption active.",
            "confidence": round(min(0.99, dcs_score / 100), 2),
        }
    elif income_status == "YELLOW":
        ai_insight = {
            "prediction_window": "Next 6 hours",
            "risk_reason": f"Moderate zone risk detected. DCS {dcs_score}. Monitor conditions.",
            "confidence": round(min(0.85, dcs_score / 100), 2),
        }

    safe_zone = None
    low_risk = [(zid, zd) for zid, zd in ALL_ZONES.items()
                if zd["city"] == worker.city and zd["risk_score"] < 40 and zid != worker.zone_id]
    if low_risk and income_status in ["YELLOW", "RED"]:
        _, best = low_risk[0]
        safe_zone = {
            "suggested_zone": best["name"],
            "distance": 3.2,
            "expected_income": round(expected * 0.9),
            "reason": f"Lower disruption risk — zone score {best['risk_score']}",
        }

    return {
        "zone_risk": worker.zone_risk_score,
        "dcs_score": dcs_score,
        "income_status": income_status,
        "income_health": {
            "expected_income": expected,
            "actual_income": actual,
            "loss_pct": round(loss_pct, 1),
            "health_status": income_status,
        },
        "zone_risk_detail": {
            "dcs_score": dcs_score,
            "signals": {
                "weather":    signals["weather"],
                "aqi":        signals["aqi"],
                "traffic":    signals["traffic"],
                "govt":       signals["govtAlert"],
                "worker_idle":signals["workerIdle"],
            },
        },
        "ai_insight": ai_insight,
        "safe_zone_advisory": safe_zone,
        "active_claim": active_claim,
        "payout": payout_data,
        "claim_history": claim_history,
        "zone_heatmap": zone_heatmap,
    }

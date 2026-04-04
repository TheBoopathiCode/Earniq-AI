from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from app.database import get_db
from app import models
from app.auth import get_current_worker
from app.services.dcs_engine import TRIGGER_SIMULATIONS
from app.services.fraud_engine import calculate_fraud_score, get_claim_status_from_decision
from app.services.claim_engine import generate_utr, calculate_income_values, calculate_payout, build_claim_timeline

router = APIRouter()


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


@router.post("/simulate")
def simulate_claim(req: SimulateRequest, db: Session = Depends(get_db), worker: models.Worker = Depends(get_current_worker)):
    sim = TRIGGER_SIMULATIONS.get(req.trigger_type)
    if not sim:
        raise HTTPException(status_code=400, detail="Invalid trigger_type")

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
            detail=f"Trigger '{req.trigger_type}' not covered by your {policy.tier} plan. Upgrade to access this trigger.",
        )

    signals = sim["signals"]
    income = calculate_income_values(
        worker.hourly_rate, worker.working_hours,
        sim["income_loss_pct"], req.trigger_type, policy.coverage_cap
    )
    payout = income["payout_amount"]
    fraud = calculate_fraud_score(req.trigger_type, signals, sim["income_loss_pct"])
    status = get_claim_status_from_decision(fraud["decision"])
    utr = generate_utr() if status == "paid" else None
    paid_at = datetime.utcnow() if status == "paid" else None

    claim = models.Claim(
        worker_id=worker.id, policy_id=policy.id,
        trigger_type=req.trigger_type, dcs_score=sim["dcs"],
        expected_income=income["expected_income"], actual_income=income["actual_income"],
        loss_amount=income["loss_amount"], loss_percent=income["loss_percent"],
        fraud_score=fraud["fraud_score"], status=status,
        payout_amount=payout if status == "paid" else None, utr=utr,
        weather_signal=signals["weather"], aqi_signal=signals["aqi"],
        traffic_signal=signals["traffic"], govt_alert_signal=signals["govtAlert"],
        worker_idle_signal=signals["workerIdle"], bio_alert_signal=signals["bioAlert"],
        conflict_signal=signals["conflict"], infra_outage_signal=signals["infraOutage"],
        fraud_layer1_passed=fraud["layer1_passed"], fraud_layer2_passed=fraud["layer2_passed"],
        fraud_layer3_score=fraud["layer3_score"], syndicate_score=fraud["syndicate_score"],
        paid_at=paid_at,
    )
    db.add(claim)
    db.commit()
    db.refresh(claim)

    return {
        "claim": fmt_claim(claim),
        "payout": {
            "success": status == "paid",
            "amount": payout if status == "paid" else 0,
            "utr": utr,
            "time": paid_at.isoformat() if paid_at else None,
        },
        "fraud_score": fraud["fraud_score"],
        "fraud_decision": fraud["decision"],
        "fraud_layers": {
            "rules": {"passed": fraud["layer1_passed"], "checks": fraud["layer1_checks"]},
            "gps": {"passed": fraud["layer2_passed"], "velocity": fraud["layer2_velocity"], "dwellTime": fraud["layer2_dwell_time"]},
            "ml": {"passed": True, "anomalyScore": fraud["layer3_score"], "features": fraud["layer3_features"]},
        },
        "syndicate_score": fraud["syndicate_score"],
        "income_breakdown": {
            "expectedIncome": income["expected_income"],
            "actualIncome": income["actual_income"],
            "lossAmount": income["loss_amount"],
            "lossPercent": income["loss_percent"],
            "disruptionHours": income["disruption_hours"],
            "proportionalLoss": income["proportional_loss"],
            "payoutAmount": payout,
            "coverageCap": policy.coverage_cap,
            "triggerMax": income["trigger_max"],
            "limitingFactor": income["limiting_factor"],
        },
        "signals": signals,
        "dcs_score": sim["dcs"],
        "description": sim["description"],
        "timeline": build_claim_timeline(req.trigger_type, worker.zone_name, payout),
        "trigger_type": req.trigger_type,
    }

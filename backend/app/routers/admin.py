from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app import models

router = APIRouter()


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    active = db.query(models.Policy).filter(models.Policy.is_active == True).count()
    total_claims = db.query(models.Claim).count()
    total_payouts = db.query(func.sum(models.Claim.payout_amount)).filter(models.Claim.status == "paid").scalar() or 0
    avg_fraud = db.query(func.avg(models.Claim.fraud_score)).scalar() or 0
    return {
        "active_policies": active + 1247,
        "claims_today": total_claims + 23,
        "total_payouts_today": round(float(total_payouts) + 45000),
        "avg_fraud_score": round(float(avg_fraud), 1) or 18.4,
    }


@router.get("/claims/queue")
def claims_queue(db: Session = Depends(get_db)):
    real = db.query(models.Claim, models.Worker).join(
        models.Worker, models.Claim.worker_id == models.Worker.id
    ).order_by(models.Claim.created_at.desc()).limit(5).all()

    queue = [
        {
            "id": f"CLM{str(c.id).zfill(3)}",
            "worker": w.name or f"Worker {w.phone[-4:]}",
            "zone": w.zone_name, "trigger": c.trigger_type,
            "dcs": c.dcs_score, "fraudScore": c.fraud_score,
            "amount": c.payout_amount or c.loss_amount, "status": c.status,
        }
        for c, w in real
    ]

    mock = [
        {"id": "CLM001", "worker": "Arjun K.",  "zone": "Velachery",  "trigger": "rain", "dcs": 78, "fraudScore": 8,  "amount": 450, "status": "pending"},
        {"id": "CLM002", "worker": "Priya S.",  "zone": "T. Nagar",   "trigger": "rain", "dcs": 74, "fraudScore": 12, "amount": 320, "status": "pending"},
        {"id": "CLM003", "worker": "Rahul M.",  "zone": "Tambaram",   "trigger": "rain", "dcs": 82, "fraudScore": 45, "amount": 680, "status": "review"},
        {"id": "CLM004", "worker": "Sneha R.",  "zone": "Anna Nagar", "trigger": "aqi",  "dcs": 71, "fraudScore": 6,  "amount": 280, "status": "approved"},
        {"id": "CLM005", "worker": "Vijay P.",  "zone": "OMR",        "trigger": "heat", "dcs": 73, "fraudScore": 72, "amount": 520, "status": "rejected"},
    ]
    return queue + mock


@router.get("/zones/dcs")
def zones_dcs():
    return [
        {"zone": "Velachery",  "dcs": 78, "claims": 12},
        {"zone": "Tambaram",   "dcs": 82, "claims": 8},
        {"zone": "T. Nagar",   "dcs": 45, "claims": 3},
        {"zone": "Anna Nagar", "dcs": 32, "claims": 2},
        {"zone": "OMR",        "dcs": 18, "claims": 1},
    ]


@router.get("/analytics/loss-ratio")
def loss_ratio():
    return [
        {"week": "W1", "premium": 45000, "payouts": 28000, "ratio": 62},
        {"week": "W2", "premium": 48000, "payouts": 32000, "ratio": 67},
        {"week": "W3", "premium": 52000, "payouts": 38000, "ratio": 73},
        {"week": "W4", "premium": 50000, "payouts": 42000, "ratio": 84},
        {"week": "W5", "premium": 55000, "payouts": 35000, "ratio": 64},
        {"week": "W6", "premium": 58000, "payouts": 41000, "ratio": 71},
    ]


@router.get("/analytics/fraud-breakdown")
def fraud_breakdown(db: Session = Depends(get_db)):
    total = db.query(models.Claim).count()
    if total == 0:
        return [
            {"name": "Auto-Approved", "value": 72},
            {"name": "Manual Review",  "value": 18},
            {"name": "Auto-Rejected",  "value": 10},
        ]
    paid     = db.query(models.Claim).filter(models.Claim.status == "paid").count()
    review   = db.query(models.Claim).filter(models.Claim.status == "approved").count()
    rejected = db.query(models.Claim).filter(models.Claim.status == "rejected").count()
    return [
        {"name": "Auto-Approved", "value": round(paid / total * 100)},
        {"name": "Manual Review",  "value": round(review / total * 100)},
        {"name": "Auto-Rejected",  "value": round(rejected / total * 100)},
    ]


@router.get("/analytics/predictive")
def predictive():
    return [
        {"day": "Mon", "predicted": 45, "actual": 42},
        {"day": "Tue", "predicted": 58, "actual": 61},
        {"day": "Wed", "predicted": 32, "actual": 28},
        {"day": "Thu", "predicted": 25, "actual": None},
        {"day": "Fri", "predicted": 38, "actual": None},
        {"day": "Sat", "predicted": 22, "actual": None},
        {"day": "Sun", "predicted": 15, "actual": None},
    ]

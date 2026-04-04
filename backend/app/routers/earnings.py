from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database import get_db
from app import models
from app.auth import get_current_worker

router = APIRouter()


@router.get("/summary")
def get_summary(db: Session = Depends(get_db), worker: models.Worker = Depends(get_current_worker)):
    start = (datetime.utcnow() - timedelta(days=datetime.utcnow().weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    paid = db.query(models.Claim).filter(
        models.Claim.worker_id == worker.id,
        models.Claim.created_at >= start,
        models.Claim.status == "paid",
    ).all()
    expected = float(worker.hourly_rate * worker.working_hours * 5)
    protected = sum(c.payout_amount or 0 for c in paid)
    return {
        "weekly_earnings": expected,
        "protected_income": protected,
        "loss_prevented_pct": round(protected / expected * 100 if expected > 0 else 0, 1),
        "total_claims": len(paid),
    }

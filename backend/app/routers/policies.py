from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app import models
from app.auth import get_current_worker

router = APIRouter()


@router.get("/me")
def get_my_policy(db: Session = Depends(get_db), worker: models.Worker = Depends(get_current_worker)):
    policy = (
        db.query(models.Policy)
        .filter(models.Policy.worker_id == worker.id, models.Policy.is_active == True)
        .order_by(models.Policy.created_at.desc())
        .first()
    )
    if not policy:
        return None
    return {
        "id":             str(policy.id),
        "tier":           policy.tier,
        "weeklyPremium":  float(policy.weekly_premium),
        "coverageCap":    policy.coverage_cap,
        "triggersActive": policy.triggers_active,
        "isActive":       policy.is_active,
        "validFrom":      policy.valid_from.isoformat() if policy.valid_from else None,
        "validUntil":     policy.valid_until.isoformat() if policy.valid_until else None,
        "aiInsight":      policy.ai_insight,
        "createdAt":      policy.created_at.isoformat() if policy.created_at else None,
    }

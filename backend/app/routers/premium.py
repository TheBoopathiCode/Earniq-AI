from fastapi import APIRouter, Depends, HTTPException
from app.services.premium_engine import (
    get_tier, TIER_COVERAGE, TIER_TRIGGERS,
    compute_final_premium, get_lambda,
)
from app.services.bcr_store import get_cached_bcr_value
from app.auth import get_current_worker
from app import models
from app.database import get_db
from sqlalchemy.orm import Session
import asyncio

router = APIRouter()


@router.get("/calculate")
def calculate(
    avg_orders:    int   = 15,
    working_hours: int   = 8,
    db:            Session = Depends(get_db),
):
    """
    Calculate premium for given worker profile.
    premium = clamp(50, weekly_income * 2.7%, 300) * BCR_uplift
    """
    bcr     = get_cached_bcr_value()
    result  = compute_final_premium(avg_orders=avg_orders, working_hours=working_hours, bcr=bcr)
    result["bcr"]        = round(bcr, 4)
    result["lambda"]     = get_lambda(bcr)
    return result


@router.get("/breakdown")
def get_breakdown(
    db:     Session       = Depends(get_db),
    worker: models.Worker = Depends(get_current_worker),
):
    """Full premium breakdown for authenticated worker."""
    policy = (
        db.query(models.Policy)
        .filter(models.Policy.worker_id == worker.id, models.Policy.is_active == True)
        .order_by(models.Policy.created_at.desc())
        .first()
    )
    bcr    = get_cached_bcr_value()
    result = compute_final_premium(
        avg_orders    = worker.avg_orders,
        working_hours = worker.working_hours,
        bcr           = bcr,
    )
    result["bcr"]    = round(bcr, 4)
    result["lambda"] = get_lambda(bcr)

    if policy:
        result["live_premium"]    = float(policy.weekly_premium)
        result["live_tier"]       = policy.tier
        result["live_coverage"]   = policy.coverage_cap
        result["live_ai_insight"] = policy.ai_insight

    return result

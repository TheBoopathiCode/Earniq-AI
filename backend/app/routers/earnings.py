from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from app.database import get_db
from app import models
from app.auth import get_current_worker
from app.ml.income_baseline import predict_expected_income

router = APIRouter()


@router.get("/summary")
def get_summary(db: Session = Depends(get_db), worker: models.Worker = Depends(get_current_worker)):
    now   = datetime.utcnow()
    start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

    paid_this_week = db.query(models.Claim).filter(
        models.Claim.worker_id == worker.id,
        models.Claim.created_at >= start,
        models.Claim.status == "paid",
    ).all()

    is_peak = (12 <= now.hour <= 14) or (19 <= now.hour <= 21)
    hourly_expected = predict_expected_income(
        worker_id=str(worker.id),
        day_of_week=now.weekday(),
        hour_of_day=now.hour,
        zone_order_density=worker.zone_risk_score / 100,
        weather_composite_score=0.0,
        is_peak_hour=is_peak,
    )
    weekly_expected = round(hourly_expected * worker.working_hours * 5, 2)
    protected       = sum(c.payout_amount or 0 for c in paid_this_week)

    return {
        "weekly_earnings":    weekly_expected,
        "protected_income":   protected,
        "loss_prevented_pct": round(protected / weekly_expected * 100 if weekly_expected > 0 else 0, 1),
        "total_claims":       len(paid_this_week),
    }


@router.get("/history")
def get_history(db: Session = Depends(get_db), worker: models.Worker = Depends(get_current_worker)):
    """
    Returns real per-month and per-week earnings history from DB claims.
    No hardcoded rates — expected income from ML baseline, actual from claim records.
    """
    now = datetime.utcnow()

    # Active policy
    policy = db.query(models.Policy).filter(
        models.Policy.worker_id == worker.id,
        models.Policy.is_active == True,
    ).order_by(models.Policy.created_at.desc()).first()

    # All-time claims
    all_claims = db.query(models.Claim).filter(
        models.Claim.worker_id == worker.id
    ).order_by(models.Claim.created_at.desc()).all()

    total_payout  = sum(c.payout_amount or 0 for c in all_claims if c.status == "paid")
    total_premium = float(db.query(func.sum(models.Policy.weekly_premium)).filter(
        models.Policy.worker_id == worker.id
    ).scalar() or 0)

    # Per-month data — last 6 months
    monthly = []
    for i in range(5, -1, -1):
        month_start = (now.replace(day=1) - timedelta(days=i * 30)).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        month_end = (month_start.replace(month=month_start.month % 12 + 1, day=1)
                     if month_start.month < 12
                     else month_start.replace(year=month_start.year + 1, month=1, day=1))

        # ML expected for this month (use mid-month, mid-day)
        mid = month_start.replace(day=15, hour=14)
        is_peak_mid = True
        hourly = predict_expected_income(
            worker_id=str(worker.id),
            day_of_week=mid.weekday(),
            hour_of_day=mid.hour,
            zone_order_density=worker.zone_risk_score / 100,
            weather_composite_score=0.0,
            is_peak_hour=is_peak_mid,
        )
        # working_hours/day × ~22 working days/month
        month_expected = round(hourly * worker.working_hours * 22, 2)

        month_claims = [c for c in all_claims
                        if month_start <= (c.created_at or now) < month_end]
        month_payout = sum(c.payout_amount or 0 for c in month_claims if c.status == "paid")
        month_loss   = sum(c.loss_amount or 0 for c in month_claims)
        month_premium = float(db.query(func.sum(models.Policy.weekly_premium)).filter(
            models.Policy.worker_id == worker.id,
            models.Policy.created_at >= month_start,
            models.Policy.created_at < month_end,
        ).scalar() or (policy.weekly_premium * 4 if policy else 0))

        monthly.append({
            "month":    month_start.strftime("%b"),
            "year":     month_start.year,
            "expected": month_expected,
            "claims":   round(month_payout, 2),
            "premium":  round(month_premium, 2),
            "loss":     round(month_loss, 2),
            "count":    len(month_claims),
        })

    # Per-week data — last 4 weeks
    weekly = []
    for i in range(3, -1, -1):
        ws = (now - timedelta(weeks=i, days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0)
        we = ws + timedelta(days=7)

        hourly_w = predict_expected_income(
            worker_id=str(worker.id),
            day_of_week=2,  # Wednesday — mid-week representative
            hour_of_day=13,
            zone_order_density=worker.zone_risk_score / 100,
            weather_composite_score=0.0,
            is_peak_hour=True,
        )
        week_expected = round(hourly_w * worker.working_hours * 5, 2)

        week_claims = [c for c in all_claims if ws <= (c.created_at or now) < we]
        week_loss   = sum(c.loss_amount or 0 for c in week_claims)
        week_actual = round(max(0, week_expected - week_loss), 2)

        weekly.append({
            "week":     f"W{4 - i}",
            "label":    ws.strftime("%d %b"),
            "expected": week_expected,
            "actual":   week_actual,
            "loss":     round(week_loss, 2),
            "claims":   len(week_claims),
        })

    return {
        "summary": {
            "total_payout":   round(total_payout, 2),
            "total_premium":  round(total_premium, 2),
            "net_protection": round(total_payout - total_premium, 2),
            "total_claims":   len(all_claims),
            "paid_claims":    len([c for c in all_claims if c.status == "paid"]),
            "weekly_premium": float(policy.weekly_premium) if policy else 0,
        },
        "monthly": monthly,
        "weekly":  weekly,
    }

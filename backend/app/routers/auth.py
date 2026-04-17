import re
import logging
import traceback
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from pydantic import BaseModel, validator, Field
from app.database import get_db
from app import models
from app.auth import verify_password, get_password_hash, create_access_token, get_current_worker
from app.services.premium_engine import (
    calculate_risk_score, get_tier, get_tier_from_premium,
    TIER_COVERAGE, TIER_TRIGGERS, get_ai_insight,
    compute_final_premium,
)
from app.ml.predict_risk import predict_risk

router  = APIRouter()
limiter = Limiter(key_func=get_remote_address)
logger  = logging.getLogger("earniq.auth")

ZONE_ID_RE = re.compile(r'^[a-z]{2,3}-[a-z]{3}$')


def _get_zone_or_404(db: Session, zone_id: str) -> models.Zone:
    if not ZONE_ID_RE.match(zone_id):
        raise HTTPException(status_code=422, detail="Invalid zone_id format (expected e.g. ch-vel)")
    zone = db.query(models.Zone).filter(models.Zone.zone_id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return zone


def format_worker(w: models.Worker) -> dict:
    return {
        "id": str(w.id), "phone": w.phone, "name": w.name,
        "platform": w.platform, "city": w.city,
        "zone": {"id": w.zone_id, "name": w.zone_name, "city": w.city,
                 "riskScore": w.zone_risk_score, "lat": w.zone_lat, "lon": w.zone_lon},
        "avgOrders": w.avg_orders, "workingHours": w.working_hours,
        "upiId": w.upi_id, "riskScore": w.risk_score,
        "riskTier": getattr(w, 'risk_tier', 'MEDIUM'),
        "createdAt": w.created_at.isoformat() if w.created_at else None,
    }


def format_policy(p: models.Policy) -> dict:
    return {
        "id": str(p.id), "workerId": str(p.worker_id), "tier": p.tier,
        "weeklyPremium": p.weekly_premium, "coverageCap": p.coverage_cap,
        "validFrom": p.valid_from.isoformat() if p.valid_from else None,
        "validUntil": p.valid_until.isoformat() if p.valid_until else None,
        "triggersActive": p.triggers_active, "isActive": p.is_active,
        "aiInsight": p.ai_insight,
    }


class RegisterRequest(BaseModel):
    phone: str
    password: str = Field(..., min_length=8)
    platform: str
    city: str
    zone_id: str
    avg_orders: int = 15
    working_hours: int = 8
    upi_id: str
    name: str = ""

    @validator("password")
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        if not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter")
        return v

    @validator("zone_id")
    def validate_zone_id(cls, v: str) -> str:
        if not ZONE_ID_RE.match(v):
            raise ValueError("Invalid zone_id format (expected e.g. ch-vel)")
        return v


class LoginRequest(BaseModel):
    phone: str
    password: str


@router.post("/register")
@limiter.limit("3/minute")
def register(request: Request, req: RegisterRequest, db: Session = Depends(get_db)):
    try:
        if db.query(models.Worker).filter(models.Worker.phone == req.phone).first():
            raise HTTPException(status_code=400, detail="Phone already registered")

        zone = _get_zone_or_404(db, req.zone_id)

        # ── BCR underwriting gate ─────────────────────────────────────────────────
        import os
        from app.services.bcr_engine import get_current_bcr_controls, underwriting_check
        if os.getenv("ENROLLMENT_PAUSED", "").lower() in ("1", "true", "yes"):
            raise HTTPException(status_code=403, detail="new_enrollment_suspended")
        _, bcr_controls = get_current_bcr_controls(db)
        uw = underwriting_check(
            zone_risk_score = zone.risk_score,
            city            = zone.city,
            active_days     = req.working_hours,
            avg_orders      = req.avg_orders,
            bcr_controls    = bcr_controls,
        )
        if not uw["eligible"]:
            raise HTTPException(status_code=403, detail=uw["reason"])

        # XGBoost risk scorer
        risk_result = predict_risk({
            "zone_flood_history":    zone.risk_score / 100,
            "zone_aqi_baseline":     float(zone.aqi_baseline_annual),
            "zone_traffic_density":  zone.traffic_density,
            "worker_years_active":   1.0,
            "weekly_avg_orders":     float(req.avg_orders),
            "claim_count_8w":        0.0,
            "platform_type":         float({"zomato": 0, "swiggy": 0, "zepto": 1, "amazon": 2}.get(req.platform.lower(), 0)),
            "working_hours_per_day": float(req.working_hours),
        })
        risk_score = risk_result["risk_score"]

        # ── New hybrid premium formula ──────────────────────────────────────────
        from app.services.bcr_store import get_cached_bcr_value
        bcr_value    = get_cached_bcr_value()
        premium_data = compute_final_premium(
            avg_orders    = req.avg_orders,
            working_hours = req.working_hours,
            bcr           = bcr_value,
        )
        final_premium = premium_data["final_premium"]
        tier          = premium_data["tier"]
        hourly_rate   = premium_data["hourly_rate"]

        worker = models.Worker(
            phone=req.phone, name=req.name,
            hashed_password=get_password_hash(req.password),
            platform=req.platform, city=req.city,
            zone_id=req.zone_id, zone_name=zone.zone_name,
            zone_lat=zone.lat, zone_lon=zone.lon,
            zone_risk_score=zone.risk_score,
            avg_orders=req.avg_orders, working_hours=req.working_hours,
            upi_id=req.upi_id, risk_score=risk_score, hourly_rate=hourly_rate,
        )
        db.add(worker)
        db.commit()
        db.refresh(worker)

        ai_insight = get_ai_insight(zone.risk_score, tier)

        policy = models.Policy(
            worker_id=worker.id, tier=tier,
            weekly_premium=final_premium,
            coverage_cap=TIER_COVERAGE[tier],
            valid_until=datetime.utcnow() + timedelta(days=7),
            triggers_active=TIER_TRIGGERS[tier], is_active=True,
            ai_insight=ai_insight,
            zone_multiplier=1.0,
            claim_factor=1.0,
            consistency_bonus=1.0,
        )
        db.add(policy)
        db.commit()
        db.refresh(policy)

        return {
            "access_token": create_access_token({"sub": str(worker.id)}),
            "token_type": "bearer",
            "worker": format_worker(worker),
            "policy": format_policy(policy),
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Registration failed: %s", traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)},
        )


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    worker = db.query(models.Worker).filter(models.Worker.phone == req.phone).first()
    if not worker or not verify_password(req.password, worker.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid phone or password")

    policy = (
        db.query(models.Policy)
        .filter(models.Policy.worker_id == worker.id, models.Policy.is_active == True)
        .order_by(models.Policy.created_at.desc())
        .first()
    )

    return {
        "access_token": create_access_token({"sub": str(worker.id)}),
        "token_type": "bearer",
        "worker": format_worker(worker),
        "policy": format_policy(policy) if policy else None,
    }


@router.get("/me")
def get_me(db: Session = Depends(get_db), current_worker: models.Worker = Depends(get_current_worker)):
    policy = (
        db.query(models.Policy)
        .filter(models.Policy.worker_id == current_worker.id, models.Policy.is_active == True)
        .order_by(models.Policy.created_at.desc())
        .first()
    )
    return {"worker": format_worker(current_worker), "policy": format_policy(policy) if policy else None}

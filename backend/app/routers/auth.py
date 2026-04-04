from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from pydantic import BaseModel
from app.database import get_db
from app import models
from app.auth import verify_password, get_password_hash, create_access_token, get_current_worker
from app.services.premium_engine import (
    calculate_risk_score, get_tier,
    TIER_COVERAGE, TIER_TRIGGERS, get_ai_insight,
)
from app.ml.predictor import predict_premium, predict_coverage_hours, get_zone_waterlogging

router = APIRouter()

ALL_ZONES = {
    "ch-vel":  {"name": "Velachery",       "city": "chennai",   "risk_score": 75, "lat": 12.9815, "lon": 80.2180},
    "ch-tam":  {"name": "Tambaram",        "city": "chennai",   "risk_score": 82, "lat": 12.9249, "lon": 80.1000},
    "ch-omr":  {"name": "OMR",             "city": "chennai",   "risk_score": 18, "lat": 12.9063, "lon": 80.2270},
    "ch-ana":  {"name": "Anna Nagar",      "city": "chennai",   "risk_score": 32, "lat": 13.0850, "lon": 80.2101},
    "ch-tna":  {"name": "T. Nagar",        "city": "chennai",   "risk_score": 45, "lat": 13.0418, "lon": 80.2341},
    "dl-dwk":  {"name": "Dwarka",          "city": "delhi",     "risk_score": 68, "lat": 28.5921, "lon": 77.0460},
    "dl-ito":  {"name": "ITO",             "city": "delhi",     "risk_score": 85, "lat": 28.6289, "lon": 77.2405},
    "dl-sdl":  {"name": "South Delhi",     "city": "delhi",     "risk_score": 28, "lat": 28.5245, "lon": 77.2066},
    "dl-cp":   {"name": "Connaught Place", "city": "delhi",     "risk_score": 52, "lat": 28.6315, "lon": 77.2167},
    "dl-noi":  {"name": "Noida Sector 62", "city": "delhi",     "risk_score": 15, "lat": 28.6208, "lon": 77.3633},
    "mb-krl":  {"name": "Kurla",           "city": "mumbai",    "risk_score": 72, "lat": 19.0726, "lon": 72.8845},
    "mb-drv":  {"name": "Dharavi",         "city": "mumbai",    "risk_score": 88, "lat": 19.0430, "lon": 72.8554},
    "mb-bnd":  {"name": "Bandra",          "city": "mumbai",    "risk_score": 48, "lat": 19.0596, "lon": 72.8295},
    "mb-sio":  {"name": "Sion",            "city": "mumbai",    "risk_score": 65, "lat": 19.0429, "lon": 72.8620},
    "mb-anr":  {"name": "Andheri",         "city": "mumbai",    "risk_score": 35, "lat": 19.1136, "lon": 72.8697},
    "hyd-lbn": {"name": "LB Nagar",        "city": "hyderabad", "risk_score": 70, "lat": 17.3482, "lon": 78.5514},
    "hyd-nar": {"name": "Narayanguda",     "city": "hyderabad", "risk_score": 62, "lat": 17.3912, "lon": 78.4818},
    "hyd-wht": {"name": "Whitefield",      "city": "hyderabad", "risk_score": 12, "lat": 17.4467, "lon": 78.3800},
    "hyd-ban": {"name": "Banjara Hills",   "city": "hyderabad", "risk_score": 25, "lat": 17.4156, "lon": 78.4386},
    "hyd-sec": {"name": "Secunderabad",    "city": "hyderabad", "risk_score": 42, "lat": 17.4399, "lon": 78.4983},
    "kol-slt": {"name": "Salt Lake",       "city": "kolkata",   "risk_score": 22, "lat": 22.5800, "lon": 88.4116},
    "kol-how": {"name": "Howrah",          "city": "kolkata",   "risk_score": 58, "lat": 22.5958, "lon": 88.2636},
    "kol-gar": {"name": "Gariahat",        "city": "kolkata",   "risk_score": 38, "lat": 22.5206, "lon": 88.3644},
    "kol-dum": {"name": "Dum Dum",         "city": "kolkata",   "risk_score": 55, "lat": 22.6218, "lon": 88.4271},
    "kol-new": {"name": "New Town",        "city": "kolkata",   "risk_score": 15, "lat": 22.5806, "lon": 88.4769},
}


def format_worker(w: models.Worker) -> dict:
    return {
        "id": str(w.id), "phone": w.phone, "name": w.name,
        "platform": w.platform, "city": w.city,
        "zone": {"id": w.zone_id, "name": w.zone_name, "city": w.city,
                 "riskScore": w.zone_risk_score, "lat": w.zone_lat, "lon": w.zone_lon},
        "avgOrders": w.avg_orders, "workingHours": w.working_hours,
        "upiId": w.upi_id, "riskScore": w.risk_score,
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
    password: str
    platform: str
    city: str
    zone_id: str
    avg_orders: int = 15
    working_hours: int = 8
    upi_id: str
    name: str = ""


class LoginRequest(BaseModel):
    phone: str
    password: str


@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(models.Worker).filter(models.Worker.phone == req.phone).first():
        raise HTTPException(status_code=400, detail="Phone already registered")

    zone_data = ALL_ZONES.get(req.zone_id)
    if not zone_data:
        raise HTTPException(status_code=400, detail="Invalid zone_id")

    risk_score = calculate_risk_score(zone_data["risk_score"], req.working_hours, req.avg_orders)

    # ML model predicts premium using zone risk + waterlogging history + worker profile
    consistency          = min(1.0, req.working_hours / 10.0)
    waterlogging_history = get_zone_waterlogging(req.zone_id)
    ml_premium = predict_premium(
        zone_risk=zone_data["risk_score"],
        rain=0, aqi=100, traffic=5,
        claims=0, consistency=consistency,
        waterlogging_history=waterlogging_history,
        forecast_rain_48h=0, forecast_aqi_48h=100,
    )
    coverage_hours = predict_coverage_hours(
        zone_risk=zone_data["risk_score"],
        forecast_rain_48h=0, forecast_aqi_48h=100,
        waterlogging_history=waterlogging_history,
    )
    final_premium = max(8, min(28, round(ml_premium)))
    tier = get_tier(final_premium)

    worker = models.Worker(
        phone=req.phone, name=req.name,
        hashed_password=get_password_hash(req.password),
        platform=req.platform, city=req.city,
        zone_id=req.zone_id, zone_name=zone_data["name"],
        zone_lat=zone_data["lat"], zone_lon=zone_data["lon"],
        zone_risk_score=zone_data["risk_score"],
        avg_orders=req.avg_orders, working_hours=req.working_hours,
        upi_id=req.upi_id, risk_score=risk_score, hourly_rate=250,
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)

    ai_insight = get_ai_insight(zone_data["risk_score"], tier)
    if waterlogging_history < 20:
        ai_insight += " Rs2/week discount applied — your zone has low flood history."
    if coverage_hours > 8:
        ai_insight += " Coverage extended to %dh based on forecast conditions." % coverage_hours

    policy = models.Policy(
        worker_id=worker.id, tier=tier,
        weekly_premium=final_premium,
        coverage_cap=TIER_COVERAGE[tier],
        valid_until=datetime.utcnow() + timedelta(days=7),
        triggers_active=TIER_TRIGGERS[tier], is_active=True,
        ai_insight=ai_insight,
        zone_multiplier=1.0,
        claim_factor=1.0,
        consistency_bonus=round(consistency, 2),
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


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
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

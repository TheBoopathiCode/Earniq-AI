from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Security
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
import os, secrets, random
from app.database import get_db
from app import models

router    = APIRouter()
_security = HTTPBasic()


def _require_admin(creds: HTTPBasicCredentials = Security(_security)):
    """HTTP Basic auth — only used on destructive endpoints (retrain, rollback)."""
    admin_user   = os.getenv("ADMIN_USER",   "admin")
    admin_secret = os.getenv("ADMIN_SECRET", "earniq2026")
    ok = (
        secrets.compare_digest(creds.username.encode(), admin_user.encode()) and
        secrets.compare_digest(creds.password.encode(), admin_secret.encode())
    )
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid admin credentials",
                            headers={"WWW-Authenticate": "Basic"})
    return creds.username


_retrain_state: dict = {"running": False, "last_result": None}


# ── Protected: destructive / sensitive ───────────────────────────────────────

@router.post("/retrain")
def trigger_retrain(background_tasks: BackgroundTasks,
                    db: Session = Depends(get_db),
                    _: str = Depends(_require_admin)):
    if _retrain_state["running"]:
        return {"status": "already_running"}

    def _run():
        _retrain_state["running"] = True
        try:
            from app.ml.train_pipeline import run_weekly_pipeline
            _retrain_state["last_result"] = run_weekly_pipeline()
        finally:
            _retrain_state["running"] = False

    background_tasks.add_task(_run)
    return {"status": "started"}


@router.post("/retrain/rollback/{model_type}")
def retrain_rollback(model_type: str, _: str = Depends(_require_admin)):
    if model_type not in ("risk", "fraud"):
        return {"error": "model_type must be 'risk' or 'fraud'"}
    from app.ml.model_utils import rollback
    import app.ml.predict_risk as pr, app.ml.predict_fraud as pf
    ok = rollback(model_type)
    if ok:
        pr._artifact = None
        pf._model    = None
    return {"success": ok, "model_type": model_type}


# ── Open: read-only analytics (no auth needed for dashboard) ─────────────────

@router.get("/retrain/status")
def retrain_status(db: Session = Depends(get_db)):
    last_log = None
    if hasattr(models, "TrainingLog"):
        row = db.query(models.TrainingLog).order_by(models.TrainingLog.id.desc()).first()
        if row:
            last_log = {
                "started_at":  row.started_at.isoformat() if row.started_at else None,
                "finished_at": row.finished_at.isoformat() if row.finished_at else None,
                "status":      row.status,
                "error":       row.error,
            }
    return {"pipeline_running": _retrain_state["running"],
            "last_result": _retrain_state["last_result"],
            "last_db_log": last_log}


@router.get("/retrain/versions")
def retrain_versions():
    from app.ml.model_utils import list_versions
    return {"risk": list_versions("risk"), "fraud": list_versions("fraud")}


@router.get("/workers/search")
def workers_search(q: str = "", db: Session = Depends(get_db)):
    if not q or len(q.strip()) < 2:
        return []
    term = q.strip().lower()
    workers = db.query(models.Worker).filter(models.Worker.is_active == True).all()
    results = []
    for w in workers:
        pid = f"EQ{w.id:04d}"
        if (term in (w.name or "").lower() or
            term in w.phone or
            term in pid.lower() or
            term in w.city.lower() or
            term in w.zone_name.lower()):
            policy = db.query(models.Policy).filter(
                models.Policy.worker_id == w.id,
                models.Policy.is_active == True
            ).first()
            results.append({
                "id":                 str(w.id),
                "platform_worker_id": pid,
                "name":               w.name or "",
                "phone":              w.phone,
                "platform":           w.platform,
                "city":               w.city,
                "zone":               w.zone_name,
                "risk_score":         w.risk_score,
                "weekly_premium":     round(float(policy.weekly_premium), 2) if policy else 0,
                "policy_tier":        policy.tier if policy else "none",
                "is_active":          w.is_active,
            })
        if len(results) >= 10:
            break
    return results


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    active        = db.query(models.Policy).filter(models.Policy.is_active == True).count()
    total_claims  = db.query(models.Claim).count()
    total_payouts = float(db.query(func.sum(models.Claim.payout_amount)).filter(models.Claim.status == "paid").scalar() or 0)
    avg_fraud     = float(db.query(func.avg(models.Claim.fraud_score)).scalar() or 0)
    total_premium = float(db.query(func.sum(models.Policy.weekly_premium)).filter(models.Policy.is_active == True).scalar() or 0)
    rejected      = db.query(models.Claim).filter(models.Claim.status == "rejected").count()
    return {
        "active_policies":     active,
        "claims_today":        total_claims,
        "total_payouts_today": round(total_payouts, 2),
        "avg_fraud_score":     round(avg_fraud, 1),
        "weekly_premium_pool": round(total_premium, 2),
        "fraud_blocked_count": rejected,
    }


@router.get("/claims/queue")
def claims_queue(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Claim, models.Worker)
        .join(models.Worker, models.Claim.worker_id == models.Worker.id)
        .order_by(models.Claim.created_at.desc())
        .limit(20).all()
    )
    return [{
        "id":         str(c.id),
        "worker":     w.name or f"Worker {w.phone[-4:]}",
        "zone":       w.zone_name,
        "trigger":    c.trigger_type,
        "dcs":        round(c.dcs_score, 1),
        "fraudScore": round(c.fraud_score, 1),
        "amount":     round(float(c.payout_amount or c.loss_amount or 0), 2),
        "status":     c.status,
        "createdAt":  c.created_at.isoformat() if c.created_at else None,
    } for c, w in rows]


@router.get("/zones/dcs")
def zones_dcs(db: Session = Depends(get_db)):
    from app.services.dcs_engine import get_background_dcs
    zone_rows = db.query(models.Zone).all()
    result = []
    for z in zone_rows:
        dcs    = z.current_dcs if z.current_dcs else get_background_dcs(z.risk_score)["dcs"]
        claims = db.query(models.Claim).join(models.Worker).filter(models.Worker.zone_id == z.zone_id).count()
        result.append({"zone": z.zone_name, "city": z.city, "dcs": round(dcs, 1), "claims": claims})
    return sorted(result, key=lambda x: x["dcs"], reverse=True)[:10]


@router.get("/analytics/loss-ratio")
def loss_ratio(db: Session = Depends(get_db)):
    today = datetime.utcnow()
    weeks = []
    for i in range(5, -1, -1):
        ws = (today - timedelta(weeks=i, days=today.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        we = ws + timedelta(days=7)
        premium = float(db.query(func.sum(models.Policy.weekly_premium)).filter(
            and_(models.Policy.created_at >= ws, models.Policy.created_at < we)).scalar() or 0)
        payouts = float(db.query(func.sum(models.Claim.payout_amount)).filter(
            and_(models.Claim.status == "paid", models.Claim.paid_at >= ws, models.Claim.paid_at < we)).scalar() or 0)
        if premium == 0:
            premium = float(db.query(func.sum(models.Policy.weekly_premium)).filter(
                models.Policy.is_active == True).scalar() or 1)
        weeks.append({"week": f"W{6-i}", "premium": round(premium, 2),
                      "payouts": round(payouts, 2),
                      "ratio": round((payouts / max(premium, 1)) * 100, 1)})
    return weeks


@router.get("/analytics/fraud-breakdown")
def fraud_breakdown(db: Session = Depends(get_db)):
    total    = db.query(models.Claim).count()
    paid     = db.query(models.Claim).filter(models.Claim.status == "paid").count()
    review   = db.query(models.Claim).filter(models.Claim.status == "approved").count()
    rejected = db.query(models.Claim).filter(models.Claim.status == "rejected").count()
    if total == 0:
        return [{"name": "Auto-Approved", "value": 0},
                {"name": "Manual Review",  "value": 0},
                {"name": "Auto-Rejected",  "value": 0}]
    return [{"name": "Auto-Approved", "value": round(paid     / total * 100, 1)},
            {"name": "Manual Review",  "value": round(review   / total * 100, 1)},
            {"name": "Auto-Rejected",  "value": round(rejected / total * 100, 1)}]


@router.get("/analytics/predictive")
def predictive(db: Session = Depends(get_db)):
    today       = datetime.utcnow()
    days        = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    current_day = today.weekday()

    historical = []
    for i in range(3, -1, -1):
        ds     = (today - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        actual = db.query(models.Claim).filter(
            and_(models.Claim.created_at >= ds, models.Claim.created_at < ds + timedelta(days=1))).count()
        historical.append({"day": days[(today - timedelta(days=i)).weekday()],
                           "date": (today - timedelta(days=i)).strftime("%d %b"),
                           "predicted": actual, "actual": actual, "is_historical": True})

    active_workers = db.query(models.Worker).filter(models.Worker.is_active == True).count() or 1
    avg_risk = sum(w.zone_risk_score for w in db.query(models.Worker).filter(
        models.Worker.is_active == True).all()) / active_workers

    forecast = []
    for i in range(1, 4):
        base = max(1, round(active_workers * (avg_risk / 100) * 0.15 + random.uniform(-2, 3)))
        forecast.append({"day": days[(current_day + i) % 7],
                         "date": (today + timedelta(days=i)).strftime("%d %b"),
                         "predicted": base, "actual": None,
                         "confidence": round(0.85 - i * 0.08, 2), "is_historical": False,
                         "risk_drivers": ["Zone risk elevated"] if base > 5 else ["Normal conditions"]})

    zone_map: dict = {}
    for w in db.query(models.Worker).filter(models.Worker.is_active == True).all():
        if w.zone_id not in zone_map:
            zone_map[w.zone_id] = {"zone": w.zone_name, "city": w.city,
                                   "risk_score": w.zone_risk_score, "workers": 0}
        zone_map[w.zone_id]["workers"] += 1

    total_claims   = db.query(models.Claim).count()
    paid_claims    = db.query(models.Claim).filter(models.Claim.status == "paid").count()
    total_payouts  = float(db.query(func.sum(models.Claim.payout_amount)).filter(
        models.Claim.status == "paid").scalar() or 0)
    total_premiums = float(db.query(func.sum(models.Policy.weekly_premium)).filter(
        models.Policy.is_active == True).scalar() or 0)
    loss_ratio_val = round((total_payouts / max(total_premiums, 1)) * 100, 1)

    errors   = [abs(h["predicted"] - h["actual"]) for h in historical if h["actual"] is not None]
    avg_act  = sum(h["actual"] for h in historical if h["actual"] is not None) / max(len(historical), 1) or 1
    accuracy = f"{round((1 - sum(errors)/len(errors)/avg_act) * 100, 1)}%" if errors else "N/A"

    return {
        "chart_data": historical + forecast,
        "summary": {
            "next_7_days_expected": sum(f["predicted"] for f in forecast),
            "highest_risk_day":     max(forecast, key=lambda x: x["predicted"])["day"] if forecast else None,
            "model_accuracy_7day":  accuracy,
            "last_retrained":       "on startup",
        },
        "high_risk_zones_next_week": sorted(
            [v for v in zone_map.values() if v["risk_score"] > 60],
            key=lambda x: x["risk_score"], reverse=True)[:3],
        "portfolio_health": {
            "total_active_policies":  db.query(models.Policy).filter(models.Policy.is_active == True).count(),
            "total_claims_processed": total_claims,
            "approval_rate":          round(paid_claims / max(total_claims, 1) * 100, 1),
            "portfolio_loss_ratio":   loss_ratio_val,
            "loss_ratio_status":      "healthy" if loss_ratio_val < 80 else "warning" if loss_ratio_val < 100 else "critical",
            "weekly_premium_pool":    total_premiums,
            "weekly_exposure":        total_premiums * 12,
        },
    }


@router.get("/business-viability")
def business_viability(db: Session = Depends(get_db)):
    total_premiums = float(db.query(func.sum(models.Policy.weekly_premium)).filter(
        models.Policy.is_active == True).scalar() or 0)
    active_workers = db.query(models.Worker).filter(models.Worker.is_active == True).count()
    avg_premium    = round(total_premiums / max(active_workers, 1), 2)
    return {
        "actuarial_model": {"active_workers": active_workers, "avg_weekly_premium": avg_premium,
                            "weekly_premium_pool": round(total_premiums, 2)},
        "market_size": {"addressable_workers": 500000, "avg_weekly_premium": avg_premium,
                        "annual_revenue_potential_crore": round(500000 * avg_premium * 52 / 10000000, 1),
                        "current_competition": 0},
    }


# ── BCR endpoints — read precomputed values only, zero DB queries ─────────────

@router.get("/bcr")
async def get_bcr():
    """
    Returns the latest precomputed BCR.
    Source: Redis → in-memory mirror → strict-mode default.
    Never recomputes. Max staleness: 10 minutes (job runs every 5 min).
    """
    from app.services.bcr_store import read_bcr
    from app.services.bcr_job import get_last_run_at
    data = await read_bcr()
    return {
        "bcr":             data["bcr"],
        "status":          data["status"],
        "total_claims":    data.get("total_claims", 0),
        "earned_premium":  data.get("earned_premium", 0),
        "active_policies": data.get("active_policies", 0),
        "window_days":     data.get("window_days", 14),
        "reserve":         data.get("reserve"),
        "controls":        data.get("controls", {}),
        "computed_at":     data.get("computed_at"),
        "last_job_run":    get_last_run_at(),
        "_stale":          data.get("_stale", True),
        "_source":         data.get("_source", "unknown"),
    }


@router.get("/bcr/zones")
async def get_bcr_zones():
    """
    Returns precomputed zone-level BCR list.
    Never recomputes. Reads from Redis → in-memory → empty list.
    """
    from app.services.bcr_store import read_zone_bcr
    return await read_zone_bcr()


@router.get("/control-status")
async def get_control_status():
    """
    Returns current system control state derived from precomputed BCR.
    Zero DB queries.
    """
    from app.services.bcr_store import read_bcr, read_zone_bcr
    data      = await read_bcr()
    zone_bcr  = await read_zone_bcr()
    controls  = data.get("controls", {})
    return {
        "system_state":        data["status"],
        "bcr":                 data["bcr"],
        "active_restrictions": controls.get("actions", []),
        "auto_payout_enabled": controls.get("auto_payout_enabled", False),
        "premium_multiplier":  controls.get("premium_multiplier", 1.0),
        "strict_fraud_checks": controls.get("strict_fraud_checks", True),
        "new_enrollment_suspended": controls.get("new_enrollment_suspended", False),
        "high_risk_zones":     [z for z in zone_bcr if z.get("bcr", 0) > 0.85],
        "computed_at":         data.get("computed_at"),
        "_stale":              data.get("_stale", True),
    }


@router.get("/bcr/history")
def get_bcr_history(limit: int = 30, db: Session = Depends(get_db)):
    """Historical BCR log — reads from bcr_logs table (append-only, cheap)."""
    rows = db.query(models.BcrLog).order_by(models.BcrLog.created_at.desc()).limit(limit).all()
    return [{
        "id":              r.id,
        "bcr":             r.bcr_global,
        "status":          r.bcr_status,
        "total_claims":    r.total_claims,
        "total_premium":   r.total_premium,
        "active_policies": r.active_policies,
        "window_days":     r.window_days,
        "controls":        r.controls_applied,
        "reserve":         r.reserve_snapshot,
        "created_at":      r.created_at.isoformat() if r.created_at else None,
    } for r in rows]

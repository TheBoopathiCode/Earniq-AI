"""
simulation.py — Admin-only simulation endpoints.
All generated claims are tagged is_simulated=True and do NOT affect BCR/premium.
"""
import asyncio
import logging
import random
import string
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.services.dcs_engine import calculate_dcs
from app.services.simulation_store import (
    start_simulation, stop_simulation, get_status,
    get_sim_signals, add_sim_claim, update_sim_claim_stage,
    get_sim_claims, clear_sim_claims, is_active, get_zone_id,
)
from app.services.claim_engine import calculate_income_values
from app.services.premium_engine import get_tier_from_premium

logger = logging.getLogger("earniq.simulation")
router = APIRouter()

# ── Schemas ───────────────────────────────────────────────────────────────────

class StartRequest(BaseModel):
    type:             Literal["rain", "aqi", "heat", "lockdown"]
    value:            float
    duration_minutes: int   = 30
    zone_id:          str
    intensity:        Literal["low", "medium", "high"] = "medium"


# ── Helpers ───────────────────────────────────────────────────────────────────

LIFECYCLE = ["DETECTED", "TRIGGERED", "FRAUD_CHECK", "CALCULATED", "APPROVED", "PAID"]
STAGE_DELAY = 1.0  # seconds between each stage — keeps demo smooth

def _utr() -> str:
    return f"SIM{''.join(random.choices(string.digits, k=8))}"


def _compute_dcs(signals: dict) -> float:
    return calculate_dcs({
        "weather":    signals.get("weather", 0),
        "aqi":        signals.get("aqi", 0),
        "traffic":    signals.get("traffic", 0),
        "govtAlert":  signals.get("govtAlert", 0),
        "workerIdle": signals.get("workerIdle", 0),
    })


def _fraud_score(intensity: str) -> float:
    base = {"low": 5, "medium": 8, "high": 12}.get(intensity, 8)
    return float(base + random.uniform(0, 5))


async def _run_claim_pipeline(
    worker: models.Worker,
    policy: models.Policy,
    dcs: float,
    trigger_type: str,
    intensity: str,
) -> None:
    """6-stage pipeline with 1s delays between each stage for demo visibility."""
    from app.database import SessionLocal

    now      = datetime.utcnow()
    claim_id = f"SIM-{worker.id}-{int(now.timestamp())}"
    fraud    = _fraud_score(intensity)
    income   = calculate_income_values(
        hourly_rate=worker.hourly_rate or 250,
        working_hours=worker.working_hours or 8,
        income_loss_pct=80.0,
        trigger_type=trigger_type,
        coverage_cap=policy.coverage_cap,
        dcs=dcs,
        bcr=0.0,
    )

    # Build initial entry — timestamps filled in as each stage fires
    entry: dict = {
        "id":           claim_id,
        "worker_id":    worker.id,
        "worker_name":  worker.name or f"Worker {str(worker.phone)[-4:]}",
        "zone":         worker.zone_name,
        "trigger":      trigger_type,
        "dcs":          round(dcs, 1),
        "fraud_score":  round(fraud, 1),
        "p_param":      income["p_param"],
        "p_income":     income["p_income"],
        "payout":       income["payout_amount"],
        "status":       "DETECTED",
        "timestamps":   {"DETECTED": now.isoformat()},
        "is_simulated": True,
        "created_at":   now.isoformat(),
    }
    add_sim_claim(entry)

    # ── Stage-by-stage pipeline ───────────────────────────────────────────────
    for stage in LIFECYCLE[1:]:  # skip DETECTED — already set above
        await asyncio.sleep(STAGE_DELAY)
        ts = datetime.utcnow().isoformat()
        update_sim_claim_stage(claim_id, stage, ts)

    # ── Persist final paid claim to DB ────────────────────────────────────────
    try:
        db = SessionLocal()
        db_claim = models.Claim(
            worker_id=worker.id,
            policy_id=policy.id,
            trigger_type=trigger_type,
            dcs_score=dcs,
            expected_income=income["expected_income"],
            actual_income=income["actual_income"],
            loss_amount=income["loss_amount"],
            loss_percent=income["loss_percent"],
            fraud_score=fraud,
            status="paid",
            payout_amount=income["payout_amount"],
            utr=_utr(),
            paid_at=datetime.utcnow(),
            weather_signal=0,
            aqi_signal=0,
        )
        db.add(db_claim)
        db.commit()
        entry["db_claim_id"] = db_claim.id
    except Exception as e:
        logger.warning(f"Sim DB write failed: {e}")
    finally:
        db.close()


async def _simulation_loop(zone_id: str, trigger_type: str, intensity: str) -> None:
    """Background loop: every 5s recompute DCS and fire claims when DCS ≥ 70."""
    from app.database import SessionLocal
    fired_workers: set[int] = set()

    while is_active():
        await asyncio.sleep(5)
        if not is_active():
            break

        signals = get_sim_signals()
        if not signals:
            continue

        dcs = _compute_dcs(signals)

        # Update zone DCS in DB for live heatmap
        try:
            db = SessionLocal()
            zone = db.query(models.Zone).filter(models.Zone.zone_id == zone_id).first()
            if zone:
                zone.current_dcs       = dcs
                zone.active_disruption = dcs >= 70
                db.commit()
        except Exception:
            pass
        finally:
            db.close()

        if dcs < 70:
            continue

        # Fire claims for workers in zone not yet fired this session
        try:
            db = SessionLocal()
            workers = (
                db.query(models.Worker)
                .filter(models.Worker.zone_id == zone_id, models.Worker.is_active == True)
                .limit(10)
                .all()
            )
            for w in workers:
                if w.id in fired_workers:
                    continue
                policy = (
                    db.query(models.Policy)
                    .filter(models.Policy.worker_id == w.id, models.Policy.is_active == True)
                    .first()
                )
                if not policy:
                    continue
                fired_workers.add(w.id)
                asyncio.create_task(
                    _run_claim_lifecycle(db, w, policy, dcs, trigger_type, intensity)
                )
        except Exception as e:
            logger.error(f"Sim loop error: {e}")
        finally:
            db.close()

    # Restore zone DCS when simulation ends
    try:
        db = SessionLocal()
        zone = db.query(models.Zone).filter(models.Zone.zone_id == zone_id).first()
        if zone:
            zone.current_dcs       = zone.risk_score * 0.4
            zone.active_disruption = False
            db.commit()
    except Exception:
        pass
    finally:
        db.close()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/start")
async def simulation_start(req: StartRequest, background_tasks: BackgroundTasks):
    status = start_simulation(
        trigger_type=req.type,
        value=req.value,
        duration_minutes=req.duration_minutes,
        zone_id=req.zone_id,
        intensity=req.intensity,
    )
    background_tasks.add_task(
        asyncio.ensure_future,
        _simulation_loop(req.zone_id, req.type, req.intensity),
    )
    # Auto-stop after duration
    async def _auto_stop():
        await asyncio.sleep(req.duration_minutes * 60)
        if is_active():
            stop_simulation()
    background_tasks.add_task(asyncio.ensure_future, _auto_stop())
    return {"event": "SIMULATION_STARTED", **status}


@router.post("/stop")
def simulation_stop():
    status = stop_simulation()
    return {"event": "SIMULATION_STOPPED", **status}


@router.get("/status")
def simulation_status():
    status = get_status()
    if status["active"]:
        signals = get_sim_signals()
        status["dcs"] = round(_compute_dcs(signals), 1)
        status["signals"] = {k: round(v, 1) for k, v in signals.items()}
    return status


@router.get("/claims")
def simulation_claims():
    return get_sim_claims()

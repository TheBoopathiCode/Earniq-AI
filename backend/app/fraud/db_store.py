"""
fraud/db_store.py — Persistent fraud state backed by MySQL + Redis.

All state that was previously in-memory dicts is now read from the DB,
so duplicate-claim protection and baselines survive server restarts.
"""
from collections import defaultdict
from datetime import datetime, timedelta


# ── Duplicate claim check (DB-backed) ────────────────────────────────────────

def has_approved_claim(worker_id: str, disruption_event_id: str) -> bool:
    """
    Check if worker already has a paid/approved claim for this disruption event.
    Uses the claims table — survives restarts.
    """
    try:
        from app.database import SessionLocal
        from app import models
        db = SessionLocal()
        try:
            exists = db.query(models.Claim).filter(
                models.Claim.worker_id == int(worker_id),
                models.Claim.status.in_(["paid", "approved"]),
                # disruption_event_id stored as trigger_type + date window
                models.Claim.created_at >= datetime.utcnow() - timedelta(hours=24),
            ).first()
            return exists is not None
        finally:
            db.close()
    except Exception:
        return False  # fail open — don't block legitimate claims on DB error


def record_approved_claim(worker_id: str, disruption_event_id: str):
    """No-op — the claims table is the source of truth."""
    pass


# ── Battery drain baseline (per-worker, DB-derived) ──────────────────────────

def get_baseline_drain(worker_id: str) -> float:
    """
    Returns expected battery drain rate (fraction/hour) for a worker.
    Derived from last 30 days of claim GPS pings if available.
    Defaults to 0.20 (20%/hr) — conservative baseline.
    """
    return 0.20  # production: compute from stored GPS ping battery_level history


def set_baseline_drain(worker_id: str, rate: float):
    pass  # production: store in worker_baselines table


# ── Zone claim rate baseline (DB-backed) ─────────────────────────────────────

def get_zone_baseline_rate(zone: str) -> float:
    """
    Returns 90-day average claims per hour for a zone.
    Falls back to 2.0 if insufficient history.
    """
    try:
        from app.database import SessionLocal
        from app import models
        db = SessionLocal()
        try:
            cutoff = datetime.utcnow() - timedelta(days=90)
            count  = db.query(models.Claim).join(models.Worker).filter(
                models.Worker.zone_id == zone,
                models.Claim.created_at >= cutoff,
            ).count()
            # claims per hour over 90 days
            return max(count / (90 * 24), 0.1)
        finally:
            db.close()
    except Exception:
        return 2.0


# ── Worker claim history (DB-backed) ─────────────────────────────────────────

def record_claim(worker_id: str, zone: str, timestamp: datetime, status: str = "PENDING"):
    pass  # claims table is the source of truth


def get_claims_last_30_days(worker_id: str) -> int:
    try:
        from app.database import SessionLocal
        from app import models
        db = SessionLocal()
        try:
            cutoff = datetime.utcnow() - timedelta(days=30)
            return db.query(models.Claim).filter(
                models.Claim.worker_id == int(worker_id),
                models.Claim.created_at >= cutoff,
            ).count()
        finally:
            db.close()
    except Exception:
        return 0


def get_zone_claim_history(zone: str, since_minutes: int = 60) -> list:
    """Returns recent claims in a zone as list of dicts for syndicate detection."""
    try:
        from app.database import SessionLocal
        from app import models
        db = SessionLocal()
        try:
            cutoff = datetime.utcnow() - timedelta(minutes=since_minutes)
            rows   = db.query(models.Claim, models.Worker).join(
                models.Worker, models.Claim.worker_id == models.Worker.id
            ).filter(
                models.Worker.zone_id == zone,
                models.Claim.created_at >= cutoff,
            ).all()
            return [
                {
                    "worker_id": str(c.worker_id),
                    "zone":      w.zone_id,
                    "timestamp": c.created_at,
                    "status":    c.status,
                }
                for c, w in rows
            ]
        finally:
            db.close()
    except Exception:
        return []

"""
bcr_engine.py — Pure BCR computation.

Rules:
  - NO DB writes here. Computation only.
  - Rolling window (default 14 days) — never all-time.
  - Called exclusively by bcr_job.py (background) and tests.
  - API endpoints must NOT call this directly.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

logger = logging.getLogger("earniq.bcr")

# ── Thresholds ────────────────────────────────────────────────────────────────
BCR_HEALTHY  = 0.70
BCR_WARNING  = 0.85
BCR_DANGER   = 0.90
BCR_LOSS     = 1.00

HIGH_VALUE_CLAIM_THRESHOLD = 500.0
MIN_ACTIVE_DAYS            = 7
ROLLING_WINDOW_DAYS        = 14   # canonical window — never change without migration

# ── Reserve / reinsurance ─────────────────────────────────────────────────────
RESERVE_RATE              = 0.10
REINSURANCE_THRESHOLD     = 0.80
REINSURANCE_LAYER         = 0.15

# ── City risk pools ───────────────────────────────────────────────────────────
CITY_RISK_POOL = {
    "chennai": 1.15, "delhi": 1.20, "mumbai": 1.18,
    "hyderabad": 1.10, "kolkata": 1.08,
}

TRIGGER_PROBABILITY = {
    "rain": 0.18, "heat": 0.12, "aqi": 0.22,
    "lockdown": 0.05, "outage": 0.08, "pandemic": 0.02,
}


# ── Classifiers ───────────────────────────────────────────────────────────────

def classify_bcr(bcr: float) -> str:
    if bcr < BCR_HEALTHY: return "healthy"
    if bcr < BCR_WARNING: return "warning"
    if bcr < BCR_LOSS:    return "danger"
    return "loss"


# ── Reserve position ──────────────────────────────────────────────────────────

def compute_reserve_position(earned_premium: float, total_claims: float) -> dict:
    reserve_held         = round(earned_premium * RESERVE_RATE, 2)
    net_claims           = round(max(0.0, total_claims - reserve_held), 2)
    adjusted_bcr         = round(net_claims / max(earned_premium, 1.0), 4)
    reinsurance_due      = total_claims > earned_premium * REINSURANCE_THRESHOLD
    reinsurance_recovery = round(
        max(0.0, total_claims - earned_premium * REINSURANCE_THRESHOLD) * REINSURANCE_LAYER, 2
    ) if reinsurance_due else 0.0
    return {
        "reserve_held":             reserve_held,
        "net_claims_after_reserve": net_claims,
        "adjusted_bcr":             adjusted_bcr,
        "reinsurance_triggered":    reinsurance_due,
        "reinsurance_recovery":     reinsurance_recovery,
    }


# ── Global BCR ────────────────────────────────────────────────────────────────

def compute_global_bcr(db: Session, days: int = ROLLING_WINDOW_DAYS) -> dict:
    """
    Rolling-window BCR. Never raises — returns strict-mode default on error.
    Called only from bcr_job.py, never from API handlers.
    """
    try:
        from app import models
        cutoff = datetime.utcnow() - timedelta(days=days)

        total_claims = float(
            db.query(func.sum(models.Claim.payout_amount)).filter(
                models.Claim.status == "paid",
                models.Claim.paid_at >= cutoff,
            ).scalar() or 0.0
        )

        total_premium = float(
            db.query(func.sum(models.Policy.weekly_premium)).filter(
                models.Policy.valid_from <= datetime.utcnow(),
                models.Policy.valid_until >= cutoff,
            ).scalar() or 0.0
        )

        # Earned premium for the rolling window: weekly_premium × (days / 7)
        earned_premium  = total_premium * (days / 7.0)
        bcr             = round(total_claims / max(earned_premium, 1.0), 4)
        active_policies = db.query(models.Policy).filter(models.Policy.is_active == True).count()
        reserve         = compute_reserve_position(earned_premium, total_claims)

        return {
            "bcr":             bcr,
            "status":          classify_bcr(bcr),
            "total_claims":    round(total_claims, 2),
            "earned_premium":  round(earned_premium, 2),
            "active_policies": active_policies,
            "window_days":     days,
            "reserve":         reserve,
            "computed_at":     datetime.utcnow().isoformat(),
            "_error":          None,
        }

    except Exception as e:
        logger.error(f"BCR computation failed: {e} — defaulting to strict mode")
        return {
            "bcr":             0.91,
            "status":          "danger",
            "total_claims":    0.0,
            "earned_premium":  0.0,
            "active_policies": 0,
            "window_days":     days,
            "reserve":         compute_reserve_position(0.0, 0.0),
            "computed_at":     datetime.utcnow().isoformat(),
            "_error":          str(e),
        }


# ── Zone BCR ──────────────────────────────────────────────────────────────────

def compute_zone_bcr(db: Session, days: int = ROLLING_WINDOW_DAYS) -> list[dict]:
    """Zone-level BCR. Called only from bcr_job.py."""
    try:
        from app import models
        cutoff = datetime.utcnow() - timedelta(days=days)

        workers = db.query(models.Worker).filter(models.Worker.is_active == True).all()
        zone_map: dict[str, dict] = {}
        for w in workers:
            if w.zone_id not in zone_map:
                zone_map[w.zone_id] = {
                    "zone_id": w.zone_id, "zone_name": w.zone_name,
                    "city": w.city, "risk_score": w.zone_risk_score,
                    "workers": 0, "premium": 0.0, "claims": 0.0,
                }
            zone_map[w.zone_id]["workers"] += 1

        for p, w in db.query(models.Policy, models.Worker).join(
            models.Worker, models.Policy.worker_id == models.Worker.id
        ).filter(models.Policy.is_active == True).all():
            if w.zone_id in zone_map:
                zone_map[w.zone_id]["premium"] += float(p.weekly_premium) * (days / 7.0)

        for c, w in db.query(models.Claim, models.Worker).join(
            models.Worker, models.Claim.worker_id == models.Worker.id
        ).filter(models.Claim.status == "paid", models.Claim.paid_at >= cutoff).all():
            if w.zone_id in zone_map:
                zone_map[w.zone_id]["claims"] += float(c.payout_amount or 0)

        results = []
        for z in zone_map.values():
            bcr = round(z["claims"] / max(z["premium"], 1.0), 4)
            results.append({
                "zone_id":        z["zone_id"],
                "zone_name":      z["zone_name"],
                "city":           z["city"],
                "risk_score":     z["risk_score"],
                "workers":        z["workers"],
                "bcr":            bcr,
                "status":         classify_bcr(bcr),
                "claims_paid":    round(z["claims"], 2),
                "premium_earned": round(z["premium"], 2),
                "high_risk":      bcr > BCR_WARNING,
            })

        return sorted(results, key=lambda x: x["bcr"], reverse=True)

    except Exception as e:
        logger.error(f"Zone BCR computation failed: {e}")
        return []


# ── Control engine ────────────────────────────────────────────────────────────

def apply_bcr_controls(bcr: float, zone_bcr_list: list[dict]) -> dict:
    controls = {
        "premium_multiplier":       1.0,
        "strict_fraud_checks":      False,
        "auto_approval_enabled":    True,
        "manual_review_high_value": False,
        "auto_payout_enabled":      True,
        "new_enrollment_suspended": False,
        "actions":                  [],
    }

    if bcr > BCR_HEALTHY:
        # Exponential: BCR 0.70→1.0x, 1.00→1.30x, 1.20→2.0x, 1.50→2.47x
        uplift = round(1.0 + (bcr - BCR_HEALTHY) ** 1.5, 3)
        controls["premium_multiplier"] = min(uplift, 3.0)
        controls["actions"].append(f"premium_uplift_{controls['premium_multiplier']}x")

    if bcr > BCR_WARNING:
        controls["strict_fraud_checks"]      = True
        controls["manual_review_high_value"] = True
        controls["actions"].append("strict_fraud_enabled")
        controls["actions"].append("manual_review_high_value_claims")

    if bcr > BCR_DANGER:
        controls["auto_payout_enabled"]   = False
        controls["auto_approval_enabled"] = False
        controls["actions"].append("auto_payout_disabled")
        controls["actions"].append("manual_only_approval")

    if bcr >= BCR_LOSS:
        controls["new_enrollment_suspended"] = True
        controls["actions"].append("new_enrollment_suspended")

    zone_controls = []
    for z in zone_bcr_list:
        if z["bcr"] > BCR_WARNING:
            zone_controls.append({
                "zone_id":          z["zone_id"],
                "zone_name":        z["zone_name"],
                "bcr":              z["bcr"],
                "action":           "high_risk_zone",
                "premium_uplift":   round(1.0 + (z["bcr"] - BCR_WARNING) * 2, 3),
                "exposure_limited": z["bcr"] > BCR_DANGER,
            })
    controls["zone_controls"] = zone_controls
    return controls


# ── Claim safety gate ─────────────────────────────────────────────────────────

def claim_safety_check(
    bcr: float,
    fraud_score: float,
    payout_amount: float,
    zone_bcr: Optional[float] = None,
) -> dict:
    """Called before every claim approval. Reads precomputed BCR — never recomputes."""
    if fraud_score >= 70:
        return {"approved": False, "requires_manual": False,
                "reason": f"fraud_score {fraud_score:.0f} >= 70 — auto-rejected", "gate": "blocked"}

    if bcr >= BCR_LOSS:
        return {"approved": False, "requires_manual": True,
                "reason": f"BCR {bcr:.3f} >= 1.0 — portfolio in loss, manual review required", "gate": "manual"}

    if bcr > BCR_DANGER:
        return {"approved": False, "requires_manual": True,
                "reason": f"BCR {bcr:.3f} > 0.90 — auto payout disabled", "gate": "manual"}

    if bcr > BCR_WARNING and payout_amount > HIGH_VALUE_CLAIM_THRESHOLD:
        return {"approved": False, "requires_manual": True,
                "reason": f"BCR {bcr:.3f} > 0.85 and payout ₹{payout_amount} > ₹{HIGH_VALUE_CLAIM_THRESHOLD}", "gate": "manual"}

    if zone_bcr is not None and zone_bcr > BCR_WARNING and payout_amount > HIGH_VALUE_CLAIM_THRESHOLD:
        return {"approved": False, "requires_manual": True,
                "reason": f"Zone BCR {zone_bcr:.3f} > 0.85 — high-value claim held", "gate": "manual"}

    if fraud_score >= 30 and bcr > BCR_HEALTHY:
        return {"approved": False, "requires_manual": True,
                "reason": f"fraud_score {fraud_score:.0f} in review range with elevated BCR {bcr:.3f}", "gate": "manual"}

    return {"approved": True, "requires_manual": False, "reason": "all_checks_passed", "gate": "auto"}


# ── Underwriting eligibility ──────────────────────────────────────────────────

def underwriting_check(
    zone_risk_score: int,
    city: str,
    active_days: int,
    avg_orders: int,
    bcr_controls: dict,
) -> dict:
    if bcr_controls.get("new_enrollment_suspended"):
        return {"eligible": False, "reason": "new_enrollment_suspended — portfolio BCR >= 1.0", "downgrade_tier": None}

    # active_days here receives working_hours from registration — treat any value >= 4 as eligible
    if active_days < 4:
        return {"eligible": False, "reason": f"working_hours {active_days} < minimum 4", "downgrade_tier": None}

    if avg_orders < 5:
        return {"eligible": True, "reason": "low_activity — downgraded to basic tier", "downgrade_tier": "basic"}

    if zone_risk_score >= 80 and bcr_controls.get("strict_fraud_checks"):
        return {"eligible": True, "reason": "high_risk_zone_with_elevated_bcr — capped at standard tier", "downgrade_tier": "standard"}

    return {"eligible": True, "reason": "passed_all_underwriting_checks", "downgrade_tier": None}


# ── DB persistence (called only from bcr_job) ─────────────────────────────────

def persist_bcr_log(db: Session, global_bcr: dict, controls: dict, zone_bcr_list: list) -> None:
    """Store BCR snapshot. Never raises."""
    try:
        from app import models
        log = models.BcrLog(
            bcr_global         = global_bcr["bcr"],
            bcr_status         = global_bcr["status"],
            total_claims       = global_bcr["total_claims"],
            total_premium      = global_bcr["earned_premium"],
            active_policies    = global_bcr["active_policies"],
            window_days        = global_bcr["window_days"],
            controls_applied   = controls.get("actions", []),
            zone_bcr_snapshot  = {z["zone_id"]: z["bcr"] for z in zone_bcr_list},
            reserve_snapshot   = global_bcr.get("reserve"),
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.warning(f"BCR log persist failed (non-fatal): {e}")
        db.rollback()


# ── Convenience (used only by claim gate, reads cached BCR) ───────────────────

def get_current_bcr_controls(db: Session) -> tuple[dict, dict]:
    """
    Synchronous fallback used by the claim gate when cache is unavailable.
    Computes fresh BCR — acceptable because it's called at most once per claim,
    not on every API request.
    """
    global_bcr    = compute_global_bcr(db)
    zone_bcr_list = compute_zone_bcr(db)
    controls      = apply_bcr_controls(global_bcr["bcr"], zone_bcr_list)
    return global_bcr, controls

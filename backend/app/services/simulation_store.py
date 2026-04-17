"""
simulation_store.py — In-memory simulation state.
All simulated claims are tagged is_simulated=True and never affect real BCR/premium.
"""
from datetime import datetime
from typing import Optional

# ── Singleton state ───────────────────────────────────────────────────────────

_state: dict = {
    "active":      False,
    "type":        None,       # rain | aqi | heat | lockdown
    "value":       0.0,        # e.g. rain_mm=18, aqi=320
    "zone_id":     None,
    "intensity":   "medium",   # low | medium | high
    "duration_min": 30,
    "started_at":  None,       # datetime
    "ends_at":     None,       # datetime
}

# Live claim feed — list of dicts, newest first, capped at 50
# Each dict is mutated in-place as the pipeline advances stages
_sim_claims: list[dict] = []
_sim_claims_index: dict[str, dict] = {}  # id -> dict ref for O(1) mutation


def start_simulation(
    trigger_type: str,
    value: float,
    duration_minutes: int,
    zone_id: str,
    intensity: str,
) -> dict:
    now = datetime.utcnow()
    _state.update({
        "active":       True,
        "type":         trigger_type,
        "value":        value,
        "zone_id":      zone_id,
        "intensity":    intensity,
        "duration_min": duration_minutes,
        "started_at":   now,
        "ends_at":      None,  # computed on read
    })
    _sim_claims.clear()
    _sim_claims_index.clear()
    return get_status()


def stop_simulation() -> dict:
    _state["active"] = False
    _state["ends_at"] = datetime.utcnow()
    return get_status()


def get_status() -> dict:
    if not _state["active"]:
        return {"active": False}
    now     = datetime.utcnow()
    elapsed = (now - _state["started_at"]).total_seconds()
    left    = max(0.0, _state["duration_min"] * 60 - elapsed)
    return {
        "active":          True,
        "type":            _state["type"],
        "value":           _state["value"],
        "zone_id":         _state["zone_id"],
        "intensity":       _state["intensity"],
        "duration_min":    _state["duration_min"],
        "started_at":      _state["started_at"].isoformat(),
        "time_left_sec":   round(left),
        "elapsed_sec":     round(elapsed),
    }


def is_active() -> bool:
    return _state["active"]


def get_sim_signals() -> dict:
    """Return DCS-compatible signals based on current simulation state."""
    if not _state["active"]:
        return {}
    t   = _state["type"]
    v   = _state["value"]
    i   = _state["intensity"]
    mul = {"low": 0.6, "medium": 0.85, "high": 1.0}.get(i, 0.85)

    if t == "rain":
        weather = min(100, (v / 15.0) * 100 * mul)
        return {"weather": weather, "aqi": 10, "traffic": min(100, weather * 0.7),
                "govtAlert": 0, "workerIdle": min(100, weather * 0.6)}
    if t == "aqi":
        aqi_sig = min(100, (v / 300.0) * 100 * mul)
        return {"weather": 5, "aqi": aqi_sig, "traffic": min(100, aqi_sig * 0.4),
                "govtAlert": min(100, aqi_sig * 0.3), "workerIdle": min(100, aqi_sig * 0.5)}
    if t == "heat":
        heat_sig = min(100, ((v - 40) / 8.0) * 100 * mul)
        return {"weather": heat_sig, "aqi": 15, "traffic": min(100, heat_sig * 0.3),
                "govtAlert": 0, "workerIdle": min(100, heat_sig * 0.55)}
    if t == "lockdown":
        return {"weather": 0, "aqi": 0, "traffic": 90 * mul,
                "govtAlert": 100 * mul, "workerIdle": 95 * mul}
    return {}


def add_sim_claim(claim: dict) -> None:
    _sim_claims.insert(0, claim)
    _sim_claims_index[claim["id"]] = claim
    if len(_sim_claims) > 50:
        removed = _sim_claims.pop()
        _sim_claims_index.pop(removed["id"], None)


def update_sim_claim_stage(claim_id: str, stage: str, ts: str) -> None:
    """Mutate the claim dict in-place — frontend sees update on next poll."""
    entry = _sim_claims_index.get(claim_id)
    if entry:
        entry["status"] = stage
        entry["timestamps"][stage] = ts


def get_sim_claims() -> list[dict]:
    return list(_sim_claims)


def clear_sim_claims() -> None:
    _sim_claims.clear()
    _sim_claims_index.clear()


def get_zone_id() -> Optional[str]:
    return _state.get("zone_id")

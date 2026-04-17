"""
mock_api.py — Realistic Zomato / Swiggy platform simulation for Earniq AI.

State is stored in Redis so all uvicorn workers share the same scenario state.
Falls back to in-memory if Redis is unavailable (single-worker dev mode).
"""

import json
import os
import random
import string
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

REDIS_URL    = os.getenv("REDIS_URL", "redis://localhost:6379/0")
_PLAT_KEY    = "mock:platform_state"
_ALERTS_KEY  = "mock:govt_alerts"
_IDLE_KEY    = "mock:zone_idle"

_DEFAULT_PLATFORM = {
    "status": "operational", "degraded_since": None,
    "affected_zones": [], "order_rate_pct": 100,
    "incident_type": None, "surge_multiplier": 1.0,
}

# In-process fallback (single-worker / no Redis)
_mem_platform: dict = dict(_DEFAULT_PLATFORM)
_mem_alerts:   list = []
_mem_idle:     dict = {}
_worker_order_history: dict[str, list] = {}


def _redis_sync():
    try:
        import redis
        return redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=1)
    except Exception:
        return None


def _get_platform() -> dict:
    r = _redis_sync()
    if r:
        try:
            v = r.get(_PLAT_KEY)
            return json.loads(v) if v else dict(_DEFAULT_PLATFORM)
        except Exception:
            pass
    return _mem_platform


def _set_platform(state: dict):
    global _mem_platform
    _mem_platform = state
    r = _redis_sync()
    if r:
        try:
            r.setex(_PLAT_KEY, 86400, json.dumps(state))
        except Exception:
            pass


def _get_alerts() -> list:
    r = _redis_sync()
    if r:
        try:
            v = r.get(_ALERTS_KEY)
            return json.loads(v) if v else []
        except Exception:
            pass
    return _mem_alerts


def _set_alerts(alerts: list):
    global _mem_alerts
    _mem_alerts = alerts
    r = _redis_sync()
    if r:
        try:
            r.setex(_ALERTS_KEY, 86400, json.dumps(alerts))
        except Exception:
            pass


def _get_idle() -> dict:
    r = _redis_sync()
    if r:
        try:
            v = r.get(_IDLE_KEY)
            return json.loads(v) if v else {}
        except Exception:
            pass
    return _mem_idle


def _set_idle(idle: dict):
    global _mem_idle
    _mem_idle = idle
    r = _redis_sync()
    if r:
        try:
            r.setex(_IDLE_KEY, 3600, json.dumps(idle))
        except Exception:
            pass



# ── Order generation helpers ──────────────────────────────────────────────────

def _order_id() -> str:
    return "ORD" + "".join(random.choices(string.digits, k=8))


def _base_orders_per_10min(avg_orders: int, hour: int, is_peak: bool) -> float:
    """Expected orders in a 10-min window based on worker profile and time of day."""
    if is_peak:
        return round(avg_orders * 0.18, 2)   # 18% of daily in peak 10-min slot
    if 7 <= hour <= 22:
        return round(avg_orders * 0.06, 2)
    return round(avg_orders * 0.01, 2)


def _disruption_multiplier(zone_id: str) -> float:
    state = _get_platform()
    base  = state["order_rate_pct"] / 100.0
    if state["affected_zones"] and zone_id not in state["affected_zones"]:
        return 1.0
    return base


def _generate_order(worker_id: str, value: float, status: str) -> dict:
    now = datetime.utcnow()
    return {
        "order_id":       _order_id(),
        "worker_id":      worker_id,
        "restaurant":     random.choice([
            "Domino's", "McDonald's", "Burger King", "KFC", "Pizza Hut",
            "Subway", "Biryani Blues", "Haldiram's", "Wow Momo", "Barbeque Nation",
        ]),
        "order_value":    round(value, 2),
        "delivery_fee":   round(value * 0.12, 2),
        "surge_fee":      round(value * 0.12 * (_platform_state["surge_multiplier"] - 1.0), 2),
        "status":         status,   # assigned | picked_up | delivered | cancelled
        "assigned_at":    now.isoformat(),
        "estimated_delivery_min": random.randint(20, 45),
    }


# ── Platform status endpoints ─────────────────────────────────────────────────

@router.get("/platform/status")
def platform_status():
    state = _get_platform()
    return {
        "platform":         "zomato_swiggy_mock",
        "status":           state["status"],
        "order_rate_pct":   state["order_rate_pct"],
        "affected_zones":   state["affected_zones"],
        "incident_type":    state["incident_type"],
        "degraded_since":   state["degraded_since"],
        "surge_multiplier": state["surge_multiplier"],
        "timestamp":        datetime.utcnow().isoformat(),
    }


@router.get("/platform/worker/{worker_id}")
def worker_orders(worker_id: str, avg_orders: int = 20, zone_id: str = ""):
    """
    Per-worker order assignment feed.
    Returns orders completed in last 10 min vs expected baseline.
    """
    now     = datetime.utcnow()
    hour    = now.hour
    is_peak = (12 <= hour <= 14) or (19 <= hour <= 21)
    expected = _base_orders_per_10min(avg_orders, hour, is_peak)

    state   = _get_platform()
    mult    = _disruption_multiplier(zone_id)
    noise   = random.uniform(0.82, 1.18)
    actual  = round(expected * mult * noise, 2)

    app_state = "active_seeking"
    if state["status"] == "down":
        actual    = 0.0
        app_state = "offline"
    elif state["status"] == "degraded":
        app_state = "active_seeking"
        actual    = round(actual * 0.4, 2)

    loss_pct = round(max(0.0, (expected - actual) / max(expected, 0.01) * 100), 1)

    # Generate order objects for history
    orders_this_window = []
    for _ in range(int(actual)):
        order_val = random.uniform(150, 600)
        status    = "delivered" if random.random() > 0.08 else "cancelled"
        orders_this_window.append(_generate_order(worker_id, order_val, status))

    # Keep last 20 orders in history
    hist = _worker_order_history.setdefault(worker_id, [])
    hist.extend(orders_this_window)
    _worker_order_history[worker_id] = hist[-20:]

    # Update zone idle cache via Redis
    idle_cache = _get_idle()
    if zone_id:
        prev = idle_cache.get(zone_id, 0.0)
        idle_cache[zone_id] = round(prev * 0.7 + loss_pct * 0.3, 1)
        _set_idle(idle_cache)

    return {
        "worker_id":                   worker_id,
        "orders_completed_last_10min": actual,
        "orders_expected_p50":         expected,
        "loss_pct":                    loss_pct,
        "app_state":                   app_state,
        "platform_status":             state["status"],
        "surge_multiplier":            state["surge_multiplier"],
        "is_peak_hour":                is_peak,
        "hour":                        hour,
        "recent_orders":               orders_this_window,
        "timestamp":                   now.isoformat(),
    }


@router.get("/platform/worker/{worker_id}/history")
def worker_order_history(worker_id: str):
    """Returns last 20 orders for a worker."""
    return {
        "worker_id": worker_id,
        "orders":    _worker_order_history.get(worker_id, []),
        "count":     len(_worker_order_history.get(worker_id, [])),
    }


@router.get("/platform/zone/{zone_id}/idle")
def zone_idle(zone_id: str):
    state = _get_platform()
    idle  = _get_idle().get(zone_id, 0.0)
    if state["status"] == "down":
        idle = 100.0
    elif state["status"] == "degraded":
        if not state["affected_zones"] or zone_id in state["affected_zones"]:
            idle = min(100.0, idle + 40.0)
    return {"zone_id": zone_id, "worker_idle_pct": idle,
            "platform_status": state["status"], "timestamp": datetime.utcnow().isoformat()}


@router.get("/platform/zones/idle")
def all_zones_idle():
    state = _get_platform()
    return {"zones": _get_idle(), "platform": state["status"],
            "timestamp": datetime.utcnow().isoformat()}


# ── Govt alert endpoints ──────────────────────────────────────────────────────

@router.get("/govt/alerts")
def govt_alerts(city: str = "all"):
    now    = datetime.utcnow()
    alerts = _get_alerts()
    active = [
        a for a in alerts
        if (city == "all" or a["city"] == city)
        and datetime.fromisoformat(a["expires_at"]) > now
    ]
    return {"alerts": active, "count": len(active), "timestamp": now.isoformat()}


@router.get("/govt/alerts/{zone_id}")
def govt_alerts_zone(zone_id: str):
    now    = datetime.utcnow()
    alerts = _get_alerts()
    active = [
        a for a in alerts
        if zone_id in a.get("zones", [])
        and datetime.fromisoformat(a["expires_at"]) > now
    ]
    signal = 0.0
    if active:
        types  = [a["alert_type"] for a in active]
        signal = 100.0 if any(t in ("curfew", "section_144", "bandh") for t in types) else 60.0
    return {"zone_id": zone_id, "alerts": active, "signal": signal,
            "timestamp": now.isoformat()}


# ── Demo control endpoints ────────────────────────────────────────────────────

class PlatformControl(BaseModel):
    status:           str            # operational | degraded | down
    order_rate_pct:   int   = 100
    affected_zones:   list[str] = []
    incident_type:    Optional[str] = None
    surge_multiplier: float = 1.0


@router.post("/platform/control")
def control_platform(req: PlatformControl):
    state = {
        "status": req.status, "order_rate_pct": req.order_rate_pct,
        "affected_zones": req.affected_zones, "incident_type": req.incident_type,
        "surge_multiplier": req.surge_multiplier,
        "degraded_since": datetime.utcnow().isoformat() if req.status != "operational" else None,
    }
    _set_platform(state)
    return {"message": f"Platform set to {req.status}", "state": state}


@router.post("/platform/reset")
def reset_platform():
    _set_platform(dict(_DEFAULT_PLATFORM))
    _set_idle({})
    return {"message": "Platform reset to operational"}


class GovtAlertCreate(BaseModel):
    alert_type:   str        # curfew | section_144 | cyclone | bandh | flood_advisory
    city:         str
    zones:        list[str]
    description:  str
    duration_hrs: int = 6


@router.post("/govt/alert")
def create_govt_alert(req: GovtAlertCreate):
    alerts = _get_alerts()
    alert  = {
        "id":          f"GOVT_{len(alerts)+1:04d}",
        "alert_type":  req.alert_type, "city": req.city, "zones": req.zones,
        "description": req.description,
        "issued_at":   datetime.utcnow().isoformat(),
        "expires_at":  (datetime.utcnow() + timedelta(hours=req.duration_hrs)).isoformat(),
        "signal":      100.0,
    }
    alerts.append(alert)
    _set_alerts(alerts)
    return {"message": "Alert created", "alert": alert}


@router.delete("/govt/alerts/clear")
def clear_govt_alerts():
    _set_alerts([])
    return {"message": "All alerts cleared"}


# ── Scenario presets (one-click demo triggers) ───────────────────────────────

class ScenarioRequest(BaseModel):
    zone_ids: list[str] = []
    city:     str = "chennai"


@router.post("/scenario/heavy-rain")
def scenario_heavy_rain(req: ScenarioRequest):
    _set_platform({"status": "degraded", "order_rate_pct": 20, "affected_zones": req.zone_ids,
                   "incident_type": "flooding", "surge_multiplier": 1.8,
                   "degraded_since": datetime.utcnow().isoformat()})
    alerts = _get_alerts()
    alert  = {"id": f"GOVT_{len(alerts)+1:04d}", "alert_type": "flood_advisory",
               "city": req.city, "zones": req.zone_ids,
               "description": "IMD Heavy Rain Warning — avoid low-lying areas",
               "issued_at": datetime.utcnow().isoformat(),
               "expires_at": (datetime.utcnow() + timedelta(hours=6)).isoformat(), "signal": 60.0}
    alerts.append(alert)
    _set_alerts(alerts)
    return {"scenario": "heavy_rain", "platform": _get_platform(), "alert": alert}


@router.post("/scenario/aqi-alert")
def scenario_aqi_alert(req: ScenarioRequest):
    _set_platform({"status": "degraded", "order_rate_pct": 50, "affected_zones": req.zone_ids,
                   "incident_type": "aqi", "surge_multiplier": 1.3,
                   "degraded_since": datetime.utcnow().isoformat()})
    alerts = _get_alerts()
    alert  = {"id": f"GOVT_{len(alerts)+1:04d}", "alert_type": "section_144",
               "city": req.city, "zones": req.zone_ids,
               "description": "CPCB Severe AQI Advisory — restrict outdoor movement",
               "issued_at": datetime.utcnow().isoformat(),
               "expires_at": (datetime.utcnow() + timedelta(hours=12)).isoformat(), "signal": 60.0}
    alerts.append(alert)
    _set_alerts(alerts)
    return {"scenario": "aqi_alert", "platform": _get_platform(), "alert": alert}


@router.post("/scenario/platform-outage")
def scenario_platform_outage(req: ScenarioRequest):
    _set_platform({"status": "down", "order_rate_pct": 0, "affected_zones": [],
                   "incident_type": "outage", "surge_multiplier": 1.0,
                   "degraded_since": datetime.utcnow().isoformat()})
    return {"scenario": "platform_outage", "platform": _get_platform()}


@router.post("/scenario/lockdown")
def scenario_lockdown(req: ScenarioRequest):
    _set_platform({"status": "down", "order_rate_pct": 0, "affected_zones": req.zone_ids,
                   "incident_type": "bandh", "surge_multiplier": 1.0,
                   "degraded_since": datetime.utcnow().isoformat()})
    alerts = _get_alerts()
    alert  = {"id": f"GOVT_{len(alerts)+1:04d}", "alert_type": "section_144",
               "city": req.city, "zones": req.zone_ids,
               "description": "Section 144 imposed — all public movement banned",
               "issued_at": datetime.utcnow().isoformat(),
               "expires_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(), "signal": 100.0}
    alerts.append(alert)
    _set_alerts(alerts)
    return {"scenario": "lockdown", "platform": _get_platform(), "alert": alert}


# ── Status overview ───────────────────────────────────────────────────────────

@router.get("/status")
def mock_status():
    now    = datetime.utcnow()
    alerts = _get_alerts()
    active = [a for a in alerts if datetime.fromisoformat(a["expires_at"]) > now]
    return {"platform": _get_platform(), "active_govt_alerts": len(active),
            "alerts": active, "zone_idle_cache": _get_idle(),
            "workers_tracked": len(_worker_order_history)}

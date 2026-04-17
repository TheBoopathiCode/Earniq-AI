"""
fraud/mock_apis.py — Live data fetchers for the fraud engine Layer 1.

Replaces hardcoded stubs with real synchronous wrappers around:
  - Open-Meteo (weather) — free, no key
  - Internal mock platform API (/api/mock/platform/status)
"""
import os
import httpx

TIMEOUT      = 5.0
INTERNAL_URL = os.getenv("INTERNAL_BASE_URL", "http://localhost:8000")


def get_weather(lat: float, lng: float) -> dict:
    """Synchronous weather fetch for use inside fraud Layer 1 (sync context)."""
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lng}"
            f"&current=rain,apparent_temperature"
            f"&timezone=Asia%2FKolkata"
        )
        r    = httpx.get(url, timeout=TIMEOUT)
        cur  = r.json().get("current", {})
        return {
            "rain_1h":    float(cur.get("rain", 0.0)),
            "feels_like": float(cur.get("apparent_temperature", 30.0)),
            "source":     "open-meteo",
        }
    except Exception:
        # Fail open — do not block legitimate claims on API timeout
        return {"rain_1h": 0.0, "feels_like": 30.0, "source": "fallback"}


def get_platform_status() -> dict:
    """Synchronous platform status fetch from internal mock API."""
    try:
        r    = httpx.get(f"{INTERNAL_URL}/api/mock/platform/status", timeout=3.0)
        data = r.json()
        return {
            "status":               data.get("status", "operational"),
            "active_orders_in_zone": data.get("order_rate_pct", 100),
        }
    except Exception:
        # Fail open — unknown platform state should not block claims
        return {"status": "unknown", "active_orders_in_zone": 50}


def get_disruption_event(event_id: str) -> dict:
    """Returns disruption event metadata. Checks DB via internal API."""
    try:
        r    = httpx.get(f"{INTERNAL_URL}/api/mock/status", timeout=3.0)
        data = r.json()
        # If any active govt alert exists, treat disruption as active
        active = data.get("active_govt_alerts", 0) > 0
        return {"event_id": event_id, "active": active, "dcs_score": 75.0 if active else 30.0}
    except Exception:
        return {"event_id": event_id, "active": True, "dcs_score": 75.0}

"""
external_api.py — All live data fetchers for Earniq AI.

Sources:
  1. Open-Meteo        — weather (rain, heat, wind, humidity)  [free, no key]
  2. Open-Meteo AQ     — AQI (pm2.5, pm10, european_aqi)       [free, no key]
  3. Mock Platform API — Zomato/Swiggy order feed              [internal /api/mock]
  4. Mock Govt API     — curfew / Section 144 / cyclone alerts  [internal /api/mock]
  5. Google Maps       — traffic congestion (optional, key-gated)

DCS weights (README spec, sum = 1.0):
  weather × 0.35 | aqi × 0.20 | traffic × 0.15 | govt × 0.20 | idle × 0.10
"""

import asyncio
import logging
import os
import httpx

logger   = logging.getLogger("earniq.external")
TIMEOUT  = 6.0
BASE_URL = os.getenv("INTERNAL_BASE_URL", "http://localhost:8000")


# ── 1. Weather (Open-Meteo, free, no key) ────────────────────────────────────

async def get_weather(lat: float, lon: float) -> dict:
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            f"&current=rain,temperature_2m,apparent_temperature,wind_speed_10m,relative_humidity_2m"
            f"&timezone=Asia%2FKolkata"
        )
        async with httpx.AsyncClient(timeout=TIMEOUT) as c:
            r = await c.get(url)
            cur = r.json().get("current", {})
            return {
                "rain":        float(cur.get("rain", 0.0)),
                "temperature": float(cur.get("temperature_2m", 30.0)),
                "feels_like":  float(cur.get("apparent_temperature", 30.0)),
                "wind_speed":  float(cur.get("wind_speed_10m", 0.0)),
                "humidity":    float(cur.get("relative_humidity_2m", 50.0)),
                "source":      "open-meteo",
            }
    except Exception as e:
        logger.warning(f"Weather API failed ({e}) — using fallback")
        return {"rain": 0.0, "temperature": 30.0, "feels_like": 30.0,
                "wind_speed": 0.0, "humidity": 50.0, "source": "fallback"}


# ── 2. AQI (Open-Meteo Air Quality, free, no key) ────────────────────────────

async def get_aqi(lat: float, lon: float) -> dict:
    try:
        url = (
            f"https://air-quality-api.open-meteo.com/v1/air-quality"
            f"?latitude={lat}&longitude={lon}"
            f"&current=pm2_5,pm10,european_aqi"
            f"&timezone=Asia%2FKolkata"
        )
        async with httpx.AsyncClient(timeout=TIMEOUT) as c:
            r = await c.get(url)
            cur = r.json().get("current", {})
            european_aqi = float(cur.get("european_aqi", 50))
            # Scale European AQI (0-500) to Indian AQI equivalent
            aqi = min(500, int(european_aqi * 1.2))
            return {
                "aqi":    aqi,
                "pm2_5":  float(cur.get("pm2_5", 0.0)),
                "pm10":   float(cur.get("pm10", 0.0)),
                "source": "open-meteo-airquality",
            }
    except Exception as e:
        logger.warning(f"AQI API failed ({e}) — using fallback")
        return {"aqi": 80, "pm2_5": 0.0, "pm10": 0.0, "source": "fallback"}


# ── 3. Traffic signal ─────────────────────────────────────────────────────────

async def get_traffic_signal(zone_risk: int, lat: float = 0, lon: float = 0) -> float:
    """
    Uses Google Maps Distance Matrix if GOOGLE_MAPS_API_KEY is set.
    Falls back to zone_risk-based proxy.
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if api_key:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as c:
                r = await c.get(
                    "https://maps.googleapis.com/maps/api/distancematrix/json",
                    params={
                        "origins":          f"{lat},{lon}",
                        "destinations":     f"{lat + 0.02},{lon + 0.02}",
                        "departure_time":   "now",
                        "key":              api_key,
                    }
                )
                data = r.json()
                el   = data.get("rows", [{}])[0].get("elements", [{}])[0]
                dur_traffic = el.get("duration_in_traffic", {}).get("value", 0)
                dur_normal  = el.get("duration", {}).get("value", 1)
                ratio       = dur_traffic / max(dur_normal, 1)
                return round(min(100.0, (ratio - 1.0) * 100), 1)
        except Exception as e:
            logger.warning(f"Google Maps API failed ({e})")
    # Proxy: zone risk correlates with congestion
    return round(min(100.0, zone_risk * 0.65), 1)


# ── 4. Platform order feed (internal mock API) ───────────────────────────────

async def get_platform_worker_signal(worker_id: str, avg_orders: int) -> dict:
    """
    Fetches per-worker order data from the internal mock platform API.
    Returns worker_idle_pct (0-100) and raw order data.
    """
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(
                f"{BASE_URL}/api/mock/platform/worker/{worker_id}",
                params={"avg_orders": avg_orders},
            )
            data = r.json()
            loss_pct    = float(data.get("loss_pct", 0.0))
            app_state   = data.get("app_state", "active_seeking")
            plat_status = data.get("platform_status", "operational")

            # Convert to 0-100 idle signal
            idle_signal = loss_pct
            if app_state in ("offline", "background"):
                idle_signal = min(100.0, idle_signal + 20)
            if plat_status == "down":
                idle_signal = 100.0
            elif plat_status == "degraded":
                idle_signal = min(100.0, idle_signal + 30)

            return {
                "worker_idle_pct":    round(idle_signal, 1),
                "orders_actual":      data.get("orders_completed_last_10min", 0),
                "orders_expected":    data.get("orders_expected_p50", 0),
                "loss_pct":           loss_pct,
                "app_state":          app_state,
                "platform_status":    plat_status,
                "infra_outage_signal": 100.0 if plat_status == "down" else
                                       50.0  if plat_status == "degraded" else 0.0,
                "source":             "mock_platform",
            }
    except Exception as e:
        logger.warning(f"Platform API failed for worker {worker_id} ({e})")
        return {
            "worker_idle_pct": 0.0, "orders_actual": 0, "orders_expected": 0,
            "loss_pct": 0.0, "app_state": "unknown", "platform_status": "unknown",
            "infra_outage_signal": 0.0, "source": "fallback",
        }


async def get_platform_zone_idle(zone_id: str, worker_ids: list[str], avg_orders: int = 15) -> dict:
    """
    Aggregate platform idle signal across all workers in a zone.
    Returns zone-level worker_idle_pct and infra_outage_signal.
    """
    if not worker_ids:
        # Use platform status endpoint for zone-level check
        try:
            async with httpx.AsyncClient(timeout=3.0) as c:
                r    = await c.get(f"{BASE_URL}/api/mock/platform/status")
                data = r.json()
                status = data.get("status", "operational")
                rate   = data.get("order_rate_pct", 100)
                idle   = max(0.0, 100.0 - rate)
                return {
                    "worker_idle_pct":    idle,
                    "infra_outage_signal": 100.0 if status == "down" else
                                           50.0  if status == "degraded" else 0.0,
                    "platform_status":    status,
                    "source":             "mock_platform_status",
                }
        except Exception:
            return {"worker_idle_pct": 0.0, "infra_outage_signal": 0.0,
                    "platform_status": "unknown", "source": "fallback"}

    tasks   = [get_platform_worker_signal(wid, avg_orders) for wid in worker_ids[:20]]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    valid   = [r for r in results if isinstance(r, dict)]
    if not valid:
        return {"worker_idle_pct": 0.0, "infra_outage_signal": 0.0,
                "platform_status": "unknown", "source": "fallback"}

    avg_idle   = sum(v["worker_idle_pct"] for v in valid) / len(valid)
    avg_outage = max(v["infra_outage_signal"] for v in valid)
    return {
        "worker_idle_pct":    round(avg_idle, 1),
        "infra_outage_signal": avg_outage,
        "platform_status":    valid[0].get("platform_status", "unknown"),
        "workers_sampled":    len(valid),
        "source":             "mock_platform_aggregate",
    }


# ── 5. Govt alert signal (internal mock API) ─────────────────────────────────

async def get_govt_signal(zone_id: str) -> float:
    """Returns 0-100 govt alert signal for a zone."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r    = await c.get(f"{BASE_URL}/api/mock/govt/alerts/{zone_id}")
            data = r.json()
            return float(data.get("signal", 0))
    except Exception:
        return 0.0


# ── 6. Full live signal bundle (used by disruption monitor + dashboard) ───────

async def get_live_signals(
    lat: float,
    lon: float,
    zone_risk: int,
    zone_id: str = "",
    worker_ids: list[str] | None = None,
) -> dict:
    """
    Fetch all 8 DCS signals concurrently.
    DCS = weather×0.35 + aqi×0.20 + traffic×0.15 + govt×0.20 + idle×0.10
    """
    worker_ids = worker_ids or []

    weather_task  = get_weather(lat, lon)
    aqi_task      = get_aqi(lat, lon)
    traffic_task  = get_traffic_signal(zone_risk, lat, lon)
    platform_task = get_platform_zone_idle(zone_id, worker_ids)
    govt_task     = get_govt_signal(zone_id)

    weather, aqi_data, traffic_raw, platform, govt_signal = await asyncio.gather(
        weather_task, aqi_task, traffic_task, platform_task, govt_task,
        return_exceptions=True,
    )

    # Safe-unwrap exceptions
    if isinstance(weather, Exception):
        weather = {"rain": 0.0, "feels_like": 30.0, "wind_speed": 0.0,
                   "humidity": 50.0, "temperature": 30.0, "source": "error"}
    if isinstance(aqi_data, Exception):
        aqi_data = {"aqi": 80, "pm2_5": 0.0, "pm10": 0.0, "source": "error"}
    if isinstance(traffic_raw, Exception):
        traffic_raw = zone_risk * 0.65
    if isinstance(platform, Exception):
        platform = {"worker_idle_pct": 0.0, "infra_outage_signal": 0.0,
                    "platform_status": "unknown", "source": "error"}
    if isinstance(govt_signal, Exception):
        govt_signal = 0.0

    rain       = float(weather.get("rain", 0.0))
    feels_like = float(weather.get("feels_like", 30.0))
    aqi        = int(aqi_data.get("aqi", 80))

    # Convert raw values → 0-100 signal scores
    rain_signal  = min(100.0, rain * 6.0)              # 15 mm/hr → 90
    heat_signal  = max(0.0, (feels_like - 35.0) * 5.0) # 44°C → 45
    aqi_signal   = min(100.0, aqi / 4.0)               # 400 AQI → 100
    weather_score = max(rain_signal, heat_signal)

    traffic_signal  = float(traffic_raw) if not isinstance(traffic_raw, dict) else 0.0
    worker_idle_pct = float(platform.get("worker_idle_pct", 0.0))
    infra_outage    = float(platform.get("infra_outage_signal", 0.0))
    govt_score      = float(govt_signal)

    # DCS — README weights
    dcs = round(
        weather_score  * 0.35 +
        aqi_signal     * 0.20 +
        traffic_signal * 0.15 +
        govt_score     * 0.20 +
        worker_idle_pct * 0.10,
        1,
    )

    return {
        # Named signals (used by DCS engine + fraud engine)
        "weather":     round(weather_score, 1),
        "aqi":         round(aqi_signal, 1),
        "traffic":     round(traffic_signal, 1),
        "govtAlert":   round(govt_score, 1),
        "workerIdle":  round(worker_idle_pct, 1),
        "bioAlert":    0.0,
        "conflict":    0.0,
        "infraOutage": round(infra_outage, 1),
        "dcs_score":   dcs,
        # Raw values for dashboard display
        "raw": {
            "rain_mm":          rain,
            "feels_like_c":     feels_like,
            "aqi_index":        aqi,
            "wind_kmh":         float(weather.get("wind_speed", 0.0)),
            "humidity_pct":     float(weather.get("humidity", 50.0)),
            "pm2_5":            float(aqi_data.get("pm2_5", 0.0)),
            "pm10":             float(aqi_data.get("pm10", 0.0)),
            "platform_status":  platform.get("platform_status", "unknown"),
            "orders_loss_pct":  worker_idle_pct,
        },
        "sources": {
            "weather":  weather.get("source", "unknown"),
            "aqi":      aqi_data.get("source", "unknown"),
            "platform": platform.get("source", "unknown"),
            "traffic":  "google_maps" if os.getenv("GOOGLE_MAPS_API_KEY") else "zone_risk_proxy",
            "govt":     "mock_govt_api",
        },
    }


# ── 7. Batch zone polling (used by disruption monitor) ───────────────────────

async def get_live_signals_for_zones(zones: list[dict]) -> dict[str, dict]:
    """
    Poll all zones concurrently. zones = list of {zone_id, lat, lon, risk_score, worker_ids}.
    Returns {zone_id: signals_dict}.
    """
    async def _fetch(z: dict) -> tuple[str, dict]:
        sig = await get_live_signals(
            lat=z["lat"], lon=z["lon"],
            zone_risk=z["risk_score"],
            zone_id=z["zone_id"],
            worker_ids=z.get("worker_ids", []),
        )
        return z["zone_id"], sig

    results = await asyncio.gather(*[_fetch(z) for z in zones], return_exceptions=True)
    out = {}
    for r in results:
        if isinstance(r, tuple):
            out[r[0]] = r[1]
    return out

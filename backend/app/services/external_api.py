"""
Real external data fetchers.
- Weather: Open-Meteo (free, no API key)
- AQI: Open-Meteo air quality (free, no API key)
"""
import httpx
from typing import Optional

TIMEOUT = 5.0

async def get_weather(lat: float, lon: float) -> dict:
    """Returns current rain (mm/hr) and temperature."""
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            f"&current=rain,temperature_2m,apparent_temperature,wind_speed_10m"
            f"&timezone=Asia%2FKolkata"
        )
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(url)
            data = r.json()
            current = data.get("current", {})
            return {
                "rain": current.get("rain", 0.0),
                "temperature": current.get("temperature_2m", 30.0),
                "feels_like": current.get("apparent_temperature", 30.0),
                "wind_speed": current.get("wind_speed_10m", 0.0),
                "source": "open-meteo"
            }
    except Exception:
        return {"rain": 0.0, "temperature": 30.0, "feels_like": 30.0, "wind_speed": 0.0, "source": "fallback"}


async def get_aqi(lat: float, lon: float) -> dict:
    """Returns current AQI using Open-Meteo air quality API."""
    try:
        url = (
            f"https://air-quality-api.open-meteo.com/v1/air-quality"
            f"?latitude={lat}&longitude={lon}"
            f"&current=pm2_5,pm10,european_aqi"
            f"&timezone=Asia%2FKolkata"
        )
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.get(url)
            data = r.json()
            current = data.get("current", {})
            european_aqi = current.get("european_aqi", 50)
            # Convert European AQI (0-500) to Indian AQI scale roughly
            aqi = min(500, int(european_aqi * 1.2))
            return {
                "aqi": aqi,
                "pm2_5": current.get("pm2_5", 0.0),
                "pm10": current.get("pm10", 0.0),
                "source": "open-meteo-airquality"
            }
    except Exception:
        return {"aqi": 100, "pm2_5": 0.0, "pm10": 0.0, "source": "fallback"}


async def get_live_signals(lat: float, lon: float, zone_risk: int) -> dict:
    """Fetch real weather + AQI and compute DCS signals."""
    import asyncio
    weather, aqi_data = await asyncio.gather(
        get_weather(lat, lon),
        get_aqi(lat, lon)
    )

    rain = weather["rain"]
    feels_like = weather["feels_like"]
    aqi = aqi_data["aqi"]

    # Convert to 0-100 signal scores
    weather_signal = min(100, rain * 6)           # 15mm/hr = 90 signal
    heat_signal    = max(0, (feels_like - 35) * 5) # 44°C = 45 signal
    aqi_signal     = min(100, aqi / 4)             # 400 AQI = 100 signal
    traffic_signal = zone_risk * 0.4               # proxy from zone risk

    weather_score = max(weather_signal, heat_signal)

    dcs = round(
        weather_score  * 0.25 +
        aqi_signal     * 0.15 +
        traffic_signal * 0.10,
        1
    )

    return {
        "weather": round(weather_score, 1),
        "aqi": round(aqi_signal, 1),
        "traffic": round(traffic_signal, 1),
        "govtAlert": 0,
        "workerIdle": 0,
        "bioAlert": 0,
        "conflict": 0,
        "infraOutage": 0,
        "dcs_score": dcs,
        "raw": {
            "rain_mm": rain,
            "feels_like_c": feels_like,
            "aqi_index": aqi,
            "wind_kmh": weather["wind_speed"]
        },
        "sources": {
            "weather": weather["source"],
            "aqi": aqi_data["source"]
        }
    }

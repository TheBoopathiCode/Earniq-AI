import os
import joblib
import pandas as pd

_premium_model  = None
_coverage_model = None

_PREMIUM_FEATURES  = ["zone_risk", "rain", "aqi", "traffic", "claims", "consistency",
                       "waterlogging_history", "forecast_rain_48h", "forecast_aqi_48h"]
_COVERAGE_FEATURES = ["zone_risk", "forecast_rain_48h", "forecast_aqi_48h", "waterlogging_history"]

_DIR = os.path.dirname(__file__)

def _load_premium():
    global _premium_model
    if _premium_model is None:
        p = os.path.join(_DIR, "premium_model.pkl")
        if os.path.exists(p):
            _premium_model = joblib.load(p)
    return _premium_model

def _load_coverage():
    global _coverage_model
    if _coverage_model is None:
        p = os.path.join(_DIR, "coverage_model.pkl")
        if os.path.exists(p):
            _coverage_model = joblib.load(p)
    return _coverage_model

# Zone waterlogging history (0-100) — derived from zone characteristics
ZONE_WATERLOGGING = {
    "ch-vel": 72, "ch-tam": 80, "ch-omr": 15, "ch-ana": 28, "ch-tna": 42,
    "dl-dwk": 55, "dl-ito": 78, "dl-sdl": 22, "dl-cp":  48, "dl-noi": 12,
    "mb-krl": 68, "mb-drv": 85, "mb-bnd": 40, "mb-sio": 60, "mb-anr": 30,
    "hyd-lbn":65, "hyd-nar":58, "hyd-wht":10, "hyd-ban":20, "hyd-sec":38,
    "kol-slt":18, "kol-how":55, "kol-gar":32, "kol-dum":50, "kol-new":12,
}

def predict_premium(
    zone_risk: int,
    rain: float = 0,
    aqi: float = 100,
    traffic: float = 5,
    claims: int = 0,
    consistency: float = 0.85,
    waterlogging_history: int = 50,
    forecast_rain_48h: float = 0,
    forecast_aqi_48h: float = 100,
) -> float:
    model = _load_premium()
    if model is None:
        from app.services.premium_engine import calculate_premium
        return float(calculate_premium(zone_risk, claims)["final_premium"])

    features = pd.DataFrame([[
        zone_risk, rain, aqi, traffic, claims, consistency,
        waterlogging_history, forecast_rain_48h, forecast_aqi_48h
    ]], columns=_PREMIUM_FEATURES)
    pred = model.predict(features)[0]
    return float(max(8.0, min(28.0, round(pred, 2))))

def predict_coverage_hours(
    zone_risk: int,
    forecast_rain_48h: float = 0,
    forecast_aqi_48h: float = 100,
    waterlogging_history: int = 50,
) -> int:
    model = _load_coverage()
    if model is None:
        if forecast_rain_48h > 15 or forecast_aqi_48h > 200:
            return 24
        elif forecast_rain_48h > 5 or forecast_aqi_48h > 150:
            return 16
        return 8

    features = pd.DataFrame([[
        zone_risk, forecast_rain_48h, forecast_aqi_48h, waterlogging_history
    ]], columns=_COVERAGE_FEATURES)
    return int(model.predict(features)[0])

def get_zone_waterlogging(zone_id: str) -> int:
    return ZONE_WATERLOGGING.get(zone_id, 50)

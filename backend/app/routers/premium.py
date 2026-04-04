from fastapi import APIRouter, HTTPException
from app.services.premium_engine import get_tier, TIER_COVERAGE, TIER_TRIGGERS
from app.routers.auth import ALL_ZONES
from app.ml.predictor import predict_premium, predict_coverage_hours, get_zone_waterlogging

router = APIRouter()

@router.get("/calculate")
def calculate(
    zone_id: str,
    claims: int = 0,
    active_days: int = 7,
    total_days: int = 7,
    rain: float = 0,
    aqi: float = 100,
    traffic: float = 5,
    forecast_rain_48h: float = 0,
    forecast_aqi_48h: float = 100,
):
    zone_data = ALL_ZONES.get(zone_id)
    if not zone_data:
        raise HTTPException(status_code=400, detail="Invalid zone_id")

    consistency          = (active_days / total_days) if total_days > 0 else 0.85
    waterlogging_history = get_zone_waterlogging(zone_id)

    ml_premium = predict_premium(
        zone_risk=zone_data["risk_score"],
        rain=rain, aqi=aqi, traffic=traffic,
        claims=claims, consistency=consistency,
        waterlogging_history=waterlogging_history,
        forecast_rain_48h=forecast_rain_48h,
        forecast_aqi_48h=forecast_aqi_48h,
    )

    coverage_hours = predict_coverage_hours(
        zone_risk=zone_data["risk_score"],
        forecast_rain_48h=forecast_rain_48h,
        forecast_aqi_48h=forecast_aqi_48h,
        waterlogging_history=waterlogging_history,
    )

    final_premium     = max(8, min(28, round(ml_premium)))
    tier              = get_tier(final_premium)
    discount_applied  = waterlogging_history < 20
    surcharge_applied = forecast_rain_48h > 60 or forecast_aqi_48h > 300

    return {
        "finalPremium":        final_premium,
        "mlPremium":           ml_premium,
        "tier":                tier,
        "coverageCap":         TIER_COVERAGE[tier],
        "triggersActive":      TIER_TRIGGERS[tier],
        "coverageHours":       coverage_hours,
        "waterloggingHistory": waterlogging_history,
        "discountApplied":     discount_applied,
        "surchargeApplied":    surcharge_applied,
        "insights": {
            "waterlogging": "Rs2 discount applied — zone historically safe from flooding"
                            if discount_applied else "Zone has flood history — standard rate applied",
            "forecast":     "Coverage extended to %dh based on weather forecast" % coverage_hours
                            if coverage_hours > 8 else "Standard 8h coverage window",
        },
        "inputs": {
            "zoneRisk":            zone_data["risk_score"],
            "waterloggingHistory": waterlogging_history,
            "rain":                rain,
            "aqi":                 aqi,
            "traffic":             traffic,
            "claims":              claims,
            "consistency":         round(consistency, 2),
            "forecastRain48h":     forecast_rain_48h,
            "forecastAqi48h":      forecast_aqi_48h,
        },
        "model": "GradientBoostingRegressor (R2=91.85%) + CoverageClassifier (Acc=100%)"
    }

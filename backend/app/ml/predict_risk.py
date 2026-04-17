"""
Prediction interface for the Earniq XGBoost risk scorer.
Returns risk_score (0–100), risk_tier, and human-readable explanation.
"""
from pathlib import Path
from typing import Optional
import pandas as pd
import joblib

BASE_DIR   = Path(__file__).parent
_artifact  = None

FEATURES = [
    "zone_flood_history",
    "zone_aqi_baseline",
    "zone_traffic_density",
    "worker_years_active",
    "weekly_avg_orders",
    "claim_count_8w",
    "platform_type",
    "working_hours_per_day",
]


def _load():
    global _artifact
    if _artifact is None:
        path = BASE_DIR / "risk_model.pkl"
        if not path.exists():
            from app.ml.train_risk_model import train
            train()
        _artifact = joblib.load(path)
    return _artifact


def _explain(features: dict) -> list[str]:
    reasons = []
    if features.get("zone_flood_history", 0) > 0.6:
        reasons.append("High flood risk zone")
    if features.get("zone_aqi_baseline", 0) > 250:
        reasons.append("High AQI baseline")
    if features.get("claim_count_8w", 0) >= 4:
        reasons.append("Frequent recent claims")
    if features.get("zone_traffic_density", 0) > 0.7:
        reasons.append("High traffic density")
    if features.get("worker_years_active", 5) <= 1:
        reasons.append("Low experience")
    return reasons


def predict_risk(worker_features: dict) -> dict:
    """
    Args:
        worker_features: dict with keys matching FEATURES list

    Returns:
        {
            "risk_score": int (0–100),
            "risk_tier":  "LOW" | "MEDIUM" | "HIGH",
            "explanation": list[str]
        }
    """
    artifact = _load()
    model    = artifact["model"]

    X = pd.DataFrame(
        [[float(worker_features.get(f, 0.0)) for f in FEATURES]],
        columns=FEATURES,
    )

    proba      = model.predict_proba(X)[0]          # [p_low, p_med, p_high]
    prob_low   = float(proba[0])
    prob_med   = float(proba[1])
    prob_high  = float(proba[2])

    risk_score = int(prob_high * 70 + prob_med * 30)
    risk_score = max(0, min(100, risk_score))

    tier_map   = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    tier_idx   = int(proba.argmax())
    risk_tier  = tier_map[tier_idx]

    return {
        "risk_score":  risk_score,
        "risk_tier":   risk_tier,
        "explanation": _explain(worker_features),
    }


if __name__ == "__main__":
    test_cases = [
        {   # Expected HIGH
            "zone_flood_history": 0.85, "zone_aqi_baseline": 320,
            "zone_traffic_density": 0.9, "worker_years_active": 0,
            "weekly_avg_orders": 25, "claim_count_8w": 7,
            "platform_type": 0, "working_hours_per_day": 5,
        },
        {   # Expected MEDIUM
            "zone_flood_history": 0.45, "zone_aqi_baseline": 180,
            "zone_traffic_density": 0.5, "worker_years_active": 2,
            "weekly_avg_orders": 80, "claim_count_8w": 2,
            "platform_type": 1, "working_hours_per_day": 8,
        },
        {   # Expected LOW
            "zone_flood_history": 0.1, "zone_aqi_baseline": 70,
            "zone_traffic_density": 0.2, "worker_years_active": 5,
            "weekly_avg_orders": 130, "claim_count_8w": 0,
            "platform_type": 2, "working_hours_per_day": 11,
        },
    ]
    for i, tc in enumerate(test_cases, 1):
        result = predict_risk(tc)
        print(f"Case {i}: score={result['risk_score']:3d}  tier={result['risk_tier']:<6}  reasons={result['explanation']}")

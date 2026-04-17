from pathlib import Path
import joblib
import pandas as pd

_model = None
FEATURE_NAMES = ["gps", "speed", "rain", "aqi", "claims", "idle", "loss", "time", "dcs", "accel"]

def get_model():
    global _model
    if _model is None:
        model_path = Path(__file__).parent / "fraud_model.pkl"
        if model_path.exists():
            _model = joblib.load(model_path)
    return _model

def predict_fraud(features: list) -> float:
    """Returns fraud probability 0-100. Returns 0.0 if model unavailable."""
    model = get_model()
    if model is None:
        return 0.0
    df = pd.DataFrame([features], columns=FEATURE_NAMES)
    prob = model.predict_proba(df)[0][1]
    return round(prob * 100, 2)

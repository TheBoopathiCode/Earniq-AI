"""
train_model.py — Train ALL Earniq AI ML models in one command.

Run from the backend/ folder:
    python train_model.py

Models trained:
    1. XGBoost Risk Scorer       -> app/ml/risk_model.pkl
    2. Fraud Detector            -> app/ml/fraud_model.pkl
    3. Income Baseline (cohort)  -> app/ml/income_cohort_model.pkl
    4. Premium + Coverage        -> app/ml/premium_model.pkl, coverage_model.pkl
"""
import sys
import os

# Make sure app/ is importable from backend/
sys.path.insert(0, os.path.dirname(__file__))

print("=" * 60)
print("  Earniq AI — ML Model Training Pipeline")
print("=" * 60)

# ── 1. XGBoost Risk Scorer ────────────────────────────────────────────────────
print("\n[1/4] Training XGBoost Risk Scorer...")
try:
    from app.ml.train_risk_model import train as train_risk
    train_risk()
    print("      ✓ risk_model.pkl saved")
except Exception as e:
    print(f"      ✗ Risk model failed: {e}")
    sys.exit(1)

# ── 2. Fraud Detector ─────────────────────────────────────────────────────────
print("\n[2/4] Training Fraud Detection Model...")
try:
    from app.ml.train_fraud_model import train as train_fraud
    train_fraud()
    print("      ✓ fraud_model.pkl saved")
except Exception as e:
    print(f"      ✗ Fraud model failed: {e}")
    sys.exit(1)

# ── 3. Income Baseline ────────────────────────────────────────────────────────
print("\n[3/4] Training Income Baseline (cohort) Model...")
try:
    from app.ml.income_baseline import _train_cohort_model
    _train_cohort_model()
    print("      ✓ income_cohort_model.pkl saved")
except Exception as e:
    print(f"      ✗ Income baseline failed: {e}")
    sys.exit(1)

# ── 4. Premium + Coverage ─────────────────────────────────────────────────────
print("\n[4/4] Training Premium + Coverage Models...")
try:
    # Import the generate + train functions from train_model logic
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import GradientBoostingRegressor, GradientBoostingClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import r2_score, mean_absolute_error, accuracy_score
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    import joblib

    rng = np.random.default_rng(42)
    n   = 20000

    zone_risk            = rng.integers(10, 100, n).astype(float)
    rain                 = rng.integers(0, 100, n).astype(float)
    aqi                  = rng.integers(50, 400, n).astype(float)
    traffic              = rng.integers(1, 10, n).astype(float)
    claims               = rng.integers(0, 5, n).astype(float)
    consistency          = rng.uniform(0.5, 1.0, n)
    waterlogging_history = rng.integers(0, 100, n).astype(float)
    forecast_rain_48h    = rng.integers(0, 100, n).astype(float)
    forecast_aqi_48h     = rng.integers(50, 400, n).astype(float)

    premium = (
        8 + zone_risk * 0.10 + rain * 0.05 + (aqi / 50) + traffic * 1.5
        + claims * 2.0 - consistency * 5.0 + waterlogging_history * 0.04
        + forecast_rain_48h * 0.03 + (forecast_aqi_48h / 100)
    )
    premium = np.clip(np.round(premium + rng.normal(0, premium * 0.04), 2), 8.0, 28.0)

    coverage_hours = np.where(
        (forecast_rain_48h > 15) | (forecast_aqi_48h > 200), 24,
        np.where((forecast_rain_48h > 5) | (forecast_aqi_48h > 150), 16, 8)
    )

    FEATURES = ["zone_risk","rain","aqi","traffic","claims","consistency",
                "waterlogging_history","forecast_rain_48h","forecast_aqi_48h"]
    COV_FEAT = ["zone_risk","forecast_rain_48h","forecast_aqi_48h","waterlogging_history"]

    df = pd.DataFrame({
        **{f: v for f, v in zip(FEATURES, [zone_risk,rain,aqi,traffic,claims,
                                            consistency,waterlogging_history,
                                            forecast_rain_48h,forecast_aqi_48h])},
        "coverage_hours": coverage_hours, "premium": premium,
    })

    # Premium model
    X, y = df[FEATURES], df["premium"]
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
    pm = Pipeline([("s", StandardScaler()), ("m", GradientBoostingRegressor(
        n_estimators=200, max_depth=4, learning_rate=0.05,
        subsample=0.65, min_samples_leaf=20, random_state=42,
    ))])
    pm.fit(X_tr, y_tr)
    print(f"      Premium  R²={r2_score(y_te, pm.predict(X_te)):.4f}  MAE=₹{mean_absolute_error(y_te, pm.predict(X_te)):.2f}")
    joblib.dump(pm, "app/ml/premium_model.pkl")

    # Coverage model
    Xc, yc = df[COV_FEAT], df["coverage_hours"]
    Xc_tr, Xc_te, yc_tr, yc_te = train_test_split(Xc, yc, test_size=0.2, random_state=42)
    cm = Pipeline([("s", StandardScaler()), ("m", GradientBoostingClassifier(
        n_estimators=100, max_depth=3, learning_rate=0.1,
        subsample=0.8, min_samples_leaf=20, random_state=42,
    ))])
    cm.fit(Xc_tr, yc_tr)
    print(f"      Coverage Acc={accuracy_score(yc_te, cm.predict(Xc_te)):.4f}")
    joblib.dump(cm, "app/ml/coverage_model.pkl")
    print("      ✓ premium_model.pkl + coverage_model.pkl saved")
except Exception as e:
    print(f"      ✗ Premium/coverage model failed: {e}")
    sys.exit(1)

print("\n" + "=" * 60)
print("  All 4 models trained successfully.")
print("  You can now start the backend: uvicorn app.main:app --reload")
print("=" * 60)

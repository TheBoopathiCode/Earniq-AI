import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import joblib
import os

np.random.seed(42)

# ── 1. Generate dataset with new features ────────────────────────────────────
rows = []
for _ in range(15000):
    zone_risk            = np.random.randint(10, 100)
    rain                 = np.random.randint(0, 100)
    aqi                  = np.random.randint(50, 400)
    traffic              = np.random.randint(1, 10)
    claims               = np.random.randint(0, 5)
    consistency          = np.random.uniform(0.5, 1.0)
    waterlogging_history = np.random.randint(0, 100)   # historical flood frequency
    forecast_rain_48h    = np.random.randint(0, 100)   # predicted rainfall next 48h (mm)
    forecast_aqi_48h     = np.random.randint(50, 400)  # predicted AQI next 48h

    # Base premium formula
    premium = (
        8
        + zone_risk            * 0.10
        + rain                 * 0.05
        + (aqi / 50)
        + traffic              * 1.5
        + claims               * 2.0
        - consistency          * 5.0
        + waterlogging_history * 0.04   # higher history = higher premium
        + forecast_rain_48h    * 0.03   # forecast rain raises premium
        + (forecast_aqi_48h / 100)      # forecast AQI raises premium
    )

    # ₹2 discount if zone is historically safe from waterlogging
    if waterlogging_history < 20:
        premium -= 2.0

    # ₹1.5 surcharge if heavy rain forecast in next 48h
    if forecast_rain_48h > 60:
        premium += 1.5

    # ₹1 surcharge if hazardous AQI forecast
    if forecast_aqi_48h > 300:
        premium += 1.0

    # Dynamic coverage hours (output feature for reference, not used in premium)
    if forecast_rain_48h > 15 or forecast_aqi_48h > 200:
        coverage_hours = 24
    elif forecast_rain_48h > 5 or forecast_aqi_48h > 150:
        coverage_hours = 16
    else:
        coverage_hours = 8

    premium = max(8.0, min(28.0, round(premium, 2)))

    rows.append([
        zone_risk, rain, aqi, traffic, claims, consistency,
        waterlogging_history, forecast_rain_48h, forecast_aqi_48h,
        coverage_hours, premium
    ])

df = pd.DataFrame(rows, columns=[
    "zone_risk", "rain", "aqi", "traffic", "claims", "consistency",
    "waterlogging_history", "forecast_rain_48h", "forecast_aqi_48h",
    "coverage_hours", "premium"
])
df.to_csv("dataset.csv", index=False)
print("Dataset created: %d rows, %d features" % (len(df), len(df.columns) - 1))
print("Premium range: Rs%.2f - Rs%.2f" % (df["premium"].min(), df["premium"].max()))
print("Waterlogging discount applied to %d rows" % (df["waterlogging_history"] < 20).sum())
print("Heavy rain surcharge applied to %d rows" % (df["forecast_rain_48h"] > 60).sum())
print("Coverage 24h: %d rows, 16h: %d rows, 8h: %d rows" % (
    (df["coverage_hours"] == 24).sum(),
    (df["coverage_hours"] == 16).sum(),
    (df["coverage_hours"] == 8).sum()
))

# ── 2. Train premium model ────────────────────────────────────────────────────
FEATURES = ["zone_risk", "rain", "aqi", "traffic", "claims", "consistency",
            "waterlogging_history", "forecast_rain_48h", "forecast_aqi_48h"]

X = df[FEATURES]
y = df["premium"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = Pipeline([
    ("scaler", StandardScaler()),
    ("gbr", GradientBoostingRegressor(
        n_estimators=600,
        max_depth=7,
        learning_rate=0.03,
        subsample=0.85,
        min_samples_leaf=3,
        random_state=42
    ))
])
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
r2  = r2_score(y_test, y_pred)
mae = mean_absolute_error(y_test, y_pred)
print("\n--- Premium Model ---")
print("R2 Score : %.4f  (%.2f%%)" % (r2, r2 * 100))
print("MAE      : Rs%.4f" % mae)
print("PASSED" if r2 >= 0.90 else "WARNING: below 90%%")

# ── 3. Train coverage hours model ─────────────────────────────────────────────
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score

COVERAGE_FEATURES = ["zone_risk", "forecast_rain_48h", "forecast_aqi_48h", "waterlogging_history"]
Xc = df[COVERAGE_FEATURES]
yc = df["coverage_hours"]

Xc_train, Xc_test, yc_train, yc_test = train_test_split(Xc, yc, test_size=0.2, random_state=42)

coverage_model = Pipeline([
    ("scaler", StandardScaler()),
    ("gbc", GradientBoostingClassifier(n_estimators=200, max_depth=4, random_state=42))
])
coverage_model.fit(Xc_train, yc_train)
yc_pred = coverage_model.predict(Xc_test)
acc = accuracy_score(yc_test, yc_pred)
print("\n--- Coverage Hours Model ---")
print("Accuracy : %.4f  (%.2f%%)" % (acc, acc * 100))
print("PASSED" if acc >= 0.90 else "WARNING: below 90%%")

# ── 4. Save both models ───────────────────────────────────────────────────────
os.makedirs("app/ml", exist_ok=True)
joblib.dump(model,          "app/ml/premium_model.pkl")
joblib.dump(coverage_model, "app/ml/coverage_model.pkl")
print("\nModels saved:")
print("  app/ml/premium_model.pkl")
print("  app/ml/coverage_model.pkl")

# ── 5. Verify discount and surcharge logic ────────────────────────────────────
print("\n--- Verification ---")
test_cases = [
    ("Safe zone (waterlogging=10, no rain)",  10, 0,  80, 5, 0, 0.85, 10,  0,  80),
    ("Risky zone (waterlogging=80, rain=70)", 75, 70, 200, 5, 0, 0.85, 80, 70, 200),
    ("Flood forecast (forecast_rain=80)",     50, 10, 100, 5, 0, 0.85, 40, 80, 100),
    ("Hazardous AQI forecast",                50, 5,  100, 5, 0, 0.85, 30,  5, 350),
]
for label, *feats in test_cases:
    feat_df = pd.DataFrame([feats], columns=FEATURES)
    p = model.predict(feat_df)[0]
    cov_df = pd.DataFrame([[feats[0], feats[7], feats[8], feats[6]]], columns=COVERAGE_FEATURES)
    c = coverage_model.predict(cov_df)[0]
    print("  %-45s -> Premium: Rs%.2f | Coverage: %dh" % (label, p, c))

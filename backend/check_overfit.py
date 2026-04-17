"""
Overfit check for all 5 trained models.
Compares train vs test performance to detect overfitting.
"""
import sys
sys.path.insert(0, '.')

import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    f1_score, roc_auc_score, mean_absolute_error,
    r2_score, accuracy_score, classification_report
)

ML_DIR = Path("app/ml")
print("=" * 65)
print("EARNIQ ML MODELS — OVERFIT ANALYSIS")
print("=" * 65)

# ── 1. Premium Predictor (GradientBoosting Regressor) ────────────────
print("\n[1] PREMIUM PREDICTOR — GradientBoosting Regressor")
print("-" * 50)
try:
    df = pd.read_csv(Path(".") / "dataset.csv")
    if "coverage_hours" not in df.columns:
        df["coverage_hours"] = df.apply(lambda r: 24 if r["forecast_rain_48h"] > 15 or r["forecast_aqi_48h"] > 200 else (16 if r["forecast_rain_48h"] > 5 or r["forecast_aqi_48h"] > 150 else 8), axis=1)
    FEATURES = ["zone_risk","rain","aqi","traffic","claims","consistency",
                "waterlogging_history","forecast_rain_48h","forecast_aqi_48h"]
    X = df[FEATURES]
    y = df["premium"]
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)

    model = joblib.load(ML_DIR / "premium_model.pkl")
    train_r2  = r2_score(y_tr, model.predict(X_tr))
    test_r2   = r2_score(y_te, model.predict(X_te))
    train_mae = mean_absolute_error(y_tr, model.predict(X_tr))
    test_mae  = mean_absolute_error(y_te, model.predict(X_te))
    cv_r2     = cross_val_score(model, X, y, cv=5, scoring="r2").mean()

    print(f"  Train R²  : {train_r2:.4f}")
    print(f"  Test  R²  : {test_r2:.4f}  (gap: {train_r2 - test_r2:.4f})")
    print(f"  Train MAE : Rs{train_mae:.4f}")
    print(f"  Test  MAE : Rs{test_mae:.4f}")
    print(f"  CV-5 R²   : {cv_r2:.4f}")
    gap = train_r2 - test_r2
    print(f"  VERDICT   : {'OVERFIT (gap > 0.05)' if gap > 0.05 else 'OK'}")
except Exception as e:
    print(f"  ERROR: {e}")

# ── 2. Coverage Classifier (GradientBoosting Classifier) ─────────────
print("\n[2] COVERAGE CLASSIFIER — GradientBoosting Classifier")
print("-" * 50)
try:
    CFEATURES = ["zone_risk","forecast_rain_48h","forecast_aqi_48h","waterlogging_history"]
    Xc = df[CFEATURES]
    yc = df["coverage_hours"]
    Xc_tr, Xc_te, yc_tr, yc_te = train_test_split(Xc, yc, test_size=0.2, random_state=42)

    cmodel = joblib.load(ML_DIR / "coverage_model.pkl")
    train_acc = accuracy_score(yc_tr, cmodel.predict(Xc_tr))
    test_acc  = accuracy_score(yc_te, cmodel.predict(Xc_te))
    cv_acc    = cross_val_score(cmodel, Xc, yc, cv=5, scoring="accuracy").mean()

    print(f"  Train Acc : {train_acc:.4f}")
    print(f"  Test  Acc : {test_acc:.4f}  (gap: {train_acc - test_acc:.4f})")
    print(f"  CV-5 Acc  : {cv_acc:.4f}")
    gap = train_acc - test_acc
    print(f"  VERDICT   : {'OVERFIT (gap > 0.05)' if gap > 0.05 else 'OK'}")
except Exception as e:
    print(f"  ERROR: {e}")

# ── 3. Fraud Detector (RandomForest) ─────────────────────────────────
print("\n[3] FRAUD DETECTOR — RandomForest Classifier")
print("-" * 50)
try:
    fdf = pd.read_csv(ML_DIR / "fraud_dataset.csv")
    FFEATURES = ["gps","speed","rain","aqi","claims","idle","loss","time","dcs","accel"]
    Xf = fdf[FFEATURES]
    yf = fdf["fraud"]
    Xf_tr, Xf_te, yf_tr, yf_te = train_test_split(Xf, yf, test_size=0.2, random_state=42, stratify=yf)

    fmodel = joblib.load(ML_DIR / "fraud_model.pkl")
    train_f1  = f1_score(yf_tr, fmodel.predict(Xf_tr))
    test_f1   = f1_score(yf_te, fmodel.predict(Xf_te))
    train_auc = roc_auc_score(yf_tr, fmodel.predict_proba(Xf_tr)[:,1])
    test_auc  = roc_auc_score(yf_te, fmodel.predict_proba(Xf_te)[:,1])
    cv_f1     = cross_val_score(fmodel, Xf, yf, cv=5, scoring="f1").mean()

    print(f"  Train F1  : {train_f1:.4f}")
    print(f"  Test  F1  : {test_f1:.4f}  (gap: {train_f1 - test_f1:.4f})")
    print(f"  Train AUC : {train_auc:.4f}")
    print(f"  Test  AUC : {test_auc:.4f}  (gap: {train_auc - test_auc:.4f})")
    print(f"  CV-5 F1   : {cv_f1:.4f}")
    gap = train_f1 - test_f1
    print(f"  VERDICT   : {'OVERFIT (gap > 0.05)' if gap > 0.05 else 'OK'}")
    if test_f1 > 0.98:
        print(f"  WARNING   : Test F1={test_f1:.4f} suspiciously high — likely memorizing synthetic labels")
except Exception as e:
    print(f"  ERROR: {e}")

# ── 4. XGBoost Risk Scorer ────────────────────────────────────────────
print("\n[4] XGBOOST RISK SCORER — XGBClassifier")
print("-" * 50)
try:
    from app.ml.train_risk_model import generate_data as _generate_training_data, FEATURES as RFEATURES
    rdf = _generate_training_data(5000)
    Xr = rdf[RFEATURES]
    yr = rdf["risk_tier"]
    Xr_tr, Xr_te, yr_tr, yr_te = train_test_split(Xr, yr, test_size=0.2, stratify=yr, random_state=42)

    rartifact = joblib.load(ML_DIR / "risk_model.pkl")
    rmodel    = rartifact["model"]
    train_acc = accuracy_score(yr_tr, rmodel.predict(Xr_tr))
    test_acc  = accuracy_score(yr_te, rmodel.predict(Xr_te))
    train_f1  = f1_score(yr_tr, rmodel.predict(Xr_tr), average="weighted")
    test_f1   = f1_score(yr_te, rmodel.predict(Xr_te), average="weighted")
    from xgboost import XGBClassifier as _XGB
    cv_model  = _XGB(n_estimators=100, max_depth=3, learning_rate=0.05,
                     subsample=0.7, colsample_bytree=0.7, min_child_weight=10,
                     reg_alpha=0.5, reg_lambda=2.0, gamma=0.1,
                     random_state=42, verbosity=0)
    cv_acc    = cross_val_score(cv_model, Xr, yr, cv=5, scoring="accuracy").mean()

    print(f"  Train Acc : {train_acc:.4f}")
    print(f"  Test  Acc : {test_acc:.4f}  (gap: {train_acc - test_acc:.4f})")
    print(f"  Train F1  : {train_f1:.4f}")
    print(f"  Test  F1  : {test_f1:.4f}  (gap: {train_f1 - test_f1:.4f})")
    print(f"  CV-5 Acc  : {cv_acc:.4f}")
    gap = train_acc - test_acc
    print(f"  VERDICT   : {'OVERFIT (gap > 0.05)' if gap > 0.05 else 'OK'}")
except Exception as e:
    print(f"  ERROR: {e}")

# ── 5. Income Baseline (Linear Regression) ───────────────────────────
print("\n[5] INCOME BASELINE — Linear Regression (Cohort)")
print("-" * 50)
try:
    from app.ml.income_baseline import _generate_cohort_data, FEATURES as IFEATURES
    Xi, yi = _generate_cohort_data(3000)
    Xi_tr, Xi_te, yi_tr, yi_te = train_test_split(Xi, yi, test_size=0.2, random_state=42)

    imodel    = joblib.load(ML_DIR / "income_cohort_model.pkl")
    train_mae = mean_absolute_error(yi_tr, imodel.predict(Xi_tr))
    test_mae  = mean_absolute_error(yi_te, imodel.predict(Xi_te))
    train_r2  = r2_score(yi_tr, imodel.predict(Xi_tr))
    test_r2   = r2_score(yi_te, imodel.predict(Xi_te))
    cv_mae    = -cross_val_score(imodel, Xi, yi, cv=5, scoring="neg_mean_absolute_error").mean()

    print(f"  Train MAE : Rs{train_mae:.4f}/hr")
    print(f"  Test  MAE : Rs{test_mae:.4f}/hr  (gap: Rs{test_mae - train_mae:.4f})")
    print(f"  Train R²  : {train_r2:.4f}")
    print(f"  Test  R²  : {test_r2:.4f}  (gap: {train_r2 - test_r2:.4f})")
    print(f"  CV-5 MAE  : Rs{cv_mae:.4f}/hr")
    gap = abs(train_r2 - test_r2)
    print(f"  VERDICT   : {'OVERFIT (gap > 0.05)' if gap > 0.05 else 'OK'}")
except Exception as e:
    print(f"  ERROR: {e}")

print("\n" + "=" * 65)
print("SUMMARY")
print("=" * 65)
print("""
Gap thresholds used:
  R²/Acc/F1 gap > 0.05 = OVERFIT
  CV score close to test score = GENERALIZES WELL

Note: High metrics on synthetic data are expected — the models
learn the deterministic formula used to generate labels.
Real-world performance will differ when live data is used.
""")

"""
Production-grade XGBoost Risk Scorer for Earniq.
Targets F1 0.75-0.85 with realistic noisy data and no overfitting.
"""
from pathlib import Path
import numpy as np
import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import f1_score, confusion_matrix, classification_report
import joblib

BASE_DIR = Path(__file__).parent
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


def generate_data(n: int = 5000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    zone_flood    = rng.uniform(0, 1, n)
    zone_aqi      = rng.uniform(50, 400, n)
    zone_traffic  = rng.uniform(0, 1, n)
    years_active  = rng.integers(0, 6, n).astype(float)
    avg_orders    = rng.integers(20, 151, n).astype(float)
    claim_count   = rng.integers(0, 11, n).astype(float)
    platform      = rng.integers(0, 3, n).astype(float)
    working_hours = rng.uniform(4, 12, n)

    # Feature-level noise before scoring
    zone_flood    += rng.normal(0, 0.05, n)
    zone_aqi      += rng.normal(0, 10, n)
    zone_traffic  += rng.normal(0, 0.05, n)
    working_hours += rng.normal(0, 0.3, n)

    zone_flood    = np.clip(zone_flood, 0, 1)
    zone_aqi      = np.clip(zone_aqi, 50, 400)
    zone_traffic  = np.clip(zone_traffic, 0, 1)
    working_hours = np.clip(working_hours, 4, 12)

    score = (
        zone_flood             * 30 +
        (zone_aqi / 400)       * 20 +
        zone_traffic           * 15 +
        claim_count            *  5 -
        years_active           *  3 -
        working_hours          *  1
    )
    # Large label noise creates realistic class overlap
    score += rng.normal(0, 8, n)

    labels = np.where(score < 30, 0, np.where(score < 60, 1, 2))

    df = pd.DataFrame({
        "zone_flood_history":    zone_flood,
        "zone_aqi_baseline":     zone_aqi,
        "zone_traffic_density":  zone_traffic,
        "worker_years_active":   years_active,
        "weekly_avg_orders":     avg_orders,
        "claim_count_8w":        claim_count,
        "platform_type":         platform,
        "working_hours_per_day": working_hours,
        "risk_tier":             labels,
    })

    dist = df["risk_tier"].value_counts().sort_index()
    print(f"Class distribution  LOW: {dist.get(0,0)}  MEDIUM: {dist.get(1,0)}  HIGH: {dist.get(2,0)}")
    return df


def train():
    print("=" * 55)
    print("EARNIQ - XGBoost Risk Scorer Training")
    print("=" * 55)

    df = generate_data(5000)
    X  = df[FEATURES]
    y  = df["risk_tier"]

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )

    model = XGBClassifier(
        n_estimators=150,
        max_depth=3,
        learning_rate=0.08,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=12,
        reg_alpha=0.5,
        reg_lambda=2.0,
        random_state=42,
        eval_metric="mlogloss",
        verbosity=0,
    )
    model.fit(X_tr, y_tr)

    train_f1 = f1_score(y_tr, model.predict(X_tr), average="weighted")
    test_f1  = f1_score(y_te, model.predict(X_te), average="weighted")
    gap      = train_f1 - test_f1
    cv_f1    = cross_val_score(
        model, X, y,
        cv=StratifiedKFold(5, shuffle=True, random_state=42),
        scoring="f1_weighted", n_jobs=-1,
    ).mean()

    print(classification_report(y_te, model.predict(X_te), target_names=["LOW", "MEDIUM", "HIGH"]))
    print("Confusion Matrix:")
    print(confusion_matrix(y_te, model.predict(X_te)))
    print(f"\n  Train F1 : {train_f1:.4f}")
    print(f"  Test  F1 : {test_f1:.4f}  gap={gap:.4f}")
    print(f"  CV-5  F1 : {cv_f1:.4f}")
    print(f"  Overfit  : {'YES' if gap > 0.05 else 'NO'}")
    print(f"  Target   : {'IN RANGE (0.75-0.85)' if 0.75 <= test_f1 <= 0.85 else f'OUTSIDE TARGET ({test_f1:.4f})'}")

    assert gap <= 0.05, f"Overfit gap={gap:.4f} - increase regularization"

    out = BASE_DIR / "risk_model.pkl"
    joblib.dump({"model": model, "features": FEATURES}, out)
    print(f"\nSaved -> {out}")
    return model


if __name__ == "__main__":
    train()

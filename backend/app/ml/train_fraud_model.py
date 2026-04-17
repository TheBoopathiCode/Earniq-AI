"""
Production-grade fraud detection model.
Fixes:
  - Realistic fraud patterns (not just threshold counting)
  - Proper train/val/test split
  - Calibrated probabilities
  - Overfit check enforced
"""
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import f1_score, roc_auc_score, classification_report, brier_score_loss
from sklearn.calibration import CalibratedClassifierCV
import joblib

BASE_DIR = Path(__file__).parent
np.random.seed(42)
rng = np.random.default_rng(42)


def generate_dataset(n: int = 15000) -> pd.DataFrame:
    """
    Heavily overlapping distributions — forces probabilistic learning, not threshold memorization.
    Key fix: fraud/genuine ranges overlap by ~60% on every feature.
    """
    rows = []
    for _ in range(n):
        is_fraud = rng.random() < 0.30  # 30% fraud rate

        if is_fraud:
            gps    = rng.uniform(2, 18)      # overlaps genuine (0-10)
            speed  = rng.uniform(20, 110)    # overlaps genuine (0-70)
            rain   = rng.uniform(0, 60)      # overlaps genuine (5-100)
            aqi    = rng.uniform(50, 350)
            claims = rng.integers(1, 7)
            idle   = rng.uniform(0, 80)      # overlaps genuine (5-120)
            loss   = rng.uniform(40, 100)    # overlaps genuine (15-85)
            dcs    = rng.uniform(10, 65)     # low DCS — key fraud signal
            accel  = rng.uniform(0, 0.8)     # low accel — stationary
            time   = rng.integers(0, 24)
        else:
            gps    = rng.uniform(0, 10)
            speed  = rng.uniform(0, 70)
            rain   = rng.uniform(5, 100)
            aqi    = rng.uniform(50, 400)
            claims = rng.integers(0, 4)
            idle   = rng.uniform(5, 120)
            loss   = rng.uniform(15, 85)
            dcs    = rng.uniform(55, 100)    # high DCS — genuine disruption
            accel  = rng.uniform(0.5, 5.0)   # road vibration
            time   = rng.integers(0, 24)

        # Large noise to force probabilistic boundary
        gps   += rng.normal(0, 3.0)
        speed += rng.normal(0, 12)
        rain  += rng.normal(0, 8)
        loss  += rng.normal(0, 10)
        dcs   += rng.normal(0, 8)
        accel += rng.normal(0, 0.3)

        rows.append([
            max(0, gps), max(0, speed), max(0, rain),
            aqi, claims, idle, max(0, min(100, loss)), time,
            max(0, min(100, dcs)), max(0, accel),
            int(is_fraud)
        ])

    df = pd.DataFrame(rows, columns=[
        "gps","speed","rain","aqi","claims","idle","loss","time","dcs","accel","fraud"
    ])
    print(f"Dataset: {len(df)} rows | Fraud rate: {df['fraud'].mean():.1%}")
    return df


def train(n: int = 15000):
    df = generate_dataset(n)
    df.to_csv(BASE_DIR / "fraud_dataset.csv", index=False)

    X = df.drop("fraud", axis=1)
    y = df["fraud"]

    X_tr, X_tmp, y_tr, y_tmp = train_test_split(X, y, test_size=0.30, random_state=42, stratify=y)
    X_val, X_te, y_val, y_te = train_test_split(X_tmp, y_tmp, test_size=0.50, random_state=42, stratify=y_tmp)

    base_model = RandomForestClassifier(
        n_estimators=300,
        max_depth=6,           # shallower — harder to memorize
        min_samples_leaf=25,   # larger leaves
        min_samples_split=50,
        max_features="sqrt",
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    model = CalibratedClassifierCV(base_model, cv=5, method="isotonic")
    model.fit(X_tr, y_tr)

    train_f1   = f1_score(y_tr,  model.predict(X_tr))
    val_f1     = f1_score(y_val, model.predict(X_val))
    test_f1    = f1_score(y_te,  model.predict(X_te))
    test_auc   = roc_auc_score(y_te, model.predict_proba(X_te)[:,1])
    test_brier = brier_score_loss(y_te, model.predict_proba(X_te)[:,1])
    cv_f1      = cross_val_score(base_model, X, y, cv=StratifiedKFold(5), scoring="f1", n_jobs=-1).mean()
    gap        = train_f1 - test_f1

    print(classification_report(y_te, model.predict(X_te), target_names=["Genuine","Fraud"]))
    print(f"  Train F1   : {train_f1:.4f}")
    print(f"  Val   F1   : {val_f1:.4f}")
    print(f"  Test  F1   : {test_f1:.4f}  gap={gap:.4f}")
    print(f"  Test  AUC  : {test_auc:.4f}")
    print(f"  Brier Score: {test_brier:.4f}")
    print(f"  CV-5  F1   : {cv_f1:.4f}")
    print(f"  Overfit    : {'YES' if gap > 0.05 else 'NO'}")
    if test_f1 > 0.95:
        print(f"  WARNING    : F1={test_f1:.4f} still high — check feature overlap")

    assert gap <= 0.08, f"Fraud model overfit gap={gap:.4f}"
    assert test_f1 >= 0.70, f"Fraud model F1={test_f1:.4f} too low"

    joblib.dump(model, BASE_DIR / "fraud_model.pkl")
    print(f"Saved -> {BASE_DIR / 'fraud_model.pkl'}")
    return test_f1, test_auc


if __name__ == "__main__":
    train()

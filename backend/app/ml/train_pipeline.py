"""
train_pipeline.py — weekly automated ML retraining pipeline for Earniq AI.

Stages:
  1. Extract  — rolling 28-day window from MySQL
  2. Validate — minimum rows, null check, label distribution
  3. Transform — feature engineering, outlier removal, normalization
  4. Train    — XGBoost (risk) + IsolationForest-backed fraud model
  5. Evaluate — compare against production model metrics
  6. Deploy   — promote only if new model beats current production
  7. Log      — structured logging to DB + file throughout
"""
import logging
import os
import traceback
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    f1_score, precision_score, recall_score, accuracy_score, roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from app.ml.model_utils import save_versioned, promote_to_production, rollback

# ── Logging ───────────────────────────────────────────────────────────────────

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "pipeline.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("earniq.pipeline")

# ── Constants ─────────────────────────────────────────────────────────────────

RANDOM_SEED      = 42
MIN_ROWS         = int(os.getenv("ML_MIN_ROWS", "500"))
ROLLING_DAYS     = 28
TRAIN_SPLIT      = 0.80
MAX_NULL_PCT     = 0.05      # abort if >5% nulls in any key column

RISK_FEATURES = [
    "zone_flood_history", "zone_aqi_baseline", "zone_traffic_density",
    "worker_years_active", "weekly_avg_orders", "claim_count_8w",
    "platform_type", "working_hours_per_day",
]

FRAUD_FEATURES = [
    "gps", "speed", "rain", "aqi", "claims",
    "idle", "loss", "time", "dcs", "accel",
]


# ── Pipeline log record ───────────────────────────────────────────────────────

class PipelineRun:
    def __init__(self):
        self.started_at  = datetime.utcnow()
        self.finished_at = None
        self.status      = "running"
        self.stages      = []
        self.error       = None

    def log_stage(self, stage: str, detail: str, ok: bool = True):
        entry = {"stage": stage, "detail": detail, "ok": ok, "ts": datetime.utcnow().isoformat()}
        self.stages.append(entry)
        level = logging.INFO if ok else logging.ERROR
        logger.log(level, f"[{stage}] {detail}")

    def finish(self, status: str, error: str = None):
        self.finished_at = datetime.utcnow()
        self.status      = status
        self.error       = error
        duration         = (self.finished_at - self.started_at).total_seconds()
        logger.info(f"Pipeline {status.upper()} in {duration:.1f}s")

    def to_dict(self) -> dict:
        return {
            "started_at":  self.started_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "status":      self.status,
            "stages":      self.stages,
            "error":       self.error,
        }


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 1 — DATA EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_data(db_session, run: PipelineRun) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Extract last ROLLING_DAYS of claims + worker data from MySQL.
    Returns (risk_df, fraud_df).
    Falls back to synthetic data if DB has insufficient rows.
    """
    from app import models

    cutoff = datetime.utcnow() - timedelta(days=ROLLING_DAYS)

    # ── Risk dataset: workers + their claim history ───────────────────────────
    workers = db_session.query(models.Worker).filter(models.Worker.is_active == True).all()
    risk_rows = []
    for w in workers:
        claim_count = db_session.query(models.Claim).filter(
            models.Claim.worker_id == w.id,
            models.Claim.created_at >= cutoff,
        ).count()

        platform_map = {"zomato": 0, "swiggy": 1, "zepto": 2, "amazon": 3}
        risk_rows.append({
            "zone_flood_history":    min(w.zone_risk_score / 100.0, 1.0),
            "zone_aqi_baseline":     min(w.zone_risk_score * 3.5, 400.0),
            "zone_traffic_density":  min(w.zone_risk_score / 100.0 * 0.9, 1.0),
            "worker_years_active":   min(max((datetime.utcnow() - w.created_at).days // 365, 0), 10),
            "weekly_avg_orders":     float(w.avg_orders),
            "claim_count_8w":        float(claim_count),
            "platform_type":         float(platform_map.get(w.platform, 0)),
            "working_hours_per_day": float(w.working_hours),
            "risk_tier":             0 if w.risk_score < 34 else 1 if w.risk_score < 67 else 2,
        })

    # ── Fraud dataset: claims in rolling window ───────────────────────────────
    claims = db_session.query(models.Claim).filter(
        models.Claim.created_at >= cutoff
    ).all()

    fraud_rows = []
    for c in claims:
        fraud_rows.append({
            "gps":    float(c.weather_signal or 0),
            "speed":  float(c.traffic_signal or 0) * 1.2,
            "rain":   float(c.weather_signal or 0),
            "aqi":    float(c.aqi_signal or 0),
            "claims": float(c.dcs_score or 0),
            "idle":   float(c.worker_idle_signal or 0),
            "loss":   float(c.loss_percent or 0),
            "time":   float(c.created_at.hour if c.created_at else 12),
            "dcs":    float(c.dcs_score or 0),
            "accel":  float(c.fraud_layer3_score or 0.08) * 10,
            "fraud":  1 if c.status == "rejected" else 0,
        })

    risk_df  = pd.DataFrame(risk_rows)
    fraud_df = pd.DataFrame(fraud_rows)

    run.log_stage("EXTRACT", f"Risk rows: {len(risk_df)} | Fraud rows: {len(fraud_df)}")

    # Augment with synthetic data if DB is sparse (early-stage deployment)
    if len(risk_df) < MIN_ROWS:
        run.log_stage("EXTRACT", f"DB has {len(risk_df)} risk rows < {MIN_ROWS} — augmenting with synthetic data")
        risk_df  = _augment_risk(risk_df)

    if len(fraud_df) < MIN_ROWS:
        run.log_stage("EXTRACT", f"DB has {len(fraud_df)} fraud rows < {MIN_ROWS} — augmenting with synthetic data")
        fraud_df = _augment_fraud(fraud_df)

    return risk_df, fraud_df


def _augment_risk(existing: pd.DataFrame) -> pd.DataFrame:
    """Generate synthetic risk rows to supplement sparse DB data."""
    from app.ml.train_risk_model import generate_data
    synthetic = generate_data(max(MIN_ROWS * 2, 500))
    if len(existing) > 0:
        return pd.concat([existing, synthetic], ignore_index=True)
    return synthetic


def _augment_fraud(existing: pd.DataFrame) -> pd.DataFrame:
    """Generate synthetic fraud rows to supplement sparse DB data."""
    rng = np.random.default_rng(RANDOM_SEED)
    n   = max(MIN_ROWS * 2, 500)
    rows = []
    for _ in range(n):
        is_fraud = rng.random() < 0.30
        rows.append({
            "gps":   rng.uniform(2, 18) if is_fraud else rng.uniform(0, 10),
            "speed": rng.uniform(20, 110) if is_fraud else rng.uniform(0, 70),
            "rain":  rng.uniform(0, 60) if is_fraud else rng.uniform(5, 100),
            "aqi":   rng.uniform(50, 350),
            "claims": rng.integers(1, 7) if is_fraud else rng.integers(0, 4),
            "idle":  rng.uniform(0, 80) if is_fraud else rng.uniform(5, 120),
            "loss":  rng.uniform(40, 100) if is_fraud else rng.uniform(15, 85),
            "time":  rng.integers(0, 24),
            "dcs":   rng.uniform(10, 65) if is_fraud else rng.uniform(55, 100),
            "accel": rng.uniform(0, 0.8) if is_fraud else rng.uniform(0.5, 5.0),
            "fraud": int(is_fraud),
        })
    synthetic = pd.DataFrame(rows)
    if len(existing) > 0:
        return pd.concat([existing, synthetic], ignore_index=True)
    return synthetic


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 2 — VALIDATION
# ─────────────────────────────────────────────────────────────────────────────

def validate_dataset(df: pd.DataFrame, key_cols: list[str], label_col: str,
                     run: PipelineRun, name: str) -> bool:
    # Row count
    if len(df) < MIN_ROWS:
        run.log_stage("VALIDATE", f"[{name}] ABORT — only {len(df)} rows (min {MIN_ROWS})", ok=False)
        return False

    # Null check
    for col in key_cols:
        if col not in df.columns:
            run.log_stage("VALIDATE", f"[{name}] ABORT — missing column '{col}'", ok=False)
            return False
        null_pct = df[col].isnull().mean()
        if null_pct > MAX_NULL_PCT:
            run.log_stage("VALIDATE", f"[{name}] ABORT — '{col}' has {null_pct:.1%} nulls", ok=False)
            return False

    # Label distribution sanity
    dist = df[label_col].value_counts(normalize=True)
    if dist.max() > 0.95:
        run.log_stage("VALIDATE", f"[{name}] ABORT — label imbalance {dist.to_dict()}", ok=False)
        return False

    run.log_stage("VALIDATE", f"[{name}] OK — {len(df)} rows, labels: {dist.to_dict()}")
    return True


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 3 — TRANSFORMATION
# ─────────────────────────────────────────────────────────────────────────────

def transform_risk(df: pd.DataFrame, run: PipelineRun) -> tuple[pd.DataFrame, pd.Series]:
    df = df.copy().dropna(subset=RISK_FEATURES + ["risk_tier"])

    # Feature engineering
    df["risk_ratio"]       = df["claim_count_8w"] / (df["weekly_avg_orders"].clip(lower=1))
    df["weather_risk"]     = df["zone_flood_history"] * (df["zone_aqi_baseline"] / 400.0)
    df["experience_score"] = df["worker_years_active"] * df["working_hours_per_day"]

    extended = RISK_FEATURES + ["risk_ratio", "weather_risk", "experience_score"]

    # Remove outliers via z-score
    z = np.abs(stats.zscore(df[extended].fillna(0)))
    df = df[(z < 3).all(axis=1)]

    # Normalize
    scaler = StandardScaler()
    X = pd.DataFrame(scaler.fit_transform(df[extended]), columns=extended)
    y = df["risk_tier"].reset_index(drop=True)

    run.log_stage("TRANSFORM", f"Risk: {len(X)} rows after cleaning, {X.shape[1]} features")
    return X, y


def transform_fraud(df: pd.DataFrame, run: PipelineRun) -> tuple[pd.DataFrame, pd.Series]:
    df = df.copy().dropna(subset=FRAUD_FEATURES + ["fraud"])

    # Feature engineering
    df["gps_anomaly_score"]  = (df["gps"] / df["gps"].clip(lower=0.1)) * (df["speed"] / 120.0)
    df["weather_risk_score"] = df["rain"] * (df["aqi"] / 400.0)
    df["traffic_index"]      = df["speed"] * df["idle"] / 100.0

    extended = FRAUD_FEATURES + ["gps_anomaly_score", "weather_risk_score", "traffic_index"]

    # IQR outlier removal
    Q1, Q3 = df[extended].quantile(0.25), df[extended].quantile(0.75)
    IQR    = Q3 - Q1
    mask   = ~((df[extended] < (Q1 - 1.5 * IQR)) | (df[extended] > (Q3 + 1.5 * IQR))).any(axis=1)
    df     = df[mask]

    scaler = StandardScaler()
    X = pd.DataFrame(scaler.fit_transform(df[extended]), columns=extended)
    y = df["fraud"].reset_index(drop=True)

    run.log_stage("TRANSFORM", f"Fraud: {len(X)} rows after cleaning, {X.shape[1]} features")
    return X, y


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 4 — TRAINING
# ─────────────────────────────────────────────────────────────────────────────

def train_risk_model(X: pd.DataFrame, y: pd.Series, run: PipelineRun) -> tuple:
    X_tr, X_val, y_tr, y_val = train_test_split(
        X, y, test_size=1 - TRAIN_SPLIT, stratify=y, random_state=RANDOM_SEED
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
        random_state=RANDOM_SEED,
        eval_metric="mlogloss",
        verbosity=0,
    )
    model.fit(X_tr, y_tr)

    preds  = model.predict(X_val)
    f1     = f1_score(y_val, preds, average="weighted")
    acc    = accuracy_score(y_val, preds)
    prec   = precision_score(y_val, preds, average="weighted", zero_division=0)
    rec    = recall_score(y_val, preds, average="weighted", zero_division=0)
    gap    = f1_score(y_tr, model.predict(X_tr), average="weighted") - f1

    metrics = {"f1": round(f1, 4), "accuracy": round(acc, 4),
               "precision": round(prec, 4), "recall": round(rec, 4),
               "overfit_gap": round(gap, 4)}

    run.log_stage("TRAIN", f"Risk model — F1={f1:.4f} acc={acc:.4f} gap={gap:.4f}")
    return model, metrics, len(X_tr)


def train_fraud_model(X: pd.DataFrame, y: pd.Series, run: PipelineRun) -> tuple:
    X_tr, X_val, y_tr, y_val = train_test_split(
        X, y, test_size=1 - TRAIN_SPLIT, stratify=y, random_state=RANDOM_SEED
    )

    base = RandomForestClassifier(
        n_estimators=200,
        max_depth=6,
        min_samples_leaf=20,
        min_samples_split=40,
        max_features="sqrt",
        class_weight="balanced",
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )
    model = CalibratedClassifierCV(base, cv=3, method="isotonic")
    model.fit(X_tr, y_tr)

    preds  = model.predict(X_val)
    probas = model.predict_proba(X_val)[:, 1]
    f1     = f1_score(y_val, preds, zero_division=0)
    acc    = accuracy_score(y_val, preds)
    prec   = precision_score(y_val, preds, zero_division=0)
    rec    = recall_score(y_val, preds, zero_division=0)
    auc    = roc_auc_score(y_val, probas) if len(y_val.unique()) > 1 else 0.5
    gap    = f1_score(y_tr, model.predict(X_tr), zero_division=0) - f1

    metrics = {"f1": round(f1, 4), "accuracy": round(acc, 4),
               "precision": round(prec, 4), "recall": round(rec, 4),
               "auc": round(auc, 4), "overfit_gap": round(gap, 4)}

    run.log_stage("TRAIN", f"Fraud model — F1={f1:.4f} AUC={auc:.4f} gap={gap:.4f}")
    return model, metrics, len(X_tr)


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 5–6 — VALIDATE + DEPLOY
# ─────────────────────────────────────────────────────────────────────────────

def validate_and_deploy(model, model_type: str, metrics: dict,
                        dataset_size: int, run: PipelineRun) -> bool:
    # Minimum quality gate
    min_f1 = 0.55
    if metrics["f1"] < min_f1:
        run.log_stage("VALIDATE_MODEL",
                      f"[{model_type}] REJECTED — F1 {metrics['f1']} < minimum {min_f1}", ok=False)
        return False

    # Overfit gate
    if metrics.get("overfit_gap", 0) > 0.10:
        run.log_stage("VALIDATE_MODEL",
                      f"[{model_type}] REJECTED — overfit gap {metrics['overfit_gap']:.4f} > 0.10", ok=False)
        return False

    # Save versioned copy
    meta = save_versioned(model, model_type, metrics, dataset_size)

    # Promote to production if better than current
    promoted = promote_to_production(model_type, meta)
    status   = "PROMOTED" if promoted else "KEPT_OLD"
    run.log_stage("DEPLOY", f"[{model_type}] {status} — F1={metrics['f1']:.4f}")
    return promoted


# ─────────────────────────────────────────────────────────────────────────────
# STAGE 7 — RELOAD IN-MEMORY MODELS
# ─────────────────────────────────────────────────────────────────────────────

def reload_production_models(run: PipelineRun):
    """Hot-reload the in-memory model caches used by predict_risk / predict_fraud."""
    try:
        import app.ml.predict_risk as pr
        import app.ml.predict_fraud as pf
        pr._artifact = None  # force reload on next predict_risk call
        pf._model = None     # force reload on next predict_fraud call
        # Also clear risk_scorer cache if loaded separately
        try:
            import app.ml.risk_scorer as rs
            rs._artifact = None
        except Exception:
            pass
        run.log_stage("RELOAD", "In-memory model caches cleared — will reload on next inference")
    except Exception as e:
        run.log_stage("RELOAD", f"Cache clear failed (non-fatal): {e}", ok=False)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN PIPELINE ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def run_weekly_pipeline(db_session=None) -> dict:
    """
    Full weekly retraining pipeline.
    Accepts an optional SQLAlchemy session; creates one if not provided.
    Returns pipeline run summary dict.
    """
    run = PipelineRun()
    run.log_stage("START", f"Weekly retraining pipeline started — rolling {ROLLING_DAYS} days")

    # Get DB session if not provided
    own_session = False
    if db_session is None:
        from app.database import SessionLocal
        db_session  = SessionLocal()
        own_session = True

    try:
        # ── 1. Extract ────────────────────────────────────────────────────────
        risk_df, fraud_df = extract_data(db_session, run)

        # ── 2. Validate ───────────────────────────────────────────────────────
        risk_ok  = validate_dataset(risk_df,  RISK_FEATURES,  "risk_tier", run, "risk")
        fraud_ok = validate_dataset(fraud_df, FRAUD_FEATURES, "fraud",     run, "fraud")

        if not risk_ok and not fraud_ok:
            run.finish("aborted", "Both datasets failed validation")
            return run.to_dict()

        # ── 3–4. Transform + Train + Deploy ───────────────────────────────────
        if risk_ok:
            try:
                X_r, y_r       = transform_risk(risk_df, run)
                risk_model, risk_metrics, risk_n = train_risk_model(X_r, y_r, run)
                validate_and_deploy(risk_model, "risk", risk_metrics, risk_n, run)
            except Exception as e:
                run.log_stage("RISK_PIPELINE", f"Failed: {e}\n{traceback.format_exc()}", ok=False)
                rollback("risk")

        if fraud_ok:
            try:
                X_f, y_f         = transform_fraud(fraud_df, run)
                fraud_model, fraud_metrics, fraud_n = train_fraud_model(X_f, y_f, run)
                validate_and_deploy(fraud_model, "fraud", fraud_metrics, fraud_n, run)
            except Exception as e:
                run.log_stage("FRAUD_PIPELINE", f"Failed: {e}\n{traceback.format_exc()}", ok=False)
                rollback("fraud")

        # ── 5. Reload in-memory caches ────────────────────────────────────────
        reload_production_models(run)

        # ── 6. Persist run log to DB ──────────────────────────────────────────
        _persist_run_log(db_session, run)

        run.finish("success")

    except Exception as e:
        run.finish("failed", str(e))
        logger.error(f"Pipeline crashed: {e}\n{traceback.format_exc()}")
        rollback("risk")
        rollback("fraud")

    finally:
        if own_session:
            db_session.close()

    return run.to_dict()


def _persist_run_log(db_session, run: PipelineRun):
    """Store pipeline run summary in DB if TrainingLog model exists."""
    try:
        from app import models
        if hasattr(models, "TrainingLog"):
            import json
            log = models.TrainingLog(
                started_at  = run.started_at,
                finished_at = run.finished_at,
                status      = run.status,
                stages_json = json.dumps(run.stages),
                error       = run.error,
            )
            db_session.add(log)
            db_session.commit()
    except Exception as e:
        logger.warning(f"Could not persist run log: {e}")

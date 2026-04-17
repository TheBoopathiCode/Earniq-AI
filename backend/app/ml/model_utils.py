"""
model_utils.py — versioning, safe load/save, rollback for Earniq ML models.
"""
import json
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

import joblib

logger = logging.getLogger("earniq.ml")

ML_DIR      = Path(__file__).parent
VERSIONS_DIR = ML_DIR / "versions"
VERSIONS_DIR.mkdir(exist_ok=True)

# Stable production paths — always point to the best validated model
PROD_RISK_PATH  = ML_DIR / "risk_model.pkl"
PROD_FRAUD_PATH = ML_DIR / "fraud_model.pkl"

# Previous model kept as instant rollback
PREV_RISK_PATH  = ML_DIR / "risk_model_previous.pkl"
PREV_FRAUD_PATH = ML_DIR / "fraud_model_previous.pkl"

# Metadata for current production models
PROD_RISK_META_PATH  = ML_DIR / "risk_model_meta.json"
PROD_FRAUD_META_PATH = ML_DIR / "fraud_model_meta.json"


# ── Metadata ─────────────────────────────────────────────────────────────────

def save_metadata(path: Path, meta: dict) -> None:
    with open(path, "w") as f:
        json.dump(meta, f, indent=2, default=str)
    logger.info(f"Metadata saved → {path}")


def load_metadata(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


# ── Versioned save ────────────────────────────────────────────────────────────

def save_versioned(model, model_type: str, metrics: dict, dataset_size: int) -> dict:
    """
    Save a new model version to versions/ directory.
    Does NOT touch production paths — promotion is separate.
    Returns metadata dict.
    """
    ts   = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    name = f"{model_type}_v{ts}.pkl"
    path = VERSIONS_DIR / name

    joblib.dump(model, path)

    meta = {
        "version":      ts,
        "model_type":   model_type,
        "trained_at":   datetime.utcnow().isoformat(),
        "dataset_size": dataset_size,
        "metrics":      metrics,
        "path":         str(path),
    }
    meta_path = VERSIONS_DIR / f"{model_type}_v{ts}_meta.json"
    save_metadata(meta_path, meta)

    logger.info(f"Versioned model saved → {path}")
    return meta


# ── Promotion (safe deployment) ───────────────────────────────────────────────

def promote_to_production(model_type: str, new_meta: dict) -> bool:
    """
    Promote a versioned model to production only if metrics beat current prod.
    Keeps previous model as rollback.
    Returns True if promoted, False if rejected.
    """
    prod_path = PROD_RISK_PATH  if model_type == "risk"  else PROD_FRAUD_PATH
    prev_path = PREV_RISK_PATH  if model_type == "risk"  else PREV_FRAUD_PATH
    meta_path = PROD_RISK_META_PATH if model_type == "risk" else PROD_FRAUD_META_PATH

    new_f1  = new_meta["metrics"].get("f1", 0.0)
    old_meta = load_metadata(meta_path)
    old_f1   = old_meta["metrics"].get("f1", 0.0) if old_meta else 0.0

    if new_f1 < old_f1:
        logger.warning(
            f"[{model_type}] REJECTED — new F1 {new_f1:.4f} < prod F1 {old_f1:.4f}. "
            "Keeping current production model."
        )
        return False

    # Rotate: current prod → previous (rollback slot)
    if prod_path.exists():
        shutil.copy2(prod_path, prev_path)
        logger.info(f"[{model_type}] Previous model backed up → {prev_path}")

    # Copy new versioned model → production path
    shutil.copy2(new_meta["path"], prod_path)
    save_metadata(meta_path, new_meta)

    logger.info(
        f"[{model_type}] PROMOTED — F1 {old_f1:.4f} → {new_f1:.4f} | "
        f"version {new_meta['version']}"
    )
    return True


# ── Rollback ──────────────────────────────────────────────────────────────────

def rollback(model_type: str) -> bool:
    """Restore previous model to production. Returns True if successful."""
    prod_path = PROD_RISK_PATH  if model_type == "risk"  else PROD_FRAUD_PATH
    prev_path = PREV_RISK_PATH  if model_type == "risk"  else PREV_FRAUD_PATH

    if not prev_path.exists():
        logger.error(f"[{model_type}] Rollback failed — no previous model at {prev_path}")
        return False

    shutil.copy2(prev_path, prod_path)
    logger.warning(f"[{model_type}] ROLLED BACK to previous model")
    return True


# ── Safe load (never crashes FastAPI) ────────────────────────────────────────

def safe_load(model_type: str):
    """
    Load production model. Falls back to previous if prod is corrupt.
    Returns None only if both are missing (first-run scenario).
    """
    prod_path = PROD_RISK_PATH  if model_type == "risk"  else PROD_FRAUD_PATH
    prev_path = PREV_RISK_PATH  if model_type == "risk"  else PREV_FRAUD_PATH

    for path in [prod_path, prev_path]:
        if path.exists():
            try:
                model = joblib.load(path)
                logger.debug(f"[{model_type}] Loaded from {path}")
                return model
            except Exception as e:
                logger.error(f"[{model_type}] Failed to load {path}: {e}")

    logger.warning(f"[{model_type}] No model found — will train on first request")
    return None


# ── Version listing ───────────────────────────────────────────────────────────

def list_versions(model_type: str) -> list[dict]:
    metas = sorted(VERSIONS_DIR.glob(f"{model_type}_v*_meta.json"), reverse=True)
    return [load_metadata(p) for p in metas if load_metadata(p)]

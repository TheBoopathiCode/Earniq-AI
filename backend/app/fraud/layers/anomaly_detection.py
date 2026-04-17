"""
IsolationForest anomaly detection — Layer 3.

IMPORTANT: IsolationForest is UNSUPERVISED — trained on NORMAL behavior only.
Do NOT evaluate with F1/AUC against fraud labels — that is meaningless here.
Evaluate by:
  - False-positive rate on confirmed-legit claims (target < 5%)
  - Detection rate on confirmed-fraud cases from appeals (target > 70%)
"""
from pathlib import Path
from app.fraud.schemas import ClaimInput
from app.fraud.db_store import get_claims_last_30_days
import numpy as np

CONTAMINATION            = 0.05
ANOMALY_MAX_CONTRIBUTION = 30

FEATURES = [
    "avg_accel_variance",
    "battery_drain_rate",
    "zone_dwell_minutes",
    "velocity_max",
    "network_signal_dbm",
    "app_active_minutes",
    "claims_last_30_days",
    "time_to_zone_minutes",
]

_models: dict[str, object] = {}
_MODEL_DIR = Path(__file__).parent.parent / "models"


def _get_model_path(worker_id: str) -> Path:
    return _MODEL_DIR / f"iso_{worker_id}.pkl"


def train_worker_model(worker_id: str, normal_claims: list[dict]):
    """Train on normal behavior only — no fraud samples needed."""
    import joblib
    from sklearn.ensemble import IsolationForest

    X = np.array([[c[f] for f in FEATURES] for c in normal_claims])
    model = IsolationForest(contamination=CONTAMINATION, n_estimators=100, random_state=42)
    model.fit(X)
    _MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES}, _get_model_path(worker_id))
    _models[worker_id] = model


def _load_model(worker_id: str):
    if worker_id in _models:
        return _models[worker_id]
    path = _get_model_path(worker_id)
    if not path.exists():
        return None
    import joblib
    artifact = joblib.load(path)
    _models[worker_id] = artifact["model"]
    return _models[worker_id]


def extract_features(claim: ClaimInput) -> dict:
    """Returns dict with exactly the keys in FEATURES."""
    from app.fraud.layers.gps_validation import _point_in_zone, _haversine

    pings = claim.gps_history
    if not pings:
        return {f: 0.0 for f in FEATURES}

    # avg_accel_variance
    avg_accel = sum(p.accel_variance for p in pings) / len(pings)

    # battery_drain_rate — fraction per hour
    duration_hours = max(
        (pings[-1].timestamp - pings[0].timestamp).total_seconds() / 3600, 0.01
    )
    battery_drain_rate = (pings[0].battery_level - pings[-1].battery_level) / duration_hours

    # zone_dwell_minutes
    zone_pings = [p for p in pings if _point_in_zone(p.lat, p.lng, claim.claim_zone)]
    zone_dwell_minutes = (
        (zone_pings[-1].timestamp - zone_pings[0].timestamp).total_seconds() / 60
        if len(zone_pings) >= 2 else 0.0
    )

    # velocity_max
    velocity_max = 0.0
    for i in range(1, len(pings)):
        dist = _haversine(pings[i-1].lat, pings[i-1].lng, pings[i].lat, pings[i].lng)
        dt   = max((pings[i].timestamp - pings[i-1].timestamp).total_seconds() / 3600, 1e-6)
        velocity_max = max(velocity_max, dist / dt)

    # network_signal_dbm — average
    network_signal_dbm = float(sum(p.network_signal_dbm for p in pings) / len(pings))

    # app_active_minutes
    active_count       = sum(1 for p in pings if p.app_state == "active_seeking")
    app_active_minutes = active_count * (duration_hours * 60 / max(len(pings), 1))

    # claims_last_30_days — from db_store
    claims_last_30_days = float(get_claims_last_30_days(claim.worker_id))

    # time_to_zone_minutes — low value = suspicious (teleported in)
    first_zone = next((p for p in pings if _point_in_zone(p.lat, p.lng, claim.claim_zone)), None)
    time_to_zone_minutes = (
        (claim.claim_timestamp - first_zone.timestamp).total_seconds() / 60
        if first_zone else 0.0
    )

    return {
        "avg_accel_variance":   avg_accel,
        "battery_drain_rate":   battery_drain_rate,
        "zone_dwell_minutes":   zone_dwell_minutes,
        "velocity_max":         velocity_max,
        "network_signal_dbm":   network_signal_dbm,
        "app_active_minutes":   app_active_minutes,
        "claims_last_30_days":  claims_last_30_days,
        "time_to_zone_minutes": time_to_zone_minutes,
    }


def score_anomaly(worker_id: str, claim_features: dict) -> int:
    """Returns 0–30 contribution to fraud score."""
    model = _load_model(worker_id)
    if model is None:
        return 0  # no baseline yet — no penalty

    X   = np.array([[claim_features[f] for f in FEATURES]])
    raw = model.decision_function(X)[0]
    # decision_function: positive = normal, negative = anomalous
    # Map [-0.5, +0.5] → [30, 0], clamped
    return int(np.clip((0.0 - raw) * 60, 0, ANOMALY_MAX_CONTRIBUTION))

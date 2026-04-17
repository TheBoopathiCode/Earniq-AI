"""
Production-grade income baseline predictor.
Fixes:
  - Ridge regression instead of OLS (prevents overfit on small worker datasets)
  - Proper cross-validation
  - Realistic income patterns with non-linear interactions
  - Per-worker model with minimum data requirement
"""
from pathlib import Path
import numpy as np
import joblib
from sklearn.linear_model import Ridge
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

BASE_DIR = Path(__file__).parent
_models: dict[str, Pipeline] = {}

FEATURES = [
    "day_of_week",
    "hour_of_day",
    "zone_order_density",
    "weather_composite_score",
    "is_peak_hour",
]


def _generate_cohort_data(n: int = 10000) -> tuple:
    """
    Realistic Indian food delivery income data.
    Includes non-linear interactions (peak × density, weather × hour).
    """
    rng  = np.random.default_rng(42)
    hour = rng.integers(0, 24, n).astype(float)
    day  = rng.integers(0, 7, n).astype(float)
    density = rng.uniform(0, 1, n)
    weather = rng.uniform(0, 1, n)
    is_peak = (((hour >= 12) & (hour <= 14)) | ((hour >= 19) & (hour <= 21))).astype(float)

    # Realistic income with non-linear interactions
    base       = rng.uniform(50, 85, n)
    peak_bonus = np.where(is_peak == 1, 1.4 + density * 0.3, 1.0)  # peak × density interaction
    wx_penalty = 1.0 - (weather * 0.45)                              # weather hurts income
    density_fx = 0.65 + density * 0.7
    night_pen  = np.where((hour < 7) | (hour > 22), 0.7, 1.0)       # late night penalty
    weekend_fx = np.where(day >= 5, 1.15, 1.0)                       # weekend boost

    income = base * peak_bonus * wx_penalty * density_fx * night_pen * weekend_fx
    # Realistic noise: ±12% of income
    noise  = rng.normal(0, income * 0.12)
    income = np.clip(income + noise, 8, 220)

    X = np.column_stack([day, hour, density, weather, is_peak])
    return X, income


def _train_cohort_model() -> Pipeline:
    print("Training cohort income baseline model (Ridge + Polynomial features)...")
    X, y = _generate_cohort_data(10000)
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)

    # Ridge with polynomial features captures non-linear interactions
    model = Pipeline([
        ("poly",   PolynomialFeatures(degree=2, include_bias=False)),
        ("scaler", StandardScaler()),
        ("ridge",  Ridge(alpha=10.0)),  # L2 regularization prevents overfit
    ])
    model.fit(X_tr, y_tr)

    train_mae = mean_absolute_error(y_tr, model.predict(X_tr))
    test_mae  = mean_absolute_error(y_te, model.predict(X_te))
    train_r2  = r2_score(y_tr, model.predict(X_tr))
    test_r2   = r2_score(y_te, model.predict(X_te))
    cv_mae    = -cross_val_score(model, X, y, cv=5, scoring="neg_mean_absolute_error", n_jobs=-1).mean()
    gap       = abs(train_r2 - test_r2)

    print(f"  Train MAE : Rs{train_mae:.2f}/hr  R²={train_r2:.4f}")
    print(f"  Test  MAE : Rs{test_mae:.2f}/hr  R²={test_r2:.4f}  gap={gap:.4f}")
    print(f"  CV-5  MAE : Rs{cv_mae:.2f}/hr")
    print(f"  Overfit   : {'YES' if gap > 0.05 else 'NO'}")

    joblib.dump(model, BASE_DIR / "income_cohort_model.pkl")
    print(f"  Saved -> income_cohort_model.pkl")
    return model


_cohort_model: Pipeline | None = None


def _get_cohort_model() -> Pipeline:
    global _cohort_model
    if _cohort_model is None:
        path = BASE_DIR / "income_cohort_model.pkl"
        _cohort_model = joblib.load(path) if path.exists() else _train_cohort_model()
    return _cohort_model


def train_worker_baseline(worker_id: str, history: list[dict]) -> bool:
    """
    Per-worker Ridge model. Requires minimum 14 records (2 weeks).
    Uses Ridge to prevent overfit on small datasets.
    """
    if len(history) < 14:
        print(f"Worker {worker_id}: only {len(history)} records — using cohort fallback")
        return False

    X = np.array([[float(h.get(f, 0.0)) for f in FEATURES] for h in history])
    y = np.array([float(h["actual_income"]) for h in history])

    model = Pipeline([
        ("poly",   PolynomialFeatures(degree=2, include_bias=False)),
        ("scaler", StandardScaler()),
        ("ridge",  Ridge(alpha=5.0)),
    ])
    model.fit(X, y)

    # Cross-validate if enough data
    if len(history) >= 30:
        cv_mae = -cross_val_score(model, X, y, cv=3, scoring="neg_mean_absolute_error").mean()
        print(f"Worker {worker_id}: CV-3 MAE=Rs{cv_mae:.2f}/hr on {len(history)} records")
    else:
        mae = mean_absolute_error(y, model.predict(X))
        print(f"Worker {worker_id}: train MAE=Rs{mae:.2f}/hr on {len(history)} records")

    path = BASE_DIR / f"income_baseline_{worker_id}.pkl"
    joblib.dump(model, path)
    _models[worker_id] = model
    return True


def predict_expected_income(
    worker_id: str,
    day_of_week: int,
    hour_of_day: int,
    zone_order_density: float = 0.5,
    weather_composite_score: float = 0.0,
    is_peak_hour: bool = False,
) -> float:
    if worker_id not in _models:
        path = BASE_DIR / f"income_baseline_{worker_id}.pkl"
        if path.exists():
            _models[worker_id] = joblib.load(path)
    model = _models.get(worker_id) or _get_cohort_model()
    X = np.array([[
        float(day_of_week), float(hour_of_day),
        float(zone_order_density), float(weather_composite_score),
        float(int(is_peak_hour)),
    ]])
    return round(max(float(model.predict(X)[0]), 0.0), 2)


if __name__ == "__main__":
    _train_cohort_model()
    print("\nTesting predictions:")
    for hour, peak in [(9, False), (13, True), (20, True), (23, False)]:
        val = predict_expected_income("new_worker", 1, hour, 0.6, 0.0, peak)
        print(f"  Hour {hour:02d}h peak={peak} -> Rs{val:.2f}/hr")

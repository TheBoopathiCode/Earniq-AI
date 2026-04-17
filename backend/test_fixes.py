"""Verify all 5 fixes."""
import asyncio
from datetime import datetime, timedelta
from app.fraud.schemas import ClaimInput, GPSPing
from app.fraud.engine import evaluate_claim
from app.fraud.layers.gps_validation import _haversine, _point_in_zone, _zone_distance_km
from app.fraud.layers.anomaly_detection import extract_features, FEATURES
from app.fraud.db_store import has_approved_claim, record_approved_claim
from app.fraud.jobs.train_baselines import run as train_run

now        = datetime.utcnow()
week_start = now - timedelta(days=3)
week_end   = now + timedelta(days=4)

def make_ping(lat, lng, offset_min=0, accel=2.5, battery=0.8, signal=-85, app="active_seeking"):
    return GPSPing(
        lat=lat, lng=lng,
        timestamp=now - timedelta(minutes=30 - offset_min),
        accel_variance=accel, battery_level=battery,
        network_signal_dbm=signal, app_state=app,
    )

clean_claim = ClaimInput(
    worker_id="W001", disruption_event_id="EVT001",
    trigger_type="heavy_rain", claim_zone="zone_mumbai_west",
    claim_timestamp=now,
    gps_history=[make_ping(19.076, 72.877, i) for i in range(0, 30, 3)],
    policy_week_start=week_start, policy_week_end=week_end,
)

async def verify():
    print("=" * 60)
    print("VERIFYING ALL 5 FIXES")
    print("=" * 60)

    # Fix 1 — Split flags
    result = await evaluate_claim(clean_claim)
    assert hasattr(result, "decision_flags"), "Missing decision_flags"
    assert hasattr(result, "signal_flags"),   "Missing signal_flags"
    assert "battery_drain_anomaly" not in result.decision_flags
    assert "weather_mismatch"      not in result.signal_flags
    print("Fix 1 PASS — decision_flags / signal_flags split correctly")

    # Fix 2 — Haversine + zone helpers
    assert abs(_haversine(19.076, 72.877, 19.076, 72.877)) < 0.001
    assert _point_in_zone(19.076, 72.877, "zone_mumbai_west") == True
    assert _zone_distance_km("zone_mumbai_west", "zone_mumbai_north") > 10
    print("Fix 2 PASS — _haversine, _point_in_zone, _zone_distance_km correct")

    # Fix 3 — extract_features
    features = extract_features(clean_claim)
    assert set(features.keys()) == set(FEATURES), f"Key mismatch: {set(features.keys()) ^ set(FEATURES)}"
    assert all(isinstance(v, float) for v in features.values()), "All values must be float"
    print("Fix 3 PASS — extract_features returns correct keys and float values")

    # Fix 4 — db_store
    record_approved_claim("W001", "EVENT_123")
    assert has_approved_claim("W001", "EVENT_123") == True
    assert has_approved_claim("W001", "EVENT_999") == False
    print("Fix 4 PASS — db_store has_approved_claim / record_approved_claim work")

    # Fix 5 — training job
    train_run()
    print("Fix 5 PASS — train_baselines.run() completed without exception")

    print("\n" + "=" * 60)
    print("ALL 5 FIXES VERIFIED")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(verify())

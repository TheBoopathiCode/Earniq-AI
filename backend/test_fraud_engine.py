"""
End-to-end tests for the fraud detection engine.
Run: python test_fraud_engine.py
"""
import asyncio
from datetime import datetime, timedelta
from app.fraud.schemas import ClaimInput, GPSPing
from app.fraud.engine import evaluate_claim

now = datetime.utcnow()
week_start = now - timedelta(days=3)
week_end   = now + timedelta(days=4)

def make_ping(lat, lng, offset_min=0, accel=2.5, battery=0.8, signal=-85, app="active_seeking"):
    return GPSPing(
        lat=lat, lng=lng,
        timestamp=now - timedelta(minutes=30 - offset_min),
        accel_variance=accel,
        battery_level=battery,
        network_signal_dbm=signal,
        app_state=app,
    )

# ── Test 1: Clean claim → APPROVED ───────────────────────────────────────────
clean_claim = ClaimInput(
    worker_id="W001", disruption_event_id="EVT001",
    trigger_type="heavy_rain", claim_zone="velachery",
    claim_timestamp=now,
    gps_history=[make_ping(12.9815, 80.2180, i) for i in range(0, 30, 3)],
    policy_week_start=week_start, policy_week_end=week_end,
)

# ── Test 2: GPS spoofed claim → gps_spoof_detected ─────────────────────────
# Use same zone but impossible velocity between two pings
spoofed_claim = ClaimInput(
    worker_id="W002", disruption_event_id="EVT002",
    trigger_type="heavy_rain", claim_zone="velachery",
    claim_timestamp=now,
    gps_history=[
        make_ping(12.9815, 80.2180, 0),
        make_ping(12.9820, 80.2185, 0),  # 30 seconds later, 200km away (impossible)
        GPSPing(
            lat=12.9815 + 1.8, lng=80.2180,  # ~200km jump in 30 seconds
            timestamp=now - timedelta(seconds=30),
            accel_variance=0.1, battery_level=0.8,
            network_signal_dbm=-85, app_state="active_seeking"
        ),
    ],
    policy_week_start=week_start, policy_week_end=week_end,
)

# ── Test 3: Rain claim with 0.5mm → REJECTED at Layer 1 ──────────────────────
from unittest.mock import patch

# ── Test 4: Signal loss after 25 min in zone, DCS=85 → grace applies ─────────
grace_pings = [make_ping(12.9815, 80.2180, i, signal=-110, app="background") for i in range(0, 25, 3)]
grace_claim = ClaimInput(
    worker_id="W004", disruption_event_id="EVT004",
    trigger_type="heavy_rain", claim_zone="velachery",
    claim_timestamp=now,
    gps_history=grace_pings,
    policy_week_start=week_start, policy_week_end=week_end,
)

async def run_tests():
    print("=" * 60)
    print("EARNIQ FRAUD ENGINE — END-TO-END TESTS")
    print("=" * 60)

    # Test 1
    r1 = await evaluate_claim(clean_claim, dcs_score=78.0)
    print(f"\nTest 1 — Clean claim")
    print(f"  Score: {r1.fraud_score} | Status: {r1.status} | Flags: {r1.flags}")
    assert r1.status == "APPROVED", f"Expected APPROVED, got {r1.status}"
    print("  PASS")

    # Test 2 — Layer 1 catches zone mismatch (teleport), GPS layer never runs
    r2 = await evaluate_claim(spoofed_claim, dcs_score=78.0)
    print(f"\nTest 2 — GPS spoofed (impossible jump caught at Layer 1 or Layer 2)")
    print(f"  Score: {r2.fraud_score} | Status: {r2.status} | Flags: {r2.flags}")
    assert r2.status == "REJECTED", f"Expected REJECTED, got {r2.status}"
    assert any(f in r2.flags for f in ["gps_spoof_detected", "zone_mismatch"]), \
        f"Expected gps_spoof_detected or zone_mismatch, got {r2.flags}"
    print("  PASS")

    # Test 3 — mock weather to return 0.5mm
    with patch("app.fraud.layers.rule_checks.get_weather", return_value={"rain_1h": 0.5, "description": "clear"}):
        r3 = await evaluate_claim(clean_claim, dcs_score=78.0)
    print(f"\nTest 3 — Rain claim with 0.5mm (Layer 1 short-circuit)")
    print(f"  Score: {r3.fraud_score} | Status: {r3.status} | Flags: {r3.flags}")
    assert r3.status == "REJECTED"
    assert "weather_mismatch" in r3.flags
    assert r3.layer_scores["gps"] == 0, "GPS layer must NOT run after Layer 1 reject"
    print("  PASS")

    # Test 4 — GPS grace
    r4 = await evaluate_claim(grace_claim, dcs_score=85.0)
    print(f"\nTest 4 — Signal loss after 25min in zone, DCS=85 (grace applies)")
    print(f"  Score: {r4.fraud_score} | Status: {r4.status} | Flags: {r4.flags}")
    assert "insufficient_zone_presence" not in r4.flags, "Grace should suppress this flag"
    print("  PASS")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_tests())

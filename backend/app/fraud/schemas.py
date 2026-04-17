from pydantic import BaseModel, Field
from datetime import datetime

DECISION_FLAGS = {
    "weather_mismatch", "zone_mismatch", "duplicate_block", "policy_lapsed",
    "platform_contradiction", "gps_spoof_detected", "insufficient_zone_presence",
    "stationary_at_home_signal",
}

SIGNAL_FLAGS = {
    "battery_drain_anomaly", "strong_signal_in_disruption_zone", "app_not_active_seeking",
    "claim_burst_detected", "temporal_clustering", "collective_intelligence_inversion",
    "device_fingerprint_cluster", "referral_chain_cluster",
}


def split_flags(flags: list[str]) -> tuple[list[str], list[str]]:
    decision = [f for f in flags if f in DECISION_FLAGS]
    signal   = [f for f in flags if f in SIGNAL_FLAGS]
    # Unknown flags default to signal (internal only)
    signal  += [f for f in flags if f not in DECISION_FLAGS and f not in SIGNAL_FLAGS]
    return decision, signal


class GPSPing(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    timestamp: datetime
    accel_variance: float = Field(..., ge=0.0, le=50.0)
    battery_level: float = Field(..., ge=0.0, le=1.0)
    network_signal_dbm: int = Field(..., ge=-130, le=0)
    app_state: str  # "active_seeking" | "background" | "closed"


class ClaimInput(BaseModel):
    worker_id: str
    disruption_event_id: str
    trigger_type: str           # "heavy_rain" | "platform_outage" | "flood" | "aqi"
    claim_zone: str
    claim_timestamp: datetime
    gps_history: list[GPSPing]  # last 30 minutes minimum
    policy_week_start: datetime
    policy_week_end: datetime


class FraudResult(BaseModel):
    fraud_score: int            # 0–100, clamped
    status: str                 # "APPROVED" | "REVIEW" | "REJECTED"
    decision_flags: list[str]   # shown to worker — explains the hold
    signal_flags: list[str]     # internal only — never sent to frontend
    layer_scores: dict          # {"rules": 0, "gps": 45, "anomaly": 20}
    syndicate_alert: bool
    worker_message: str         # shown to worker, never accusatory

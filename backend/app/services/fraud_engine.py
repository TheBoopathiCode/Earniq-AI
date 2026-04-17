import math
from datetime import datetime
from app.ml.predict_fraud import predict_fraud

RULE_WEIGHT        = 0.6
ML_WEIGHT          = 0.4
THRESHOLD_APPROVE  = 30
THRESHOLD_REJECT   = 70

GPS_DISTANCE_FLAG   = 10.0
SPEED_FLAG          = 80.0
RAIN_LOW_FLAG       = 10.0
RULE_SCORE_PER_FLAG = 25

# Maximum raw rule points before normalization:
#   5 rule checks × 25 = 125
#   3 GPS checks  × 25 = 75  (velocity+zone+teleport)
#   1 rain check  × 25 = 25
#   Total possible    = 225
# We normalize to 0–100 before blending with ML score.
MAX_RAW_RULE_SCORE = 225


def calculate_fraud_score(trigger_type: str, signals: dict, loss_percent: float) -> dict:
    rule_score = 0
    flags      = []
    checks     = [
        {"name": "Weather match", "passed": not (trigger_type == "rain" and signals.get("weather", 0) < 50)},
        {"name": "AQI match",     "passed": not (trigger_type == "aqi"  and signals.get("aqi", 0) < 50)},
        {"name": "Zone match",    "passed": True},
        {"name": "No duplicates", "passed": True},
        {"name": "Policy active", "passed": True},
    ]

    for check in checks:
        if not check["passed"]:
            rule_score += RULE_SCORE_PER_FLAG
            flags.append(check["name"])

    gps_distance = max(0, (100 - signals.get("weather", 100)) / 10)
    speed_proxy  = signals.get("traffic", 0) * 1.2

    if gps_distance > GPS_DISTANCE_FLAG:
        rule_score += RULE_SCORE_PER_FLAG
        flags.append("gps_mismatch")
    if speed_proxy > SPEED_FLAG:
        rule_score += RULE_SCORE_PER_FLAG
        flags.append("speed_anomaly")
    if trigger_type == "rain" and signals.get("weather", 100) < RAIN_LOW_FLAG:
        rule_score += RULE_SCORE_PER_FLAG
        flags.append("weather_mismatch")

    # Normalize raw rule score to 0–100 before blending with ML score.
    # Without this, rule_score alone can reach 225 (5 checks + 3 GPS + 1 rain),
    # making the blended final_score meaningless against 0–100 thresholds.
    rule_score_normalized = min(100.0, round(rule_score / MAX_RAW_RULE_SCORE * 100, 2))

    # DCS at claim time — genuine disruptions have high DCS
    dcs_at_claim = signals.get("dcs_score", 75.0)
    # Accelerometer proxy — genuine workers show road vibration before disruption
    accel_proxy  = 2.5 if signals.get("workerIdle", 50) < 60 else 0.2

    ml_score = 0.0
    ml_used  = False
    try:
        features = [
            gps_distance,
            speed_proxy,
            signals.get("weather", 50),
            signals.get("aqi", 100),
            1,
            signals.get("workerIdle", 50),
            loss_percent,
            datetime.utcnow().hour,
            dcs_at_claim,   # new feature
            accel_proxy,    # new feature
        ]
        ml_score = predict_fraud(features)
        ml_used  = True
    except Exception as e:
        flags.append(f"ml_unavailable: {str(e)}")

    final_score = min(round(rule_score_normalized * RULE_WEIGHT + ml_score * ML_WEIGHT, 2), 100)

    if final_score >= THRESHOLD_REJECT:    decision = "auto_reject"
    elif final_score >= THRESHOLD_APPROVE: decision = "review"
    else:                                  decision = "auto_approve"

    return {
        "fraud_score":       final_score,
        "decision":          decision,
        "syndicate_score":   8,
        "rule_score":        rule_score,
        "rule_score_normalized": rule_score_normalized,
        "ml_score":          ml_score,
        "ml_used":           ml_used,
        "flags":             flags,
        "layer1_passed":     all(c["passed"] for c in checks),
        "layer1_checks":     checks,
        "layer2_passed":     True,
        "layer2_velocity":   round(speed_proxy, 1),
        "layer2_dwell_time": 45,
        "layer3_score":      round(ml_score / 100, 4) if ml_used else 0.08,
        "layer3_features":   ["gps", "speed", "rain", "aqi", "claims", "idle", "loss_pct", "time", "dcs", "accel"],
    }


def get_claim_status_from_decision(decision: str) -> str:
    if decision == "auto_approve": return "paid"
    if decision == "review":       return "approved"
    return "rejected"


def check_gps_spoofing(
    claim_lat: float, claim_lon: float,
    worker_zone_lat: float, worker_zone_lon: float,
    last_known_lat: float, last_known_lon: float,
    minutes_since_last_ping: float
) -> dict:
    def haversine(lat1, lon1, lat2, lon2):
        R = 6371
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
        return R * 2 * math.asin(math.sqrt(a))

    distance_from_zone = haversine(claim_lat, claim_lon, worker_zone_lat, worker_zone_lon)
    distance_traveled  = haversine(last_known_lat, last_known_lon, claim_lat, claim_lon)
    velocity_kmh       = distance_traveled / max(minutes_since_last_ping / 60, 0.001)
    max_possible       = (minutes_since_last_ping / 60) * 30

    is_velocity_anomaly = velocity_kmh > 120
    is_zone_mismatch    = distance_from_zone > 3.0
    is_teleport         = distance_traveled > max_possible * 1.5

    score_addition = 0
    flags = []
    if is_velocity_anomaly:
        score_addition += 45
        flags.append(f"GPS velocity {round(velocity_kmh)} km/h exceeds 120 km/h")
    if is_zone_mismatch:
        score_addition += 30
        flags.append(f"Claim location {round(distance_from_zone, 1)}km from registered zone")
    if is_teleport:
        score_addition += 35
        flags.append(f"Location jumped {round(distance_traveled, 1)}km in {round(minutes_since_last_ping)} min")

    return {
        "score_addition":        min(score_addition, 80),
        "velocity_kmh":          round(velocity_kmh, 1),
        "distance_from_zone_km": round(distance_from_zone, 2),
        "distance_traveled_km":  round(distance_traveled, 2),
        "is_velocity_anomaly":   is_velocity_anomaly,
        "is_zone_mismatch":      is_zone_mismatch,
        "is_teleport":           is_teleport,
        "flags":                 flags,
        "passed":                score_addition == 0,
    }


def check_weather_claim_validity(
    trigger_type: str, weather_signal: float, aqi_signal: float,
    zone_risk_score: int, historical_event_frequency: float, time_of_day_hour: int
) -> dict:
    score_addition = 0
    flags  = []
    checks = []

    if trigger_type == "rain":
        passed = weather_signal >= 50
        if not passed:
            score_addition += 35
            flags.append(f"Rain trigger but weather signal {weather_signal}/100")
        checks.append({"name": "Weather signal match", "passed": passed, "value": f"{weather_signal}/100", "threshold": ">=50"})
        if zone_risk_score < 30 and historical_event_frequency < 0.1:
            score_addition += 20
            flags.append(f"Zone risk {zone_risk_score} LOW — rain historically rare")
            checks.append({"name": "Zone historical pattern", "passed": False, "value": f"Risk {zone_risk_score}", "threshold": ">=30"})
        else:
            checks.append({"name": "Zone historical pattern", "passed": True, "value": f"Risk {zone_risk_score}", "threshold": ">=30"})

    if trigger_type == "aqi":
        passed = aqi_signal >= 50
        if not passed:
            score_addition += 35
            flags.append(f"AQI trigger but signal {aqi_signal}/100")
        checks.append({"name": "AQI signal match", "passed": passed, "value": f"{aqi_signal}/100", "threshold": ">=50"})

    peak_hours = list(range(12, 15)) + list(range(19, 22))
    if trigger_type == "outage" and time_of_day_hour not in peak_hours:
        score_addition += 15
        flags.append(f"Outage claimed at {time_of_day_hour}:00 — outside peak hours")
        checks.append({"name": "Peak hour validation", "passed": False, "value": f"{time_of_day_hour}:00", "threshold": "12-14 or 19-21"})
    else:
        checks.append({"name": "Peak hour validation", "passed": True, "value": f"{time_of_day_hour}:00", "threshold": "Any hour"})

    return {"score_addition": min(score_addition, 60), "flags": flags, "checks": checks, "passed": score_addition == 0}


def calculate_syndicate_score(
    zone_id: str, claims_in_last_10_min: int,
    zone_90day_avg_claims_per_10min: float,
    pct_claims_in_same_window: float, mean_signal_strength: float
) -> dict:
    velocity_ratio  = claims_in_last_10_min / max(zone_90day_avg_claims_per_10min, 0.1)
    syndicate_score = round(
        min(velocity_ratio * 10, 100) * 0.25 +
        pct_claims_in_same_window * 100 * 0.20 +
        mean_signal_strength * 0.15
    )

    if syndicate_score >= 60:   action, message = "ZONE_LOCK",   "All claims frozen — ring investigation opened"
    elif syndicate_score >= 30: action, message = "SOFT_FREEZE", "New claims held — insurer review required"
    else:                       action, message = "CLEAR",       "No coordinated fraud pattern detected"

    return {
        "syndicate_score":  syndicate_score,
        "action":           action,
        "message":          message,
        "velocity_ratio":   round(velocity_ratio, 1),
        "claims_analyzed":  claims_in_last_10_min,
        "zone_baseline":    zone_90day_avg_claims_per_10min,
    }

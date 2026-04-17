from math import radians, sin, cos, sqrt, atan2
from app.fraud.schemas import ClaimInput
from app.fraud.db_store import get_baseline_drain

VELOCITY_MAX_KMH  = 120.0
MIN_ZONE_PINGS    = 3
ACCEL_STATIONARY  = 0.3
GPS_SPOOF_SCORE   = 45
STATIONARY_SCORE  = 30
GPS_GRACE_MINUTES = 20
GPS_GRACE_DCS_MIN = 70.0

ZONES: dict[str, dict] = {
    "zone_mumbai_west":   {"lat": 19.0760, "lng": 72.8777, "radius_km": 3.0},
    "zone_mumbai_north":  {"lat": 19.2183, "lng": 72.9781, "radius_km": 3.0},
    "zone_delhi_central": {"lat": 28.6139, "lng": 77.2090, "radius_km": 3.0},
    "zone_bangalore_hsr": {"lat": 12.9116, "lng": 77.6474, "radius_km": 2.5},
    # Legacy zone names from existing tests
    "velachery":          {"lat": 12.9815, "lng": 80.2180, "radius_km": 2.5},
    "tambaram":           {"lat": 12.9249, "lng": 80.1000, "radius_km": 2.5},
    "omr":                {"lat": 12.9063, "lng": 80.2270, "radius_km": 2.5},
    "anna_nagar":         {"lat": 13.0850, "lng": 80.2101, "radius_km": 2.5},
    "t_nagar":            {"lat": 13.0418, "lng": 80.2341, "radius_km": 2.5},
    "dwarka":             {"lat": 28.5921, "lng": 77.0460, "radius_km": 2.5},
    "ito":                {"lat": 28.6289, "lng": 77.2405, "radius_km": 2.5},
    "south_delhi":        {"lat": 28.5245, "lng": 77.2066, "radius_km": 2.5},
    "connaught_place":    {"lat": 28.6315, "lng": 77.2167, "radius_km": 2.5},
    "noida_62":           {"lat": 28.6208, "lng": 77.3633, "radius_km": 2.5},
}


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Returns distance in km between two lat/lng points."""
    R = 6371.0
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _zone_from_coords(lat: float, lng: float) -> str | None:
    """Returns zone name if point is inside any known zone, else None."""
    for name, z in ZONES.items():
        if _haversine(lat, lng, z["lat"], z["lng"]) <= z["radius_km"]:
            return name
    return None


def _point_in_zone(lat: float, lng: float, zone_name: str) -> bool:
    if zone_name not in ZONES:
        return False
    z = ZONES[zone_name]
    return _haversine(lat, lng, z["lat"], z["lng"]) <= z["radius_km"]


def _zone_distance_km(zone_a: str, zone_b: str) -> float:
    """Returns distance between two zone centroids in km."""
    if zone_a not in ZONES or zone_b not in ZONES:
        return 0.0
    a, b = ZONES[zone_a], ZONES[zone_b]
    return _haversine(a["lat"], a["lng"], b["lat"], b["lng"])


def run_gps_validation(claim: ClaimInput) -> dict:
    """Layer 2 — returns score 0-75. Does NOT auto-reject."""
    score = 0
    flags = []
    pings = claim.gps_history

    # Velocity sanity check
    for i in range(1, len(pings)):
        dist_km  = _haversine(pings[i-1].lat, pings[i-1].lng, pings[i].lat, pings[i].lng)
        dt_hours = max((pings[i].timestamp - pings[i-1].timestamp).total_seconds() / 3600, 1e-6)
        if (dist_km / dt_hours) > VELOCITY_MAX_KMH:
            score += GPS_SPOOF_SCORE
            flags.append("gps_spoof_detected")
            break

    # Zone dwell confirmation
    zone_pings = [p for p in pings if _point_in_zone(p.lat, p.lng, claim.claim_zone)]
    if len(zone_pings) < MIN_ZONE_PINGS:
        flags.append("insufficient_zone_presence")

    # Behavioral motion check
    avg_accel = sum(p.accel_variance for p in pings) / len(pings) if pings else 0
    if avg_accel < ACCEL_STATIONARY:
        score += STATIONARY_SCORE
        flags.append("stationary_at_home_signal")

    # Battery drain anomaly
    if len(pings) >= 2:
        dt_hours   = max((pings[-1].timestamp - pings[0].timestamp).total_seconds() / 3600, 1e-6)
        drain_rate = (pings[0].battery_level - pings[-1].battery_level) / dt_hours
        baseline   = get_baseline_drain(claim.worker_id)
        if drain_rate > baseline * 1.8:
            flags.append("battery_drain_anomaly")

    # Network signal paradox
    if pings[-1].network_signal_dbm > -75:
        flags.append("strong_signal_in_disruption_zone")

    # App state check
    if pings[-1].app_state in ("background", "closed"):
        flags.append("app_not_active_seeking")

    return {"score": min(score, 75), "flags": flags}


def apply_gps_grace(claim: ClaimInput, dcs_score: float) -> bool:
    """
    GPS grace window: worker had valid pings in zone >= 20 min before signal loss
    AND zone DCS > 70 → location VERIFIED. Signal loss = evidence of disruption.
    """
    if dcs_score < GPS_GRACE_DCS_MIN:
        return False
    zone_pings = [p for p in claim.gps_history if _point_in_zone(p.lat, p.lng, claim.claim_zone)]
    if not zone_pings:
        return False
    dwell_minutes = (zone_pings[-1].timestamp - zone_pings[0].timestamp).total_seconds() / 60
    return dwell_minutes >= GPS_GRACE_MINUTES

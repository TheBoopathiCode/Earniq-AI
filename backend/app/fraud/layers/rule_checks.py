from app.fraud.mock_apis import get_weather, get_platform_status
from app.fraud.schemas import ClaimInput
from app.fraud.db_store import has_approved_claim
from app.fraud.layers.gps_validation import _haversine, _zone_distance_km, ZONES

WEATHER_MIN_MM   = 2.0
ZONE_MISMATCH_KM = 3.0


def _zone_from_coords(lat: float, lng: float) -> str | None:
    """Returns nearest zone name (or None if outside all zones)."""
    best_zone, best_dist = None, float("inf")
    for name, z in ZONES.items():
        d = _haversine(lat, lng, z["lat"], z["lng"])
        if d < best_dist:
            best_dist, best_zone = d, name
    return best_zone


def run_rule_checks(claim: ClaimInput) -> dict:
    """Layer 1 — any failure = immediate reject, never reaches Layer 2."""

    # Check 1 — Weather source mismatch
    if claim.trigger_type == "heavy_rain":
        weather = get_weather(lat=claim.gps_history[-1].lat, lng=claim.gps_history[-1].lng)
        if weather["rain_1h"] < WEATHER_MIN_MM:
            return {"passed": False, "flag": "weather_mismatch",
                    "reason": f"OpenWeatherMap shows {weather['rain_1h']}mm — below {WEATHER_MIN_MM}mm threshold"}

    # Check 2 — Zone presence mismatch
    last_ping     = claim.gps_history[-1]
    last_gps_zone = _zone_from_coords(last_ping.lat, last_ping.lng)
    if last_gps_zone and last_gps_zone != claim.claim_zone:
        dist = _zone_distance_km(last_gps_zone, claim.claim_zone)
        if dist > ZONE_MISMATCH_KM:
            return {"passed": False, "flag": "zone_mismatch",
                    "reason": f"Last GPS zone {last_gps_zone} is {dist:.1f}km from claim zone {claim.claim_zone}"}

    # Check 3 — Duplicate claim
    if has_approved_claim(claim.worker_id, claim.disruption_event_id):
        return {"passed": False, "flag": "duplicate_block",
                "reason": "Worker already has an approved claim for this disruption event"}

    # Check 4 — Policy window
    if not (claim.policy_week_start <= claim.claim_timestamp <= claim.policy_week_end):
        return {"passed": False, "flag": "policy_lapsed",
                "reason": "Claim timestamp outside active policy window"}

    # Check 5 — Platform outage contradiction
    if claim.trigger_type == "platform_outage":
        platform = get_platform_status()
        if platform["status"] == "operational":
            return {"passed": False, "flag": "platform_contradiction",
                    "reason": "Platform API reports operational — outage claim contradicted"}

    return {"passed": True}

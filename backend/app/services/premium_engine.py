def get_zone_multiplier(risk_score: int) -> float:
    if risk_score <= 20: return 0.67
    if risk_score <= 40: return 0.90
    if risk_score <= 60: return 1.20
    if risk_score <= 80: return 1.65
    return 2.33


def get_claim_factor(claims_last_8_weeks: int) -> float:
    return min(1.0 + claims_last_8_weeks * 0.2, 1.8)


def get_consistency_bonus(active_days: int, total_days: int) -> float:
    if total_days == 0:
        return 1.0
    consistency = active_days / total_days
    if consistency >= 0.85: return 0.85
    if consistency >= 0.70: return 0.90
    if consistency >= 0.50: return 0.95
    return 1.0


def calculate_premium(
    zone_risk_score: int,
    claims_last_8_weeks: int = 0,
    active_days: int = 7,
    total_days: int = 7
) -> dict:
    base_rate = 12
    zone_multiplier = get_zone_multiplier(zone_risk_score)
    claim_factor = get_claim_factor(claims_last_8_weeks)
    consistency_bonus = get_consistency_bonus(active_days, total_days)
    final = round(base_rate * zone_multiplier * claim_factor * consistency_bonus)
    final = max(8, min(28, final))
    return {
        "base_rate": base_rate,
        "zone_multiplier": zone_multiplier,
        "claim_factor": claim_factor,
        "consistency_bonus": consistency_bonus,
        "final_premium": final,
    }


def get_tier(premium: int) -> str:
    if premium <= 12: return "basic"
    if premium <= 20: return "standard"
    return "premium"


def calculate_risk_score(zone_risk_score: int, working_hours: int, avg_orders: int) -> int:
    score = zone_risk_score
    if working_hours >= 10: score += 5
    if working_hours >= 12: score += 5
    if avg_orders >= 20: score += 3
    if avg_orders >= 25: score += 3
    return max(0, min(100, score))


TIER_COVERAGE = {
    "basic":    400,
    "standard": 600,
    "premium":  800,
}

TIER_TRIGGERS = {
    "basic": ["rain", "heat"],
    "standard": ["rain", "heat", "aqi", "lockdown"],
    "premium": ["rain", "heat", "aqi", "lockdown", "outage", "pandemic"],
}


def get_ai_insight(zone_risk_score: int, tier: str) -> str:
    if zone_risk_score > 70:
        return "Heavy rain forecast this week in your zone. Coverage pre-boosted. Stay safe."
    if zone_risk_score > 50:
        return "Moderate disruption risk this week. Your coverage is active and monitoring."
    if tier == "basic":
        return "Low disruption risk this week. Consider upgrading to Standard for AQI coverage."
    return "Your zone is low risk this week. Premium reduced by consistency bonus."

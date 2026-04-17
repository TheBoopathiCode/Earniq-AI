def calculate_dcs(signals: dict) -> float:
    """README-spec DCS weights: weather×0.35 + aqi×0.20 + traffic×0.15 + govt×0.20 + idle×0.10"""
    return round(
        signals.get("weather",    0) * 0.35 +
        signals.get("aqi",        0) * 0.20 +
        signals.get("traffic",    0) * 0.15 +
        signals.get("govtAlert",  0) * 0.20 +
        signals.get("workerIdle", 0) * 0.10,
        1
    )


def get_zone_signals(zone_risk: int) -> dict:
    """
    Fallback-only: used when live API data is unavailable.
    Returns conservative estimates — NOT proportional multiplications.
    High zone_risk means higher baseline probability, not certainty.
    """
    # Non-linear mapping: risk 0→0, risk 50→25, risk 80→55, risk 100→75
    base = round((zone_risk ** 1.4) / 100, 1)
    return {
        "weather":    round(min(100, base * 0.90), 1),
        "aqi":        round(min(100, base * 0.65), 1),
        "traffic":    round(min(100, base * 0.55), 1),
        "govtAlert":  round(min(100, base * 0.30), 1),
        "bioAlert":   0.0,
        "conflict":   0.0,
        "infraOutage":round(min(100, base * 0.20), 1),
        "workerIdle": round(min(100, base * 0.45), 1),
    }


def get_income_status(dcs: float) -> str:
    if dcs >= 70: return "RED"
    if dcs >= 40: return "YELLOW"
    return "GREEN"


def get_background_dcs(zone_risk_score: int) -> dict:
    """Single source of truth: zone risk → signals → DCS → income status."""
    signals = get_zone_signals(zone_risk_score)
    dcs = calculate_dcs(signals)
    return {
        "dcs": dcs,
        "signals": signals,
        "income_status": get_income_status(dcs),
    }



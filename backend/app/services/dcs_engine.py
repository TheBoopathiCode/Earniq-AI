def calculate_dcs(signals: dict) -> float:
    return round(
        signals.get("weather", 0)    * 0.25 +
        signals.get("aqi", 0)        * 0.15 +
        signals.get("traffic", 0)    * 0.10 +
        signals.get("govtAlert", 0)  * 0.15 +
        signals.get("workerIdle", 0) * 0.05 +
        signals.get("bioAlert", 0)   * 0.15 +
        signals.get("conflict", 0)   * 0.10 +
        signals.get("infraOutage", 0)* 0.05,
        1
    )


def get_zone_signals(zone_risk: int) -> dict:
    """Derive all signals deterministically from zone risk score."""
    return {
        "weather":    round(zone_risk * 1.00, 1),
        "aqi":        round(zone_risk * 0.80, 1),
        "traffic":    round(zone_risk * 0.70, 1),
        "govtAlert":  round(zone_risk * 0.60, 1),
        "bioAlert":   round(zone_risk * 0.50, 1),
        "conflict":   round(zone_risk * 0.40, 1),
        "infraOutage":round(zone_risk * 0.30, 1),
        "workerIdle": round(zone_risk * 0.50, 1),
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


TRIGGER_SIMULATIONS = {
    "rain": {
        "signals": {"weather": 95, "aqi": 20, "traffic": 60, "govtAlert": 0, "workerIdle": 85, "bioAlert": 0, "conflict": 0, "infraOutage": 0},
        "dcs": 74.0, "income_loss_pct": 67.0,
        "description": "Heavy rainfall >15mm/hr detected. Roads flooded, orders dropped 80%.",
    },
    "heat": {
        "signals": {"weather": 90, "aqi": 45, "traffic": 30, "govtAlert": 20, "workerIdle": 70, "bioAlert": 0, "conflict": 0, "infraOutage": 0},
        "dcs": 71.0, "income_loss_pct": 45.0,
        "description": "Extreme heat 46C feels-like. Outdoor delivery suspended by platform advisory.",
    },
    "aqi": {
        "signals": {"weather": 10, "aqi": 95, "traffic": 40, "govtAlert": 60, "workerIdle": 75, "bioAlert": 0, "conflict": 0, "infraOutage": 0},
        "dcs": 72.0, "income_loss_pct": 55.0,
        "description": "AQI 380 Hazardous. Government advisory restricts outdoor movement. Orders down 60%.",
    },
    "lockdown": {
        "signals": {"weather": 15, "aqi": 25, "traffic": 10, "govtAlert": 100, "workerIdle": 100, "bioAlert": 0, "conflict": 0, "infraOutage": 0},
        "dcs": 85.0, "income_loss_pct": 100.0,
        "description": "Section 144 imposed. All movement banned. Platform operations suspended.",
    },
    "outage": {
        "signals": {"weather": 20, "aqi": 30, "traffic": 25, "govtAlert": 0, "workerIdle": 90, "bioAlert": 0, "conflict": 0, "infraOutage": 100},
        "dcs": 73.0, "income_loss_pct": 100.0,
        "description": "Platform app outage during peak hours 19:00-21:00. No orders assigned for 2 hours.",
    },
    "pandemic": {
        "signals": {"weather": 10, "aqi": 20, "traffic": 5, "govtAlert": 100, "workerIdle": 100, "bioAlert": 100, "conflict": 0, "infraOutage": 0},
        "dcs": 100.0, "income_loss_pct": 100.0,
        "description": "State lockdown order. All outdoor work banned. DCS auto-set to 100.",
    },
}

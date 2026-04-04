import random
import string
from datetime import datetime, timedelta

TRIGGER_CONFIG = {
    "rain":     {"disruption_hours": 1.5, "max_payout": 400},
    "heat":     {"disruption_hours": 2.0, "max_payout": 300},
    "aqi":      {"disruption_hours": 2.0, "max_payout": 350},
    "lockdown": {"disruption_hours": 8.0, "max_payout": 600},
    "outage":   {"disruption_hours": 1.5, "max_payout": 300},
    "pandemic": {"disruption_hours": 8.0, "max_payout": 800},
}

def generate_utr() -> str:
    return f"RZPY{''.join(random.choices(string.digits, k=8))}"

def calculate_income_values(
    hourly_rate: int,
    working_hours: int,
    income_loss_pct: float,
    trigger_type: str,
    coverage_cap: int
) -> dict:
    config = TRIGGER_CONFIG.get(trigger_type, {"disruption_hours": 1.5, "max_payout": 400})
    disruption_hours = config["disruption_hours"]
    trigger_max = config["max_payout"]

    expected = float(hourly_rate * working_hours)
    actual = round(expected * (1 - income_loss_pct / 100), 2)
    gross_loss = round(expected - actual, 2)

    proportional_payout = round(hourly_rate * disruption_hours * (income_loss_pct / 100), 2)
    payout = min(proportional_payout, trigger_max, coverage_cap)
    payout = round(payout, 2)

    return {
        "expected_income": expected,
        "actual_income": actual,
        "loss_amount": gross_loss,
        "loss_percent": income_loss_pct,
        "disruption_hours": disruption_hours,
        "proportional_loss": proportional_payout,
        "payout_amount": payout,
        "trigger_max": trigger_max,
        "coverage_cap": coverage_cap,
        "limiting_factor": (
            "trigger_cap" if proportional_payout >= trigger_max
            else "coverage_cap" if proportional_payout >= coverage_cap
            else "proportional"
        )
    }

def calculate_payout(
    hourly_rate: int,
    disruption_hours: float,
    loss_pct: float,
    coverage_cap: int,
    trigger_type: str
) -> float:
    config = TRIGGER_CONFIG.get(trigger_type, {"max_payout": 400})
    trigger_max = config["max_payout"]
    proportional = hourly_rate * disruption_hours * (loss_pct / 100)
    return round(min(proportional, trigger_max, coverage_cap), 2)

def build_claim_timeline(trigger_type: str, zone_name: str, payout: float) -> list:
    now = datetime.utcnow()
    return [
        {"step": 1, "title": "Disruption Detected",   "description": f"{trigger_type.upper()} event confirmed in {zone_name}", "timestamp": now.isoformat(), "status": "complete"},
        {"step": 2, "title": "DCS Threshold Crossed", "description": "Disruption Confidence Score exceeded 70 — auto-claim triggered", "timestamp": (now + timedelta(seconds=2)).isoformat(), "status": "complete"},
        {"step": 3, "title": "Fraud Engine Cleared",  "description": "3-layer fraud check passed. Score 8/100 — auto-approved", "timestamp": (now + timedelta(seconds=4)).isoformat(), "status": "complete"},
        {"step": 4, "title": f"Rs{payout} Credited",  "description": "UPI payout processed successfully", "timestamp": (now + timedelta(seconds=6)).isoformat(), "status": "complete", "amount": payout},
    ]

TRIGGER_DISPLAY_NAMES = {
    "rain":     "Heavy Rainfall",
    "heat":     "Extreme Heat",
    "aqi":      "Severe AQI",
    "lockdown": "Zone Lockdown",
    "outage":   "Platform Outage",
    "pandemic": "Pandemic Lockdown"
}

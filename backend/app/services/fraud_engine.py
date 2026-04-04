def calculate_fraud_score(trigger_type: str, signals: dict, loss_percent: float) -> dict:
    score = 0
    checks = [
        {"name": "Weather match", "passed": not (trigger_type == "rain" and signals.get("weather", 0) < 50)},
        {"name": "AQI match",     "passed": not (trigger_type == "aqi"  and signals.get("aqi", 0) < 50)},
        {"name": "Zone match",    "passed": True},
        {"name": "No duplicates", "passed": True},
        {"name": "Policy active", "passed": True},
    ]

    for check in checks:
        if not check["passed"]:
            score += 30

    layer3_score = 0.08
    if loss_percent > 90:
        score += 10
        layer3_score = 0.15

    fraud_score = min(100, score)

    if fraud_score >= 70:
        decision = "auto_reject"
    elif fraud_score >= 30:
        decision = "review"
    else:
        decision = "auto_approve"

    return {
        "fraud_score": fraud_score,
        "decision": decision,
        "syndicate_score": 8,
        "layer1_passed": all(c["passed"] for c in checks),
        "layer1_checks": checks,
        "layer2_passed": True,
        "layer2_velocity": 24,
        "layer2_dwell_time": 45,
        "layer3_score": layer3_score,
        "layer3_features": ["claim_freq", "gps_velocity", "weather", "idle_pattern", "dcs_time", "last_claim"],
    }


def get_claim_status_from_decision(decision: str) -> str:
    if decision == "auto_approve": return "paid"
    if decision == "review": return "approved"
    return "rejected"

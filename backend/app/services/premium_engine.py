"""
premium_engine.py — Hybrid Parametric Premium & Payout Model

Premium formula:
  weekly_income = avg_orders * working_days * 60
  base_premium  = clamp(50, weekly_income * 0.027, 300)
  final_premium = base_premium * BCR_uplift

Payout formula (hybrid parametric + income):
  P_param  = min(hourly_rate * trigger_hours, trigger_max)
  P_income = lambda * max(0, gross_loss - 50) * M
  P_final  = min(max(P_param, P_income), trigger_max, coverage_cap)
"""
import os
import logging

logger = logging.getLogger("earniq.premium")

# ── Trigger config ────────────────────────────────────────────────────────────
TRIGGER_CONFIG = {
    "rain":     {"condition": "rain_mm > 10",      "disruption_hours": 1.5, "max_payout": 400},
    "heat":     {"condition": "feels_like > 42",   "disruption_hours": 2.0, "max_payout": 300},
    "aqi":      {"condition": "aqi > 300",         "disruption_hours": 2.0, "max_payout": 350},
    "lockdown": {"condition": "govt_alert == true", "disruption_hours": 8.0, "max_payout": 800},
    "outage":   {"condition": "platform_down",     "disruption_hours": 1.5, "max_payout": 300},
    "pandemic": {"condition": "state_lockdown",    "disruption_hours": 8.0, "max_payout": 800},
}

# ── Tier assignment based on weekly_income ────────────────────────────────────
# Tier determines coverage_cap and which triggers are covered
TIER_COVERAGE = {
    "basic":    400,
    "standard": 600,
    "premium":  800,
}

TIER_TRIGGERS = {
    "basic":    ["rain", "heat"],
    "standard": ["rain", "heat", "aqi", "lockdown"],
    "premium":  ["rain", "heat", "aqi", "lockdown", "outage", "pandemic"],
}


# ── Income basis ──────────────────────────────────────────────────────────────

def compute_weekly_income(avg_orders: int, working_hours: int, avg_order_value: int = 60) -> dict:
    """Compute weekly income from worker profile."""
    working_days = 6 if working_hours >= 10 else 5 if working_hours >= 8 else 4
    weekly_income = avg_orders * working_days * avg_order_value
    daily_income  = round(weekly_income / working_days)
    hourly_rate   = round(daily_income / max(working_hours, 1))
    return {
        "weekly_income":  weekly_income,
        "daily_income":   daily_income,
        "hourly_rate":    hourly_rate,
        "working_days":   working_days,
        "avg_order_value": avg_order_value,
    }


# ── Premium calculation ───────────────────────────────────────────────────────

def compute_base_premium(weekly_income: int) -> float:
    """
    base_premium = clamp(₹50, weekly_income × 2.7%, ₹300)
    Example: ₹4500/week → ₹121.50
    """
    return round(max(50.0, min(300.0, weekly_income * 0.027)), 2)


def apply_bcr_uplift(base_premium: float, bcr: float) -> float:
    """
    uplift = min(3.0, 1 + (BCR - 0.70)^1.5)   if BCR > 0.70
    uplift = 1.0                                 if BCR <= 0.70
    """
    if bcr <= 0.70:
        uplift = 1.0
    else:
        uplift = min(3.0, 1.0 + (bcr - 0.70) ** 1.5)
    return round(base_premium * uplift, 2)


def compute_final_premium(avg_orders: int, working_hours: int, bcr: float = 0.0) -> dict:
    """
    Full premium computation. Returns all intermediate values for transparency.
    """
    income        = compute_weekly_income(avg_orders, working_hours)
    base_premium  = compute_base_premium(income["weekly_income"])
    final_premium = apply_bcr_uplift(base_premium, bcr)
    tier          = get_tier_from_premium(final_premium)
    return {
        "weekly_income":   income["weekly_income"],
        "daily_income":    income["daily_income"],
        "hourly_rate":     income["hourly_rate"],
        "working_days":    income["working_days"],
        "base_premium":    base_premium,
        "bcr_uplift":      round(final_premium / base_premium, 3) if base_premium > 0 else 1.0,
        "final_premium":   final_premium,
        "tier":            tier,
        "coverage_cap":    TIER_COVERAGE[tier],
        "triggers_active": TIER_TRIGGERS[tier],
    }


def get_tier_from_premium(premium: float) -> str:
    """Tier based on final premium. Scaled for new ₹50–₹300 range."""
    if premium <= 100: return "basic"
    if premium <= 200: return "standard"
    return "premium"


# Keep old name as alias for backward compatibility
def get_tier(premium: float) -> str:
    return get_tier_from_premium(premium)


# ── Payout calculation — Hybrid Parametric + Income ──────────────────────────

def get_lambda(bcr: float) -> float:
    """
    Lambda = income replacement ratio, shrinks as BCR rises.
    BCR <= 0.70 -> 0.60
    BCR <= 0.85 -> 0.50
    BCR < 1.00  -> 0.40
    BCR >= 1.0  -> 0.30
    """
    if bcr <= 0.70: return 0.60
    if bcr <= 0.85: return 0.50
    if bcr < 1.00:  return 0.40
    return 0.30


def compute_payout(
    hourly_rate: float,
    working_hours: float,
    loss_pct: float,
    dcs: float,
    bcr: float,
    trigger_type: str,
    coverage_cap: int,
) -> dict:
    """
    Hybrid parametric + income payout.

    Step 1: gross_loss = hourly_rate * working_hours * (loss_pct / 100)
    Step 2: effective_loss = max(0, gross_loss - 50)   [₹50 deductible]
    Step 3: lambda = f(BCR)
    Step 4: M = 0.6 + (DCS / 180)                     [DCS amplifier, max ~1.16]
    Step 5: P_income = lambda * effective_loss * M
    Step 6: P_param  = min(hourly_rate * trigger_hours, trigger_max)
    Step 7: P_final  = min(max(P_param, P_income), trigger_max, coverage_cap)
    """
    config         = TRIGGER_CONFIG.get(trigger_type, {"disruption_hours": 1.5, "max_payout": 400})
    trigger_hours  = config["disruption_hours"]
    trigger_max    = config["max_payout"]

    # Step 1
    gross_loss     = round(hourly_rate * working_hours * (loss_pct / 100), 2)

    # Step 2
    deductible     = 50.0
    effective_loss = max(0.0, gross_loss - deductible)

    # Step 3
    lam            = get_lambda(bcr)

    # Step 4
    M              = round(0.6 + (dcs / 180), 4)

    # Step 5
    p_income       = round(lam * effective_loss * M, 2)

    # Step 6
    p_param        = round(min(hourly_rate * trigger_hours, trigger_max), 2)

    # Step 7
    p_final        = round(min(max(p_param, p_income), trigger_max, coverage_cap), 2)

    return {
        "gross_loss":      gross_loss,
        "deductible":      deductible,
        "effective_loss":  effective_loss,
        "lambda":          lam,
        "M":               M,
        "p_income":        p_income,
        "p_param":         p_param,
        "payout_amount":   p_final,
        "trigger_max":     trigger_max,
        "coverage_cap":    coverage_cap,
        "trigger_hours":   trigger_hours,
        "limiting_factor": (
            "trigger_max"   if p_final >= trigger_max else
            "coverage_cap"  if p_final >= coverage_cap else
            "p_param"       if p_param >= p_income else
            "p_income"
        ),
    }


# ── Risk score ────────────────────────────────────────────────────────────────

def calculate_risk_score(zone_risk_score: int, working_hours: int, avg_orders: int) -> int:
    score = zone_risk_score
    if working_hours >= 10: score += 5
    if working_hours >= 12: score += 5
    if avg_orders >= 20:    score += 3
    if avg_orders >= 25:    score += 3
    return max(0, min(100, score))


# ── AI insight ────────────────────────────────────────────────────────────────

def get_ai_insight(zone_risk_score: int, tier: str) -> str:
    if zone_risk_score > 70:
        return "High disruption risk zone. Premium reflects elevated income-loss exposure. Stay safe."
    if zone_risk_score > 50:
        return "Moderate disruption risk. Coverage active and monitoring all 5 triggers."
    if tier == "basic":
        return "Low risk zone. Upgrade to Standard for AQI and lockdown coverage."
    return "Low risk zone. Your premium is at the minimum actuarial rate."


# ── Zone risk score from DB ───────────────────────────────────────────────────

def get_zone_risk_score(zone_id: str) -> int:
    try:
        from app.database import SessionLocal
        from app import models as _m
        db = SessionLocal()
        try:
            z = db.query(_m.Zone).filter(_m.Zone.zone_id == zone_id).first()
            return z.risk_score if z else 50
        finally:
            db.close()
    except Exception:
        return 50


# ── Razorpay ──────────────────────────────────────────────────────────────────

def _rzp():
    import razorpay
    return razorpay.Client(auth=(
        os.getenv("RAZORPAY_KEY_ID", ""),
        os.getenv("RAZORPAY_KEY_SECRET", ""),
    ))


def create_weekly_subscription(worker_id: int, weekly_premium_rupees: float) -> dict:
    try:
        client = _rzp()
        plan = client.plan.create({
            "period": "weekly", "interval": 1,
            "item": {
                "name":     f"Earniq Premium — Worker {worker_id}",
                "amount":   int(weekly_premium_rupees * 100),
                "currency": "INR",
            },
        })
        sub = client.subscription.create({
            "plan_id": plan["id"], "total_count": 52, "quantity": 1,
        })
        return {
            "subscription_id": sub["id"], "plan_id": plan["id"],
            "amount_weekly": weekly_premium_rupees, "status": sub["status"],
        }
    except Exception as e:
        logger.warning(f"Razorpay subscription failed: {e}")
        return {"subscription_id": None, "status": "mock", "amount_weekly": weekly_premium_rupees}

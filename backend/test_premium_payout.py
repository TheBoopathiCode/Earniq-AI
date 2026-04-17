"""
Test: Premium + Payout across all scenarios
"""
import sys; sys.path.insert(0, '.')
from app.services.premium_engine import (
    compute_weekly_income, compute_base_premium, apply_bcr_uplift,
    compute_final_premium, compute_payout, get_lambda, TRIGGER_CONFIG,
    TIER_COVERAGE, TIER_TRIGGERS,
)

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
errors = []

def check(label, actual, expected, tol=0.01):
    ok = abs(actual - expected) <= tol if isinstance(expected, float) else actual == expected
    status = PASS if ok else FAIL
    print(f"  {status}  {label}: got={actual!r}  expected={expected!r}")
    if not ok:
        errors.append(label)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 1. WEEKLY INCOME ===")
# 15 orders/day, 8h → 5 days → 15×5×60 = 4500
r = compute_weekly_income(15, 8)
check("15 orders 8h → weekly_income", r["weekly_income"], 4500)
check("15 orders 8h → working_days",  r["working_days"],  5)
check("15 orders 8h → daily_income",  r["daily_income"],  900)
check("15 orders 8h → hourly_rate",   r["hourly_rate"],   112)  # 900/8

# 20 orders/day, 10h → 6 days → 20×6×60 = 7200
r = compute_weekly_income(20, 10)
check("20 orders 10h → weekly_income", r["weekly_income"], 7200)
check("20 orders 10h → working_days",  r["working_days"],  6)

# 10 orders/day, 6h → 4 days → 10×4×60 = 2400
r = compute_weekly_income(10, 6)
check("10 orders 6h → weekly_income", r["weekly_income"], 2400)
check("10 orders 6h → working_days",  r["working_days"],  4)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 2. BASE PREMIUM (clamp 50–200) ===")
# 4500 × 2.5% = 112.5 → 113
check("4500 income → base_premium", compute_base_premium(4500), 113.0, tol=1)
# 7200 × 2.5% = 180
check("7200 income → base_premium", compute_base_premium(7200), 180.0, tol=1)
# 1000 × 2.5% = 25 → clamped to 50
check("1000 income → base_premium (floor)", compute_base_premium(1000), 50.0)
# 10000 × 2.5% = 250 → clamped to 200
check("10000 income → base_premium (ceil)", compute_base_premium(10000), 200.0)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 3. BCR UPLIFT ===")
# BCR 0.0 → uplift 1.0x
check("BCR 0.0 → uplift 1.0x",  apply_bcr_uplift(100, 0.0),  100.0)
check("BCR 0.70 → uplift 1.0x", apply_bcr_uplift(100, 0.70), 100.0)
# BCR 1.0 → 1 + (1.0-0.70)^1.5 = 1 + 0.30^1.5 = 1 + 0.1643 = 1.164
check("BCR 1.0 → ~116.4",       apply_bcr_uplift(100, 1.0),  116.4, tol=1)
# BCR 2.0 → 1 + (2.0-0.70)^1.5 = 1 + 1.30^1.5 = 1 + 1.482 = 2.482 (cap=3.0 not hit)
check("BCR 2.0 → ~248",          apply_bcr_uplift(100, 2.0),  248.0, tol=2)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 4. FULL PREMIUM (compute_final_premium) ===")
r = compute_final_premium(15, 8, bcr=0.0)
check("15ord 8h BCR=0 → base=113 final=113", r["final_premium"], 113.0, tol=1)
check("15ord 8h → tier basic (<=75? no, 113>75)", r["tier"], "standard")
check("15ord 8h → coverage_cap 600", r["coverage_cap"], 600)

r = compute_final_premium(20, 10, bcr=0.0)
check("20ord 10h BCR=0 → final=180", r["final_premium"], 180.0, tol=1)
check("20ord 10h → tier premium (>130)", r["tier"], "premium")
check("20ord 10h → coverage_cap 800", r["coverage_cap"], 800)

r = compute_final_premium(5, 6, bcr=0.0)
check("5ord 6h BCR=0 → floor 50", r["final_premium"], 50.0, tol=1)
check("5ord 6h → tier basic (<=75)", r["tier"], "basic")

# BCR uplift
r = compute_final_premium(15, 8, bcr=1.0)
check("15ord 8h BCR=1.0 → ~131", r["final_premium"], 131.0, tol=2)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 5. LAMBDA (BCR-driven income replacement ratio) ===")
check("BCR 0.0  → lambda 0.60", get_lambda(0.0),  0.60)
check("BCR 0.69 → lambda 0.60", get_lambda(0.69), 0.60)
check("BCR 0.70 → lambda 0.60", get_lambda(0.70), 0.60)
check("BCR 0.71 → lambda 0.50", get_lambda(0.71), 0.50)
check("BCR 0.84 → lambda 0.50", get_lambda(0.84), 0.50)
check("BCR 0.85 → lambda 0.50", get_lambda(0.85), 0.50)
check("BCR 0.86 → lambda 0.40", get_lambda(0.86), 0.40)
check("BCR 0.99 → lambda 0.40", get_lambda(0.99), 0.40)
check("BCR 1.00 → lambda 0.30", get_lambda(1.00), 0.30)
check("BCR 2.00 → lambda 0.30", get_lambda(2.00), 0.30)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 6. PAYOUT — RAIN TRIGGER ===")
# Worker: hourly_rate=112, working_hours=8, loss=67%, DCS=75, BCR=0.0
# gross_loss = 112 * 8 * 0.67 = 600.32
# effective_loss = 600.32 - 50 = 550.32
# lambda = 0.60 (BCR=0.0)
# M = 0.6 + 75/180 = 0.6 + 0.4167 = 1.0167
# P_income = 0.60 * 550.32 * 1.0167 = 335.8
# P_param = min(112 * 1.5, 400) = min(168, 400) = 168
# P_final = min(max(168, 335.8), 400, 600) = min(335.8, 400, 600) = 335.8
r = compute_payout(112, 8, 67.0, 75.0, 0.0, "rain", 600)
check("rain gross_loss",     r["gross_loss"],    600.32, tol=1)
check("rain effective_loss", r["effective_loss"], 550.32, tol=1)
check("rain lambda",         r["lambda"],         0.60)
check("rain M",              r["M"],              1.0167, tol=0.01)
check("rain p_income",       r["p_income"],       335.8, tol=2)
check("rain p_param",        r["p_param"],        168.0, tol=1)
check("rain payout",         r["payout_amount"],  335.8, tol=2)
check("rain limiting_factor", r["limiting_factor"], "p_income")

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 7. PAYOUT — LOCKDOWN (8h, high loss) ===")
# hourly=112, hours=8, loss=100%, DCS=85, BCR=0.0
# gross_loss = 112*8*1.0 = 896
# effective = 896-50 = 846
# lambda=0.60, M=0.6+85/180=1.072
# P_income = 0.60*846*1.072 = 544.2
# P_param = min(112*8, 800) = min(896, 800) = 800
# P_final = min(max(800, 544.2), 800, 800) = 800
r = compute_payout(112, 8, 100.0, 85.0, 0.0, "lockdown", 800)
check("lockdown p_param",  r["p_param"],       800.0, tol=1)
check("lockdown p_income", r["p_income"],       544.2, tol=5)
check("lockdown payout",   r["payout_amount"],  800.0, tol=1)  # capped at trigger_max
check("lockdown limiting", r["limiting_factor"], "trigger_max")

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 8. PAYOUT — HIGH BCR (BCR=0.95, lambda=0.40) ===")
# Same rain scenario but BCR=0.95
# lambda=0.40, M=1.0167
# P_income = 0.40 * 550.32 * 1.0167 = 223.9
# P_param = 168
# P_final = min(max(168, 223.9), 400, 600) = 223.9
r = compute_payout(112, 8, 67.0, 75.0, 0.95, "rain", 600)
check("high BCR lambda",   r["lambda"],        0.40)
check("high BCR p_income", r["p_income"],      223.9, tol=2)
check("high BCR payout",   r["payout_amount"], 223.9, tol=2)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 9. PAYOUT — LOW LOSS (below deductible) ===")
# loss=5%, hourly=112, hours=8
# gross_loss = 112*8*0.05 = 44.8
# effective = max(0, 44.8-50) = 0
# P_income = 0
# P_param = 168 (rain)
# P_final = min(max(168, 0), 400, 600) = 168
r = compute_payout(112, 8, 5.0, 30.0, 0.0, "rain", 600)
check("low loss effective=0",  r["effective_loss"], 0.0)
check("low loss p_income=0",   r["p_income"],       0.0)
check("low loss payout=p_param", r["payout_amount"], 168.0, tol=1)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 10. PAYOUT — COVERAGE CAP LIMITING ===")
# Basic tier worker (coverage_cap=400), lockdown
# P_param = min(112*8, 800) = 800 → but coverage_cap=400
# P_final = min(800, 800, 400) = 400
r = compute_payout(112, 8, 100.0, 85.0, 0.0, "lockdown", 400)
check("coverage cap payout=400", r["payout_amount"],  400.0, tol=1)
check("coverage cap limiting",   r["limiting_factor"], "coverage_cap")

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 11. TRIGGER CONFIG SANITY ===")
for t, cfg in TRIGGER_CONFIG.items():
    check(f"{t} has disruption_hours", "disruption_hours" in cfg, True)
    check(f"{t} has max_payout",       "max_payout" in cfg,       True)
    check(f"{t} max_payout > 0",       cfg["max_payout"] > 0,     True)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 12. TIER COVERAGE CAPS ===")
check("basic cap=400",    TIER_COVERAGE["basic"],    400)
check("standard cap=600", TIER_COVERAGE["standard"], 600)
check("premium cap=800",  TIER_COVERAGE["premium"],  800)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 13. TIER TRIGGERS ===")
check("basic has rain",         "rain" in TIER_TRIGGERS["basic"],    True)
check("basic no lockdown",      "lockdown" not in TIER_TRIGGERS["basic"], True)
check("standard has lockdown",  "lockdown" in TIER_TRIGGERS["standard"], True)
check("premium has all 6",      len(TIER_TRIGGERS["premium"]) == 6, True)

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== 14. REAL WORKER SCENARIOS ===")

scenarios = [
    {"name": "Low-income basic worker",   "orders": 8,  "hours": 6,  "bcr": 0.0,  "exp_premium": 50,  "exp_tier": "basic"},
    {"name": "Average Zomato worker",     "orders": 15, "hours": 8,  "bcr": 0.0,  "exp_premium": 113, "exp_tier": "standard"},
    {"name": "High-volume premium worker","orders": 25, "hours": 10, "bcr": 0.0,  "exp_premium": 200, "exp_tier": "premium"},
    {"name": "BCR stress (BCR=0.90)",     "orders": 15, "hours": 8,  "bcr": 0.90, "exp_premium": 120, "exp_tier": "standard"},
    {"name": "BCR crisis (BCR=1.50)",     "orders": 15, "hours": 8,  "bcr": 1.50, "exp_premium": 200, "exp_tier": "premium"},
]

for s in scenarios:
    r = compute_final_premium(s["orders"], s["hours"], s["bcr"])
    print(f"\n  [{s['name']}]")
    print(f"    orders={s['orders']} hours={s['hours']} BCR={s['bcr']}")
    print(f"    weekly_income=₹{r['weekly_income']}  base=₹{r['base_premium']}  final=₹{r['final_premium']}  tier={r['tier']}")
    check(f"  tier", r["tier"], s["exp_tier"])
    check(f"  premium in range", abs(r["final_premium"] - s["exp_premium"]) <= 15, True)

# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
if errors:
    print(f"\033[91mFAILED: {len(errors)} checks\033[0m")
    for e in errors:
        print(f"  - {e}")
else:
    print(f"\033[92mALL CHECKS PASSED\033[0m")
print("="*60)

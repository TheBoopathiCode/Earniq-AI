from app.services.claim_engine import calculate_income_values

# Verify: Rain in Velachery, Standard plan (cap 600)
result = calculate_income_values(250, 8, 67.0, "rain", 600)
print("=== Rain Velachery Standard ===")
print("Expected income:    Rs%.2f" % result["expected_income"])
print("Proportional payout:Rs%.2f" % result["proportional_loss"])
print("Trigger max:        Rs%d"   % result["trigger_max"])
print("Coverage cap:       Rs%d"   % result["coverage_cap"])
print("Final payout:       Rs%.2f" % result["payout_amount"])
print("Limiting factor:    %s"     % result["limiting_factor"])

annual_premium = 22 * 52
annual_payouts = result["payout_amount"] * 8
loss_ratio = annual_payouts / annual_premium * 100
print("\nAnnual premium (Rs22x52): Rs%d" % annual_premium)
print("Annual payouts (x8 rain): Rs%.2f" % annual_payouts)
print("Loss ratio:               %.0f%%" % loss_ratio)

print("\n=== All Triggers ===")
for trigger in ["rain", "heat", "aqi", "lockdown", "outage", "pandemic"]:
    r = calculate_income_values(250, 8, 67.0, trigger, 600)
    print("%-10s -> payout Rs%.2f (disruption %.1fh, max Rs%d)" % (
        trigger, r["payout_amount"], r["disruption_hours"], r["trigger_max"]))

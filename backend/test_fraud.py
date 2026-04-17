from app.services.fraud_engine import calculate_fraud_score, get_claim_status_from_decision

print("=== FRAUD CLAIM (should be REJECTED) ===")
fraud_signals = {"weather": 5, "aqi": 20, "traffic": 90, "govtAlert": 0, "workerIdle": 10, "bioAlert": 0, "conflict": 0, "infraOutage": 0}
result = calculate_fraud_score("rain", fraud_signals, 95.0)
print(f"Score: {result['fraud_score']} | Decision: {result['decision']} | ML used: {result['ml_used']}")
print(f"Flags: {result['flags']}")
print(f"Rule score: {result['rule_score']} | ML score: {result['ml_score']}")

print("\n=== CLEAN CLAIM (should be APPROVED) ===")
clean_signals = {"weather": 95, "aqi": 20, "traffic": 60, "govtAlert": 0, "workerIdle": 85, "bioAlert": 0, "conflict": 0, "infraOutage": 0}
result2 = calculate_fraud_score("rain", clean_signals, 67.0)
print(f"Score: {result2['fraud_score']} | Decision: {result2['decision']} | ML used: {result2['ml_used']}")
print(f"Flags: {result2['flags']}")
print(f"Rule score: {result2['rule_score']} | ML score: {result2['ml_score']}")

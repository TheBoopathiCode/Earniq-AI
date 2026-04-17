import asyncio
from app.fraud.layers.rule_checks import run_rule_checks
from app.fraud.layers.gps_validation import run_gps_validation, apply_gps_grace
from app.fraud.layers.anomaly_detection import score_anomaly, extract_features
from app.fraud.layers.syndicate_detector import check_syndicate, get_zone_history
from app.fraud.schemas import ClaimInput, FraudResult, split_flags

SCORE_APPROVE = 30
SCORE_REJECT  = 70

WORKER_MESSAGES = {
    "APPROVED": "Your claim has been verified. Payout will arrive within 90 seconds.",
    "REVIEW":   "Your claim is being verified — you won't lose your payout if everything checks out. Expected: 2 hours.",
    "REJECTED": "Your claim could not be approved. The specific signals that triggered this hold are listed above. You may submit an appeal with counter-evidence once per month.",
}


async def evaluate_claim(claim: ClaimInput, dcs_score: float = 0.0) -> FraudResult:
    """
    Orchestrates all 3 layers sequentially + syndicate in parallel.
    Target: < 2 seconds total.
    """

    # ── Layer 1 — Rules (instant, short-circuits on any failure) ─────────────
    rule_result = run_rule_checks(claim)
    if not rule_result["passed"]:
        d_flags, s_flags = split_flags([rule_result["flag"]])
        return FraudResult(
            fraud_score=100,
            status="REJECTED",
            decision_flags=d_flags,
            signal_flags=s_flags,
            layer_scores={"rules": 100, "gps": 0, "anomaly": 0},
            syndicate_alert=False,
            worker_message=WORKER_MESSAGES["REJECTED"],
        )

    # ── Layer 2 + Syndicate (run concurrently) ────────────────────────────────
    zone_history = get_zone_history(claim.claim_zone)
    gps_result, syndicate_result = await asyncio.gather(
        asyncio.to_thread(run_gps_validation, claim),
        asyncio.to_thread(check_syndicate, claim, zone_history),
    )

    # GPS grace window — suppress insufficient_zone_presence for honest workers
    if apply_gps_grace(claim, dcs_score):
        gps_result["flags"] = [
            f for f in gps_result["flags"] if f != "insufficient_zone_presence"
        ]

    fraud_score = gps_result["score"]
    all_flags   = list(gps_result["flags"])

    # ── Layer 3 — Anomaly detection (personal baseline) ──────────────────────
    claim_features       = extract_features(claim)
    anomaly_contribution = score_anomaly(claim.worker_id, claim_features)
    fraud_score         += anomaly_contribution

    # Clamp to 0–100
    fraud_score = min(max(fraud_score, 0), 100)

    # Decision
    if fraud_score < SCORE_APPROVE:
        status = "APPROVED"
    elif fraud_score < SCORE_REJECT:
        status = "REVIEW"
    else:
        status = "REJECTED"

    # Syndicate alert upgrades APPROVED → REVIEW (never directly REJECTED)
    if syndicate_result["syndicate_alert"] and status == "APPROVED":
        status    = "REVIEW"
        all_flags += syndicate_result["syndicate_flags"]

    d_flags, s_flags = split_flags(all_flags)

    return FraudResult(
        fraud_score=fraud_score,
        status=status,
        decision_flags=d_flags,
        signal_flags=s_flags,
        layer_scores={
            "rules":   0,
            "gps":     gps_result["score"],
            "anomaly": anomaly_contribution,
        },
        syndicate_alert=syndicate_result["syndicate_alert"],
        worker_message=WORKER_MESSAGES[status],
    )

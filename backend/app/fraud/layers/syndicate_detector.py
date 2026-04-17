from app.fraud.schemas import ClaimInput
from app.fraud.db_store import get_zone_baseline_rate, get_zone_claim_history
from collections import defaultdict

BURST_WINDOW_MINUTES = 15
BURST_MULTIPLIER     = 10
TEMPORAL_CLUSTER_PCT = 0.60

_zone_workers: dict[str, list] = defaultdict(list)


def _count_in_10min_windows(history: list) -> dict:
    counts: dict[str, int] = defaultdict(int)
    for c in history:
        window_key = c["timestamp"].strftime("%Y-%m-%d %H:") + str(c["timestamp"].minute // 10)
        counts[window_key] += 1
    return counts


def _shared_subnet_or_device_pattern(worker_id: str, recent: list) -> bool:
    return False  # stub — check IP subnet + device fingerprint in production


def _referral_chain_cluster(worker_id: str, recent_worker_ids: list) -> bool:
    return False  # stub — check referral graph in production


def check_syndicate(claim: ClaimInput, zone_claim_history: list) -> dict:
    """
    Runs in parallel to 3 layers.
    syndicate_alert can upgrade APPROVED → REVIEW but never directly REJECTED.
    """
    alerts = []

    # Claim velocity — burst detection
    recent = [
        c for c in zone_claim_history
        if (claim.claim_timestamp - c["timestamp"]).total_seconds() < BURST_WINDOW_MINUTES * 60
    ]
    baseline_rate = get_zone_baseline_rate(claim.claim_zone)
    burst_rate    = len(recent) / (BURST_WINDOW_MINUTES / 60)
    if burst_rate > baseline_rate * BURST_MULTIPLIER:
        alerts.append("claim_burst_detected")

    # Temporal clustering
    if zone_claim_history:
        ten_min_counts = _count_in_10min_windows(zone_claim_history)
        max_cluster    = max(ten_min_counts.values(), default=0)
        if max_cluster / max(len(zone_claim_history), 1) > TEMPORAL_CLUSTER_PCT:
            alerts.append("temporal_clustering")

    # Collective intelligence inversion
    zone_workers = _zone_workers.get(claim.claim_zone, [])
    if zone_workers:
        idle_pct   = sum(1 for w in zone_workers if w.get("status") == "idle") / len(zone_workers)
        avg_accel  = sum(w.get("avg_accel", 1.0) for w in zone_workers) / len(zone_workers)
        avg_signal = sum(w.get("network_signal_dbm", -90) for w in zone_workers) / len(zone_workers)
        if idle_pct > 0.80 and avg_accel < 0.2 and avg_signal > -80:
            alerts.append("collective_intelligence_inversion")

    if _shared_subnet_or_device_pattern(claim.worker_id, recent):
        alerts.append("device_fingerprint_cluster")

    if _referral_chain_cluster(claim.worker_id, [c["worker_id"] for c in recent]):
        alerts.append("referral_chain_cluster")

    return {"syndicate_alert": len(alerts) > 0, "syndicate_flags": alerts}


def get_zone_history(zone: str) -> list:
    return get_zone_claim_history(zone, since_minutes=60)

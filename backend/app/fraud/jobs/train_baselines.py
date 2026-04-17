"""
Weekly training job — builds one IsolationForest per worker from their
last 8 weeks of confirmed-legit claims.

Run manually:   python -m app.fraud.jobs.train_baselines
Run on schedule: add to Celery beat or cron — every Sunday 02:00 UTC
"""
from pathlib import Path
from datetime import datetime, timedelta
from app.fraud.layers.anomaly_detection import train_worker_model
from app.fraud.db_store import _worker_claim_counts

TRAINING_WEEKS  = 8
MIN_LEGIT_CLAIMS = 10


def get_legit_claims_for_worker(worker_id: str) -> list[dict]:
    """
    Pull confirmed-legit (APPROVED) claims from the last 8 weeks.
    Replace this body with a real DB query in production:
      SELECT * FROM claims
      WHERE worker_id = ? AND status = 'APPROVED'
      AND created_at > NOW() - INTERVAL 56 DAY
    """
    cutoff = datetime.utcnow() - timedelta(weeks=TRAINING_WEEKS)
    return [
        c for c in _worker_claim_counts.get(worker_id, [])
        if c.get("status") == "APPROVED" and c["timestamp"] > cutoff
    ]


def run():
    models_dir = Path(__file__).parent.parent / "layers" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    all_workers = list(_worker_claim_counts.keys())
    print(f"Training baselines for {len(all_workers)} workers...")

    trained, skipped = 0, 0
    for worker_id in all_workers:
        claims = get_legit_claims_for_worker(worker_id)
        if len(claims) < MIN_LEGIT_CLAIMS:
            print(f"  SKIP {worker_id} — only {len(claims)} legit claims (need {MIN_LEGIT_CLAIMS})")
            skipped += 1
            continue
        try:
            train_worker_model(worker_id, claims)
            print(f"  OK   {worker_id} — trained on {len(claims)} claims")
            trained += 1
        except Exception as e:
            print(f"  FAIL {worker_id} — {e}")

    print(f"\nDone. Trained: {trained}  Skipped: {skipped}")


if __name__ == "__main__":
    run()

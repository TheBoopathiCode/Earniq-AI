from app.celery_app import celery_app
import asyncio


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="app.tasks.run_bcr_update", bind=True, max_retries=3)
def run_bcr_update(self):
    """
    Celery BCR update task — runs every 5 minutes via beat schedule.
    Mirrors the asyncio bcr_update_loop for Celery worker deployments.
    Falls back to strict mode on failure (never raises past max_retries).
    """
    import logging
    logger = logging.getLogger("earniq.tasks")
    try:
        from app.database import SessionLocal
        from app.services.bcr_engine import (
            compute_global_bcr, compute_zone_bcr,
            apply_bcr_controls, persist_bcr_log,
        )
        from app.services.bcr_store import store_bcr

        db = SessionLocal()
        try:
            global_bcr    = compute_global_bcr(db)
            zone_bcr_list = compute_zone_bcr(db)
            controls      = apply_bcr_controls(global_bcr["bcr"], zone_bcr_list)
            _run(store_bcr(global_bcr, zone_bcr_list, controls))
            persist_bcr_log(db, global_bcr, controls, zone_bcr_list)
            logger.info(
                f"[CELERY BCR] bcr={global_bcr['bcr']:.4f} "
                f"status={global_bcr['status']} "
                f"controls={controls['actions']}"
            )
            return {"bcr": global_bcr["bcr"], "status": global_bcr["status"]}
        finally:
            db.close()
    except Exception as exc:
        logger.error(f"[CELERY BCR] Task failed: {exc}")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.run_disruption_monitor", bind=True, max_retries=3)
def run_disruption_monitor(self):
    try:
        from app.services.monitoring import disruption_monitor_task
        _run(disruption_monitor_task())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.run_income_tracker", bind=True, max_retries=3)
def run_income_tracker(self):
    try:
        from app.services.monitoring import income_tracker_task
        _run(income_tracker_task())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(name="app.tasks.run_syndicate_detector", bind=True, max_retries=2)
def run_syndicate_detector(self):
    from app.fraud.db_store import get_zone_claim_history
    history = get_zone_claim_history("all", since_minutes=15)
    if len(history) > 5:
        print(f"Syndicate scan: {len(history)} recent claims across zones")


@celery_app.task(name="app.tasks.run_premium_renewal", bind=True)
def run_premium_renewal(self):
    from app.services.monitoring import premium_recalculator_task
    _run(premium_recalculator_task())


@celery_app.task(name="app.tasks.run_weekly_retrain", bind=True, max_retries=1,
                 time_limit=3600, soft_time_limit=3300)
def run_weekly_retrain(self):
    """
    Weekly ML retraining task — runs every Sunday at midnight IST.
    Safe: never crashes FastAPI. Rolls back automatically on failure.
    """
    import logging
    logger = logging.getLogger("earniq.tasks")
    logger.info("[RETRAIN] Weekly ML pipeline triggered by Celery beat")
    try:
        from app.ml.train_pipeline import run_weekly_pipeline
        result = run_weekly_pipeline()   # creates its own DB session
        logger.info(f"[RETRAIN] Pipeline finished — status={result['status']}")
        return result
    except Exception as exc:
        logger.error(f"[RETRAIN] Pipeline task failed: {exc}")
        raise self.retry(exc=exc, countdown=300)  # retry once after 5 min

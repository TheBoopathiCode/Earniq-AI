"""
bcr_job.py — Background BCR update job.

Runs every 5 minutes as an asyncio task (started in main.py lifespan).
Also triggered on-demand after each new claim via trigger_bcr_update().

This is the ONLY place that calls bcr_engine compute functions.
API endpoints and the claim gate read from bcr_store — never from here directly.
"""

import asyncio
import logging
from datetime import datetime

logger = logging.getLogger("earniq.bcr_job")

BCR_UPDATE_INTERVAL = 300   # 5 minutes
_update_lock        = asyncio.Lock()
_last_run_at: str | None = None


async def _run_update() -> None:
    """Core update logic. Wrapped in lock so concurrent triggers don't double-compute."""
    global _last_run_at

    async with _update_lock:
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

            # Write to Redis + memory
            await store_bcr(global_bcr, zone_bcr_list, controls)

            # Persist snapshot to DB (non-fatal if it fails)
            persist_bcr_log(db, global_bcr, controls, zone_bcr_list)

            _last_run_at = datetime.utcnow().isoformat()

            logger.info(
                f"[BCR JOB] bcr={global_bcr['bcr']:.4f} "
                f"status={global_bcr['status']} "
                f"window={global_bcr['window_days']}d "
                f"controls={controls['actions']}"
            )

        except Exception as e:
            logger.error(f"[BCR JOB] Update failed: {e}")
        finally:
            db.close()


async def bcr_update_loop() -> None:
    """
    Infinite loop started in main.py lifespan.
    Runs immediately on startup, then every BCR_UPDATE_INTERVAL seconds.
    """
    logger.info(f"[BCR JOB] Starting — interval={BCR_UPDATE_INTERVAL}s")

    # Initial run on startup so BCR is available immediately
    await _run_update()

    while True:
        await asyncio.sleep(BCR_UPDATE_INTERVAL)
        await _run_update()


async def trigger_bcr_update() -> None:
    """
    On-demand trigger — called after a new claim is created.
    Non-blocking: fires and forgets. Lock prevents double-computation.
    """
    asyncio.create_task(_run_update())


def get_last_run_at() -> str | None:
    return _last_run_at

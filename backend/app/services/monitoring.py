"""
monitoring.py — Background Celery-compatible async tasks for Earniq AI.

Tasks:
  disruption_monitor_task()   — every 15 min: fetch live signals for all zones,
                                 update DCS + active_disruption in DB
  income_tracker_task()       — every 10 min: fetch per-worker platform order data,
                                 compute income loss, update hourly_rate baseline
  premium_recalculator_task() — Sunday 23:xx: renew all active policies
"""

import asyncio
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("earniq.monitoring")


# ── Disruption monitor ────────────────────────────────────────────────────────

async def disruption_monitor_task():
    """
    Every 15 min:
      1. Build zone list with worker_ids for platform idle sampling
      2. Fetch live signals for all zones concurrently (weather + AQI + platform + govt)
      3. Update Zone.current_dcs and Zone.active_disruption in DB
    """
    while True:
        try:
            from app.database import SessionLocal
            from app import models
            from app.services.external_api import get_live_signals_for_zones

            db = SessionLocal()
            try:
                zones = db.query(models.Zone).all()
                if not zones:
                    logger.info("disruption_monitor: no zones in DB yet")
                    await asyncio.sleep(15 * 60)
                    continue

                # Build worker_ids per zone for platform idle sampling
                workers = db.query(models.Worker).filter(models.Worker.is_active == True).all()
                zone_worker_map: dict[str, list[str]] = {}
                for w in workers:
                    zone_worker_map.setdefault(w.zone_id, []).append(str(w.id))

                zone_payloads = [
                    {
                        "zone_id":    z.zone_id,
                        "lat":        z.lat,
                        "lon":        z.lon,
                        "risk_score": z.risk_score,
                        "worker_ids": zone_worker_map.get(z.zone_id, []),
                    }
                    for z in zones
                ]

                signals_map = await get_live_signals_for_zones(zone_payloads)

                updated = 0
                for zone in zones:
                    sig = signals_map.get(zone.zone_id)
                    if sig:
                        zone.current_dcs       = sig["dcs_score"]
                        zone.active_disruption = sig["dcs_score"] >= 70
                        updated += 1

                db.commit()
                logger.info(
                    f"disruption_monitor() — updated {updated}/{len(zones)} zones "
                    f"at {datetime.utcnow().strftime('%H:%M:%S')}"
                )
                # Record last successful run for health check
                from app.cache import cache_set as _cs
                import asyncio as _a
                _a.ensure_future(_cs("last_disruption_monitor_run", datetime.utcnow().isoformat(), ttl=3600))
            finally:
                db.close()

        except Exception as e:
            logger.error(f"disruption_monitor error: {e}")

        await asyncio.sleep(15 * 60)


# ── Income tracker ────────────────────────────────────────────────────────────

async def income_tracker_task():
    """
    Every 10 min:
      1. For each active worker, fetch real order data from mock platform API
      2. Compute actual vs expected income using ML baseline
      3. Update worker.hourly_rate with latest expected baseline
      4. Log income health status (GREEN / YELLOW / RED)
    """
    while True:
        try:
            from app.database import SessionLocal
            from app import models
            from app.services.external_api import get_platform_worker_signal
            from app.ml.income_baseline import predict_expected_income

            now     = datetime.utcnow()
            hour    = now.hour
            day     = now.weekday()
            is_peak = (12 <= hour <= 14) or (19 <= hour <= 21)

            db = SessionLocal()
            try:
                workers = db.query(models.Worker).filter(models.Worker.is_active == True).all()

                async def _process_worker(w: models.Worker):
                    # Fetch real platform order data
                    platform = await get_platform_worker_signal(str(w.id), w.avg_orders)

                    # ML income baseline
                    expected_hourly = predict_expected_income(
                        worker_id=str(w.id),
                        day_of_week=day,
                        hour_of_day=hour,
                        zone_order_density=w.zone_risk_score / 100.0,
                        weather_composite_score=min(1.0, platform["loss_pct"] / 100.0),
                        is_peak_hour=is_peak,
                    )

                    loss_pct = platform["loss_pct"]

                    # Income health status
                    if loss_pct >= 40:
                        status = "RED"
                    elif loss_pct >= 20:
                        status = "YELLOW"
                    else:
                        status = "GREEN"

                    # Update hourly_rate with latest expected baseline
                    if expected_hourly > 0:
                        w.hourly_rate = max(100, min(500, int(expected_hourly)))

                    return {
                        "worker_id":      w.id,
                        "expected_hourly": expected_hourly,
                        "loss_pct":        loss_pct,
                        "status":          status,
                        "platform_status": platform["platform_status"],
                    }

                results = await asyncio.gather(
                    *[_process_worker(w) for w in workers],
                    return_exceptions=True,
                )

                db.commit()

                red_count    = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "RED")
                yellow_count = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "YELLOW")
                logger.info(
                    f"income_tracker() — {len(workers)} workers | "
                    f"RED={red_count} YELLOW={yellow_count} "
                    f"at {now.strftime('%H:%M:%S')}"
                )
            finally:
                db.close()

        except Exception as e:
            logger.error(f"income_tracker error: {e}")

        await asyncio.sleep(10 * 60)


# ── Premium recalculator ──────────────────────────────────────────────────────

async def premium_recalculator_task():
    """
    Every hour — on Sunday 23:xx: renew all active policies with BCR-adjusted premiums.
    """
    while True:
        try:
            now = datetime.utcnow()
            if now.weekday() == 6 and now.hour == 23:
                from app.database import SessionLocal
                from app import models
                from app.ml.predictor import predict_premium, get_zone_waterlogging
                from app.services.premium_engine import get_tier, TIER_COVERAGE, TIER_TRIGGERS, get_ai_insight
                from app.services.bcr_engine import get_current_bcr_controls

                db = SessionLocal()
                try:
                    _, bcr_controls = get_current_bcr_controls(db)
                    bcr_multiplier  = bcr_controls.get("premium_multiplier", 1.0)

                    workers = db.query(models.Worker).filter(models.Worker.is_active == True).all()
                    renewed = 0

                    for w in workers:
                        policy = (
                            db.query(models.Policy)
                            .filter(models.Policy.worker_id == w.id, models.Policy.is_active == True)
                            .first()
                        )
                        claims_8w = db.query(models.Claim).filter(
                            models.Claim.worker_id == w.id,
                            models.Claim.created_at >= datetime.utcnow() - timedelta(weeks=8),
                        ).count()

                        wh          = get_zone_waterlogging(w.zone_id)
                        ml_premium  = predict_premium(
                            zone_risk=w.zone_risk_score,
                            rain=0, aqi=100, traffic=5,
                            claims=claims_8w,
                            consistency=min(1.0, w.working_hours / 10.0),
                            waterlogging_history=wh,
                            forecast_rain_48h=0, forecast_aqi_48h=100,
                        )
                        new_premium = max(8, min(28, round(ml_premium * bcr_multiplier)))
                        tier        = get_tier(new_premium)

                        if policy:
                            policy.is_active = False

                        db.add(models.Policy(
                            worker_id=w.id, tier=tier,
                            weekly_premium=new_premium,
                            coverage_cap=TIER_COVERAGE[tier],
                            valid_until=datetime.utcnow() + timedelta(days=7),
                            triggers_active=TIER_TRIGGERS[tier],
                            is_active=True,
                            ai_insight=get_ai_insight(w.zone_risk_score, tier),
                            zone_multiplier=bcr_multiplier,
                            claim_factor=min(1.8, 1.0 + claims_8w * 0.1),
                            consistency_bonus=min(1.0, w.working_hours / 10.0),
                        ))
                        renewed += 1

                    db.commit()
                    logger.info(
                        f"premium_recalculator() — renewed {renewed} policies "
                        f"(BCR multiplier={bcr_multiplier}x)"
                    )
                finally:
                    db.close()

        except Exception as e:
            logger.error(f"premium_recalculator error: {e}")

        await asyncio.sleep(60 * 60)

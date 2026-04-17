from celery import Celery
from celery.schedules import crontab
import os

celery_app = Celery(
    "earniq",
    broker=os.getenv("REDIS_URL",  "redis://localhost:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    include=["app.tasks"],
)

celery_app.conf.beat_schedule = {
    "bcr-update-5min": {
        "task":     "app.tasks.run_bcr_update",
        "schedule": 60 * 5,   # every 5 minutes
    },
    "disruption-monitor-15min": {
        "task":     "app.tasks.run_disruption_monitor",
        "schedule": 60 * 15,
    },
    "income-tracker-10min": {
        "task":     "app.tasks.run_income_tracker",
        "schedule": 60 * 10,
    },
    "syndicate-detector-5min": {
        "task":     "app.tasks.run_syndicate_detector",
        "schedule": 60 * 5,
    },
    "premium-renewal-sunday-23h": {
        "task":     "app.tasks.run_premium_renewal",
        "schedule": crontab(hour=23, minute=0, day_of_week="sunday"),
    },
    "weekly-ml-retrain-sunday-midnight": {
        "task":     "app.tasks.run_weekly_retrain",
        "schedule": crontab(hour=0, minute=0, day_of_week="sunday"),
    },
}
celery_app.conf.timezone = "Asia/Kolkata"

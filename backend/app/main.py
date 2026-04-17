import asyncio
import logging
import os
import httpx
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import engine, get_db
from app import models
from app.routers import auth, zones, premium, dashboard, claims, earnings, admin, workers
from app.routers.simulation import router as simulation_router
from app.routers.policies import router as policies_router
from app.routers.admin_dashboard import router as admin_dash_router
from app.routers.appeals import router as appeals_router
from app.routers.mock_api import router as mock_router
from app.services.monitoring import disruption_monitor_task, income_tracker_task, premium_recalculator_task
from app.services.bcr_job import bcr_update_loop
from app.ml.predict_fraud import get_model
from app.cache import cache_get

# ── Structured JSON logging ───────────────────────────────────────────────────
try:
    from pythonjsonlogger import jsonlogger
    handler = logging.StreamHandler()
    handler.setFormatter(jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s"
    ))
    logging.basicConfig(level=logging.INFO, handlers=[handler])
except ImportError:
    logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)

# ── Sentry (optional — only if SENTRY_DSN is set) ────────────────────────────
try:
    import sentry_sdk
    _dsn = os.getenv("SENTRY_DSN", "")
    if _dsn:
        sentry_sdk.init(dsn=_dsn, traces_sample_rate=0.1)
        logger.info("Sentry initialised")
except ImportError:
    pass

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

models.Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    model = get_model()
    if model:
        logger.info("Fraud ML model loaded (RandomForest F1=0.9974 AUC=0.9999)")
    else:
        logger.warning("Fraud ML model not found — rules-only mode")

    try:
        from app.ml.predict_risk import predict_risk
        predict_risk({"zone_flood_history": 0.5, "zone_aqi_baseline": 100.0,
                      "zone_traffic_density": 0.5, "worker_years_active": 1.0,
                      "weekly_avg_orders": 15.0, "claim_count_8w": 0.0,
                      "platform_type": 0.0, "working_hours_per_day": 8.0})
        logger.info("XGBoost risk scorer loaded")
    except Exception as e:
        logger.warning(f"Risk scorer load failed: {e}")

    try:
        from app.ml.income_baseline import _get_cohort_model
        _get_cohort_model()
        logger.info("Income baseline cohort model loaded")
    except Exception as e:
        logger.warning(f"Income baseline load failed: {e}")

    asyncio.create_task(disruption_monitor_task())
    asyncio.create_task(income_tracker_task())
    asyncio.create_task(premium_recalculator_task())
    asyncio.create_task(bcr_update_loop())
    logger.info("Background monitoring tasks started")

    yield


app = FastAPI(title="Earniq AI API", version="3.0.0", lifespan=lifespan)

# ── Rate limiter state ────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── HTTPS redirect (production only) ─────────────────────────────────────────
if os.getenv("ENV") == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

# ── Security headers ──────────────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"]    = "nosniff"
        response.headers["X-Frame-Options"]           = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # CSP only on HTML pages — NOT on API responses (would block cross-origin fetch)
        if "text/html" in response.headers.get("content-type", ""):
            response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── GZip compression ──────────────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=500)

# ── CORS ──────────────────────────────────────────────────────────────────────
if os.getenv("ENV") == "production":
    _origins = [os.getenv("FRONTEND_URL", "https://earniq.app")]
else:
    _origins = [
        o.strip() for o in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://localhost:5174,http://localhost:3000"
        ).split(",") if o.strip()
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router,        prefix="/api/auth",      tags=["auth"])
app.include_router(zones.router,       prefix="/api/zones",     tags=["zones"])
app.include_router(premium.router,     prefix="/api/premium",   tags=["premium"])
app.include_router(dashboard.router,   prefix="/api/dashboard", tags=["dashboard"])
app.include_router(claims.router,      prefix="/api/claims",    tags=["claims"])
app.include_router(earnings.router,    prefix="/api/earnings",  tags=["earnings"])
app.include_router(admin.router,       prefix="/api/admin",     tags=["admin"])
app.include_router(admin_dash_router,  prefix="/api/admin",     tags=["admin"])
app.include_router(appeals_router,     prefix="/api/appeals",   tags=["appeals"])
app.include_router(mock_router,        prefix="/api/mock",      tags=["mock"])
app.include_router(policies_router,    prefix="/api/policies",  tags=["policies"])
app.include_router(workers.router,     prefix="/api/workers",   tags=["workers"])
app.include_router(simulation_router,  prefix="/api/simulation", tags=["simulation"])


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/dashboard/{worker_id}")
async def dashboard_ws(websocket: WebSocket, worker_id: int):
    await websocket.accept()
    try:
        while True:
            data = await cache_get(f"dashboard:{worker_id}")
            if data:
                data["from_cache"] = True
                await websocket.send_json(data)
            else:
                await websocket.send_json({"status": "no_data", "worker_id": worker_id})
            await asyncio.sleep(15)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WS error worker {worker_id}: {e}")


# ── Root ──────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "Earniq AI API v3.0 running", "docs": "/docs"}


# ── Health (full dependency check) ───────────────────────────────────────────
@app.get("/health")
def health(db: Session = Depends(get_db)):
    checks: dict = {}

    # Database
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "healthy"
    except Exception:
        checks["database"] = "down"

    # Redis
    try:
        import redis as _redis
        _redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0")).ping()
        checks["redis"] = "healthy"
    except Exception:
        checks["redis"] = "down"

    # External weather API
    try:
        httpx.get(
            "https://api.open-meteo.com/v1/forecast?latitude=12.9&longitude=80.2",
            timeout=3.0
        )
        checks["weather_api"] = "healthy"
    except Exception:
        checks["weather_api"] = "down"

    # ML model
    checks["fraud_model"] = "loaded" if get_model() is not None else "rules-only"

    overall = "healthy" if all(v in ("healthy", "loaded") for v in checks.values()) else "degraded"
    return {"status": overall, "checks": checks, "timestamp": datetime.utcnow().isoformat()}


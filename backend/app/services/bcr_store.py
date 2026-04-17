"""
bcr_store.py — Precomputed BCR cache.

Write path: bcr_job.py (background, every 5 min)
Read path:  API endpoints + claim safety gate

Redis primary → in-memory fallback (never None — always returns strict-mode default).
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger("earniq.bcr_store")

# ── In-memory fallback (used when Redis is unavailable) ───────────────────────
# Strict-mode defaults — safe to use when real BCR is unknown.
_STRICT_DEFAULT: dict = {
    "bcr":             0.91,
    "status":          "danger",
    "total_claims":    0.0,
    "earned_premium":  0.0,
    "active_policies": 0,
    "window_days":     14,
    "controls": {
        "premium_multiplier":       1.14,
        "strict_fraud_checks":      True,
        "auto_approval_enabled":    False,
        "manual_review_high_value": True,
        "auto_payout_enabled":      False,
        "new_enrollment_suspended": False,
        "actions":                  ["strict_mode_fallback"],
        "zone_controls":            [],
    },
    "zone_bcr":    [],
    "computed_at": None,
    "_stale":      True,
    "_source":     "default",
}

_memory_store: dict = {}

CACHE_KEY_GLOBAL = "bcr:global"
CACHE_KEY_ZONES  = "bcr:zones"
CACHE_TTL        = 600   # 10 minutes — job runs every 5 min, so max staleness is 10 min


# ── Write ─────────────────────────────────────────────────────────────────────

async def store_bcr(global_bcr: dict, zone_bcr: list[dict], controls: dict) -> None:
    """Called exclusively by bcr_job after a successful computation."""
    from app.cache import cache_set

    payload = {
        **global_bcr,
        "controls":    controls,
        "zone_bcr":    zone_bcr,
        "_stale":      False,
        "_source":     "computed",
    }

    # Write to Redis
    await cache_set(CACHE_KEY_GLOBAL, payload, ttl=CACHE_TTL)
    await cache_set(CACHE_KEY_ZONES,  zone_bcr,  ttl=CACHE_TTL)

    # Always mirror to memory (Redis-independent reads)
    _memory_store["global"] = payload
    _memory_store["zones"]  = zone_bcr
    _memory_store["ts"]     = datetime.utcnow().isoformat()

    logger.info(
        f"BCR stored — bcr={global_bcr['bcr']:.4f} "
        f"status={global_bcr['status']} "
        f"controls={controls['actions']}"
    )


# ── Read ──────────────────────────────────────────────────────────────────────

async def read_bcr() -> dict:
    """
    Returns precomputed BCR. Never recomputes. Never raises.
    Priority: Redis → in-memory → strict default.
    """
    from app.cache import cache_get

    # 1. Redis
    try:
        cached = await cache_get(CACHE_KEY_GLOBAL)
        if cached:
            return cached
    except Exception as e:
        logger.warning(f"Redis BCR read failed: {e}")

    # 2. In-memory mirror
    if _memory_store.get("global"):
        result = dict(_memory_store["global"])
        result["_source"] = "memory"
        return result

    # 3. Strict default — system state unknown, never allow auto payouts
    logger.warning("BCR unavailable — returning strict-mode default")
    return dict(_STRICT_DEFAULT)


async def read_zone_bcr() -> list[dict]:
    """Returns precomputed zone BCR list. Never recomputes."""
    from app.cache import cache_get

    try:
        cached = await cache_get(CACHE_KEY_ZONES)
        if cached:
            return cached
    except Exception:
        pass

    if _memory_store.get("zones"):
        return _memory_store["zones"]

    return []


def read_bcr_sync() -> dict:
    """
    Synchronous read for use in non-async contexts (claim gate, Celery tasks).
    Reads from in-memory mirror only — no Redis I/O.
    """
    if _memory_store.get("global"):
        result = dict(_memory_store["global"])
        result["_source"] = "memory_sync"
        return result
    return dict(_STRICT_DEFAULT)


def get_cached_controls() -> dict:
    """Returns just the controls dict from cached BCR. Safe for claim gate."""
    bcr_data = read_bcr_sync()
    return bcr_data.get("controls", _STRICT_DEFAULT["controls"])


def get_cached_bcr_value() -> float:
    """Returns just the BCR float. Used by claim gate for fast checks."""
    return read_bcr_sync().get("bcr", 0.91)

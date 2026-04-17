import json
import os
from typing import Any

_redis = None


async def get_redis():
    global _redis
    if _redis is None:
        try:
            import redis.asyncio as aioredis
            _redis = aioredis.from_url(
                os.getenv("REDIS_URL", "redis://localhost:6379/0"),
                decode_responses=True,
            )
        except Exception as e:
            print(f"Redis unavailable: {e}")
            return None
    return _redis


async def cache_set(key: str, value: Any, ttl: int = 900):
    try:
        r = await get_redis()
        if r:
            await r.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        print(f"Cache write failed ({key}): {e}")


async def cache_get(key: str) -> Any | None:
    try:
        r = await get_redis()
        if not r:
            return None
        val = await r.get(key)
        return json.loads(val) if val else None
    except Exception as e:
        print(f"Cache read failed ({key}): {e}")
        return None

import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from app.database import get_db
from app import models
from app.services.external_api import get_live_signals, get_live_signals_for_zones
from app.services.dcs_engine import get_background_dcs

router  = APIRouter()
limiter = Limiter(key_func=get_remote_address)
logger  = logging.getLogger("earniq.zones")

# In-process cache — last known good response, survives DB blips
_last_known_zones: list[dict] = []


def _fmt(zone: models.Zone, dcs: float | None = None, active: bool | None = None) -> dict:
    live_dcs    = dcs    if dcs    is not None else (zone.current_dcs or 0.0)
    live_active = active if active is not None else (zone.active_disruption or False)
    # Always return a usable DCS — never 0 if we have risk_score
    if live_dcs == 0.0 and zone.risk_score:
        live_dcs = get_background_dcs(zone.risk_score)["dcs"]
    return {
        "id":               zone.zone_id,
        "name":             zone.zone_name,
        "city":             zone.city,
        "riskScore":        zone.risk_score,
        "lat":              zone.lat,
        "lon":              zone.lon,
        "currentDcs":       round(live_dcs, 1),
        "activeDisruption": live_active,
    }


@router.get("")
@limiter.limit("60/minute")
def get_all_zones(request: Request, db: Session = Depends(get_db)):
    global _last_known_zones
    try:
        zones = db.query(models.Zone).order_by(models.Zone.city, models.Zone.zone_name).all()
        if not zones:
            logger.warning("zones table is empty — returning last known cache")
            return _last_known_zones or []
        result = [_fmt(z) for z in zones]
        logger.debug(f"zones returned: {len(result)}")
        _last_known_zones = result  # update in-process cache
        return result
    except Exception as e:
        logger.error(f"zones DB query failed: {e} — returning last known cache")
        return _last_known_zones or []


@router.get("/{zone_id}")
def get_zone(zone_id: str, db: Session = Depends(get_db)):
    zone = db.query(models.Zone).filter(models.Zone.zone_id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return _fmt(zone)


@router.get("/{zone_id}/live")
async def get_zone_live(zone_id: str, db: Session = Depends(get_db)):
    zone = db.query(models.Zone).filter(models.Zone.zone_id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    worker_ids = [
        str(w.id) for w in db.query(models.Worker).filter(
            models.Worker.zone_id == zone_id, models.Worker.is_active == True
        ).all()
    ]
    signals = await get_live_signals(
        lat=zone.lat, lon=zone.lon,
        zone_risk=zone.risk_score,
        zone_id=zone_id,
        worker_ids=worker_ids,
    )
    return {
        **_fmt(zone, signals["dcs_score"], signals["dcs_score"] >= 70),
        "signals":         signals,
        "workers_sampled": len(worker_ids),
    }


@router.get("/city/{city}/live")
async def get_city_zones_live(city: str, db: Session = Depends(get_db)):
    zones = db.query(models.Zone).filter(models.Zone.city == city.lower()).all()
    if not zones:
        raise HTTPException(status_code=404, detail=f"No zones found for city '{city}'")

    workers = db.query(models.Worker).filter(
        models.Worker.city == city.lower(), models.Worker.is_active == True
    ).all()
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

    result = []
    for z in zones:
        sig = signals_map.get(z.zone_id, {})
        dcs = sig.get("dcs_score", z.current_dcs or 0.0)
        result.append({
            **_fmt(z, dcs, dcs >= 70),
            "signals":         sig,
            "workers_in_zone": len(zone_worker_map.get(z.zone_id, [])),
        })
    return sorted(result, key=lambda x: x["currentDcs"], reverse=True)

from fastapi import APIRouter, HTTPException
from app.routers.auth import ALL_ZONES
from app.services.external_api import get_live_signals

router = APIRouter()

def format_zone(zone_id: str, data: dict, current_dcs: float = 0, active_disruption: bool = False) -> dict:
    return {
        "id": zone_id,
        "name": data["name"],
        "city": data["city"],
        "riskScore": data["risk_score"],
        "lat": data["lat"],
        "lon": data["lon"],
        "currentDcs": current_dcs,
        "activeDisruption": active_disruption
    }

@router.get("")
def get_all_zones():
    return [format_zone(zid, zdata) for zid, zdata in ALL_ZONES.items()]

@router.get("/{zone_id}")
def get_zone(zone_id: str):
    zone_data = ALL_ZONES.get(zone_id)
    if not zone_data:
        raise HTTPException(status_code=404, detail="Zone not found")
    return format_zone(zone_id, zone_data)

@router.get("/{zone_id}/live")
async def get_zone_live(zone_id: str):
    zone_data = ALL_ZONES.get(zone_id)
    if not zone_data:
        raise HTTPException(status_code=404, detail="Zone not found")
    signals = await get_live_signals(zone_data["lat"], zone_data["lon"], zone_data["risk_score"])
    return {
        **format_zone(zone_id, zone_data, signals["dcs_score"], signals["dcs_score"] >= 70),
        "signals": signals
    }

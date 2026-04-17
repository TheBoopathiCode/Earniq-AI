import sys; sys.path.insert(0,'.')
from app.database import SessionLocal
from app import models
db = SessionLocal()
zones = db.query(models.Zone).all()
print(f"Total zones in DB: {len(zones)}")
for z in zones[:5]:
    print(f"  {z.zone_id}: {z.zone_name} | risk={z.risk_score} | wl={z.waterlogging_freq} | aqi={z.aqi_baseline_annual} | dcs={z.current_dcs}")
db.close()

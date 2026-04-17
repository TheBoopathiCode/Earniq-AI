import sys; sys.path.insert(0,'.')
from app.database import SessionLocal
from app import models
db = SessionLocal()
zones = db.query(models.Zone).all()
cities = set(z.city for z in zones)
print('cities in DB:', cities)
for z in zones[:3]:
    print(f'  zone_id={z.zone_id!r} city={z.city!r} name={z.zone_name!r}')
db.close()

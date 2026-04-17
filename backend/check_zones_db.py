import sys; sys.path.insert(0,'.')
from app.database import SessionLocal
from app import models
db = SessionLocal()
count = db.query(models.Zone).count()
print('zones in DB:', count)
if count > 0:
    for z in db.query(models.Zone).limit(3).all():
        print(f'  {z.zone_id} | {z.zone_name} | {z.city} | risk={z.risk_score} | dcs={z.current_dcs}')
else:
    print('  DB is EMPTY — zones table has no rows')
db.close()

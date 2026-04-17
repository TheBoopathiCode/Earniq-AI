import sys; sys.path.insert(0,'.')
from app.database import SessionLocal
from app import models
db = SessionLocal()
workers = db.query(models.Worker).all()
for w in workers:
    print(f'id={w.id} city={w.city!r} zone_id={w.zone_id!r}')
db.close()

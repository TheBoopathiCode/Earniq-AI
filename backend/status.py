import sys; sys.path.insert(0,'.')
from app.database import SessionLocal
from app import models
db = SessionLocal()
print(f"workers:         {db.query(models.Worker).count()}")
print(f"active_policies: {db.query(models.Policy).filter(models.Policy.is_active==True).count()}")
print(f"claims:          {db.query(models.Claim).count()}")
print(f"zones:           {db.query(models.Zone).count()}")
db.close()

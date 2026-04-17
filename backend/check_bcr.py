import sys; sys.path.insert(0,'.')
from app.database import SessionLocal
from app import models
from app.services.bcr_engine import compute_global_bcr, apply_bcr_controls, compute_zone_bcr
from app.services.bcr_store import get_cached_bcr_value, get_cached_controls
import asyncio

db = SessionLocal()

# Live DB computation
bcr = compute_global_bcr(db)
zone_bcr = compute_zone_bcr(db)
controls = apply_bcr_controls(bcr['bcr'], zone_bcr)

print(f"=== BCR STATE ===")
print(f"BCR value:              {bcr['bcr']}")
print(f"BCR status:             {bcr['status']}")
print(f"total_claims paid:      {bcr['total_claims']}")
print(f"earned_premium:         {bcr['earned_premium']}")
print(f"active_policies:        {bcr['active_policies']}")
print(f"new_enrollment_suspended: {controls['new_enrollment_suspended']}")
print(f"actions:                {controls['actions']}")
print()

# Raw DB counts
workers  = db.query(models.Worker).count()
policies = db.query(models.Policy).filter(models.Policy.is_active==True).count()
claims   = db.query(models.Claim).count()
paid     = db.query(models.Claim).filter(models.Claim.status=='paid').count()
from sqlalchemy import func
total_payout = db.query(func.sum(models.Claim.payout_amount)).filter(models.Claim.status=='paid').scalar() or 0
total_premium = db.query(func.sum(models.Policy.weekly_premium)).filter(models.Policy.is_active==True).scalar() or 0

print(f"=== DB COUNTS ===")
print(f"workers:        {workers}")
print(f"active_policies:{policies}")
print(f"total_claims:   {claims}")
print(f"paid_claims:    {paid}")
print(f"total_payout:   {total_payout}")
print(f"total_premium:  {total_premium}")

db.close()

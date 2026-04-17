import sys; sys.path.insert(0,'.')
from app.database import SessionLocal
from app import models
from app.services.bcr_engine import compute_global_bcr, apply_bcr_controls, compute_zone_bcr

db = SessionLocal()

# Reset all paid claims to approved (keeps claim history, removes payout from BCR window)
paid = db.query(models.Claim).filter(models.Claim.status == 'paid').all()
print(f"Resetting {len(paid)} paid claims to 'approved' for BCR reset...")
for c in paid:
    c.status     = 'approved'
    c.paid_at    = None
    c.payout_amount = None
    c.utr        = None
db.commit()

# Verify new BCR
bcr      = compute_global_bcr(db)
zone_bcr = compute_zone_bcr(db)
controls = apply_bcr_controls(bcr['bcr'], zone_bcr)

print(f"New BCR:    {bcr['bcr']} ({bcr['status']})")
print(f"Enrollment suspended: {controls['new_enrollment_suspended']}")
db.close()

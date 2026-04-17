import sys; sys.path.insert(0,'.')
import asyncio
from app.services.bcr_store import store_bcr
from app.services.bcr_engine import compute_global_bcr, apply_bcr_controls, compute_zone_bcr
from app.database import SessionLocal

async def main():
    db = SessionLocal()
    bcr      = compute_global_bcr(db)
    zone_bcr = compute_zone_bcr(db)
    controls = apply_bcr_controls(bcr['bcr'], zone_bcr)
    db.close()
    await store_bcr(bcr, zone_bcr, controls)
    print(f"BCR cache updated: {bcr['bcr']} ({bcr['status']})")
    print(f"Enrollment suspended: {controls['new_enrollment_suspended']}")

asyncio.run(main())

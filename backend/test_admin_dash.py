import sys, traceback
sys.path.insert(0, '.')
try:
    from app.routers.admin_dashboard import router
    print("admin_dashboard import OK")
except Exception as e:
    traceback.print_exc()

try:
    from app.routers.admin import router as r2
    print("admin import OK")
except Exception as e:
    traceback.print_exc()

# Test the actual endpoint logic
try:
    from app.database import SessionLocal
    from app.routers.admin_dashboard import _zones_dcs, _forecast, _loss_ratio_weeks
    db = SessionLocal()
    print("zones_dcs:", len(_zones_dcs(db)))
    print("forecast keys:", list(_forecast(db).keys()))
    print("loss_weeks:", len(_loss_ratio_weeks(db)))
    db.close()
    print("All helpers OK")
except Exception as e:
    traceback.print_exc()

import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app.database import engine, SessionLocal
from app import models
from app.services.dcs_engine import get_background_dcs

print("Creating tables...")
models.Base.metadata.create_all(bind=engine)
print("All tables created OK")

# ── Zone seed data — single source of truth ───────────────────────────────────
# All zone data lives here and is written to DB on first run.
# After seeding, ALL backend code reads from DB only — no dicts anywhere.
ZONE_SEED = [
    # Chennai
    {"zone_id": "ch-vel", "zone_name": "Velachery",       "city": "chennai",   "risk_score": 75, "lat": 12.9815, "lon": 80.2180, "waterlogging_freq": 0.72, "aqi_baseline_annual": 85,  "heat_days_per_year": 12, "traffic_density": 0.68, "govt_alert_freq": 0.15},
    {"zone_id": "ch-tam", "zone_name": "Tambaram",        "city": "chennai",   "risk_score": 82, "lat": 12.9249, "lon": 80.1000, "waterlogging_freq": 0.81, "aqi_baseline_annual": 78,  "heat_days_per_year": 10, "traffic_density": 0.55, "govt_alert_freq": 0.12},
    {"zone_id": "ch-omr", "zone_name": "OMR",             "city": "chennai",   "risk_score": 18, "lat": 12.9063, "lon": 80.2270, "waterlogging_freq": 0.12, "aqi_baseline_annual": 62,  "heat_days_per_year": 8,  "traffic_density": 0.45, "govt_alert_freq": 0.05},
    {"zone_id": "ch-ana", "zone_name": "Anna Nagar",      "city": "chennai",   "risk_score": 32, "lat": 13.0850, "lon": 80.2101, "waterlogging_freq": 0.28, "aqi_baseline_annual": 72,  "heat_days_per_year": 10, "traffic_density": 0.62, "govt_alert_freq": 0.08},
    {"zone_id": "ch-tna", "zone_name": "T. Nagar",        "city": "chennai",   "risk_score": 45, "lat": 13.0418, "lon": 80.2341, "waterlogging_freq": 0.42, "aqi_baseline_annual": 88,  "heat_days_per_year": 14, "traffic_density": 0.78, "govt_alert_freq": 0.10},
    # Delhi
    {"zone_id": "dl-dwk", "zone_name": "Dwarka",          "city": "delhi",     "risk_score": 68, "lat": 28.5921, "lon": 77.0460, "waterlogging_freq": 0.35, "aqi_baseline_annual": 285, "heat_days_per_year": 45, "traffic_density": 0.72, "govt_alert_freq": 0.18},
    {"zone_id": "dl-ito", "zone_name": "ITO",             "city": "delhi",     "risk_score": 85, "lat": 28.6289, "lon": 77.2405, "waterlogging_freq": 0.45, "aqi_baseline_annual": 340, "heat_days_per_year": 52, "traffic_density": 0.88, "govt_alert_freq": 0.25},
    {"zone_id": "dl-sdl", "zone_name": "South Delhi",     "city": "delhi",     "risk_score": 28, "lat": 28.5245, "lon": 77.2066, "waterlogging_freq": 0.18, "aqi_baseline_annual": 220, "heat_days_per_year": 40, "traffic_density": 0.55, "govt_alert_freq": 0.12},
    {"zone_id": "dl-cp",  "zone_name": "Connaught Place", "city": "delhi",     "risk_score": 52, "lat": 28.6315, "lon": 77.2167, "waterlogging_freq": 0.30, "aqi_baseline_annual": 295, "heat_days_per_year": 48, "traffic_density": 0.85, "govt_alert_freq": 0.20},
    {"zone_id": "dl-noi", "zone_name": "Noida Sector 62", "city": "delhi",     "risk_score": 15, "lat": 28.6208, "lon": 77.3633, "waterlogging_freq": 0.10, "aqi_baseline_annual": 195, "heat_days_per_year": 38, "traffic_density": 0.42, "govt_alert_freq": 0.08},
    # Mumbai
    {"zone_id": "mb-krl", "zone_name": "Kurla",           "city": "mumbai",    "risk_score": 72, "lat": 19.0726, "lon": 72.8845, "waterlogging_freq": 0.68, "aqi_baseline_annual": 145, "heat_days_per_year": 5,  "traffic_density": 0.82, "govt_alert_freq": 0.12},
    {"zone_id": "mb-drv", "zone_name": "Dharavi",         "city": "mumbai",    "risk_score": 88, "lat": 19.0430, "lon": 72.8554, "waterlogging_freq": 0.88, "aqi_baseline_annual": 165, "heat_days_per_year": 4,  "traffic_density": 0.75, "govt_alert_freq": 0.10},
    {"zone_id": "mb-bnd", "zone_name": "Bandra",          "city": "mumbai",    "risk_score": 48, "lat": 19.0596, "lon": 72.8295, "waterlogging_freq": 0.40, "aqi_baseline_annual": 125, "heat_days_per_year": 3,  "traffic_density": 0.70, "govt_alert_freq": 0.08},
    {"zone_id": "mb-sio", "zone_name": "Sion",            "city": "mumbai",    "risk_score": 65, "lat": 19.0429, "lon": 72.8620, "waterlogging_freq": 0.62, "aqi_baseline_annual": 155, "heat_days_per_year": 4,  "traffic_density": 0.78, "govt_alert_freq": 0.10},
    {"zone_id": "mb-anr", "zone_name": "Andheri",         "city": "mumbai",    "risk_score": 35, "lat": 19.1136, "lon": 72.8697, "waterlogging_freq": 0.30, "aqi_baseline_annual": 118, "heat_days_per_year": 3,  "traffic_density": 0.65, "govt_alert_freq": 0.07},
    # Hyderabad
    {"zone_id": "hyd-lbn","zone_name": "LB Nagar",        "city": "hyderabad", "risk_score": 70, "lat": 17.3482, "lon": 78.5514, "waterlogging_freq": 0.55, "aqi_baseline_annual": 115, "heat_days_per_year": 35, "traffic_density": 0.65, "govt_alert_freq": 0.10},
    {"zone_id": "hyd-nar","zone_name": "Narayanguda",     "city": "hyderabad", "risk_score": 62, "lat": 17.3912, "lon": 78.4818, "waterlogging_freq": 0.48, "aqi_baseline_annual": 108, "heat_days_per_year": 38, "traffic_density": 0.72, "govt_alert_freq": 0.12},
    {"zone_id": "hyd-wht","zone_name": "Whitefield",      "city": "hyderabad", "risk_score": 12, "lat": 17.4467, "lon": 78.3800, "waterlogging_freq": 0.08, "aqi_baseline_annual": 72,  "heat_days_per_year": 28, "traffic_density": 0.38, "govt_alert_freq": 0.05},
    {"zone_id": "hyd-ban","zone_name": "Banjara Hills",   "city": "hyderabad", "risk_score": 25, "lat": 17.4156, "lon": 78.4386, "waterlogging_freq": 0.15, "aqi_baseline_annual": 82,  "heat_days_per_year": 32, "traffic_density": 0.48, "govt_alert_freq": 0.06},
    {"zone_id": "hyd-sec","zone_name": "Secunderabad",    "city": "hyderabad", "risk_score": 42, "lat": 17.4399, "lon": 78.4983, "waterlogging_freq": 0.35, "aqi_baseline_annual": 98,  "heat_days_per_year": 36, "traffic_density": 0.60, "govt_alert_freq": 0.10},
    # Kolkata
    {"zone_id": "kol-slt","zone_name": "Salt Lake",       "city": "kolkata",   "risk_score": 22, "lat": 22.5800, "lon": 88.4116, "waterlogging_freq": 0.18, "aqi_baseline_annual": 135, "heat_days_per_year": 20, "traffic_density": 0.50, "govt_alert_freq": 0.20},
    {"zone_id": "kol-how","zone_name": "Howrah",          "city": "kolkata",   "risk_score": 58, "lat": 22.5958, "lon": 88.2636, "waterlogging_freq": 0.52, "aqi_baseline_annual": 158, "heat_days_per_year": 22, "traffic_density": 0.72, "govt_alert_freq": 0.28},
    {"zone_id": "kol-gar","zone_name": "Gariahat",        "city": "kolkata",   "risk_score": 38, "lat": 22.5206, "lon": 88.3644, "waterlogging_freq": 0.32, "aqi_baseline_annual": 142, "heat_days_per_year": 18, "traffic_density": 0.62, "govt_alert_freq": 0.18},
    {"zone_id": "kol-dum","zone_name": "Dum Dum",         "city": "kolkata",   "risk_score": 55, "lat": 22.6218, "lon": 88.4271, "waterlogging_freq": 0.45, "aqi_baseline_annual": 152, "heat_days_per_year": 20, "traffic_density": 0.58, "govt_alert_freq": 0.22},
    {"zone_id": "kol-new","zone_name": "New Town",        "city": "kolkata",   "risk_score": 15, "lat": 22.5806, "lon": 88.4769, "waterlogging_freq": 0.10, "aqi_baseline_annual": 118, "heat_days_per_year": 16, "traffic_density": 0.40, "govt_alert_freq": 0.12},
]

db = SessionLocal()
try:
    seeded = updated = 0
    for z in ZONE_SEED:
        bg = get_background_dcs(z["risk_score"])
        existing = db.query(models.Zone).filter(models.Zone.zone_id == z["zone_id"]).first()
        if existing:
            # Update ML feature columns on existing rows (idempotent)
            existing.waterlogging_freq    = z["waterlogging_freq"]
            existing.aqi_baseline_annual  = z["aqi_baseline_annual"]
            existing.heat_days_per_year   = z["heat_days_per_year"]
            existing.traffic_density      = z["traffic_density"]
            existing.govt_alert_freq      = z["govt_alert_freq"]
            updated += 1
        else:
            db.add(models.Zone(
                zone_id=z["zone_id"], zone_name=z["zone_name"],
                city=z["city"], risk_score=z["risk_score"],
                lat=z["lat"], lon=z["lon"],
                current_dcs=bg["dcs"], active_disruption=bg["dcs"] >= 70,
                waterlogging_freq=z["waterlogging_freq"],
                aqi_baseline_annual=z["aqi_baseline_annual"],
                heat_days_per_year=z["heat_days_per_year"],
                traffic_density=z["traffic_density"],
                govt_alert_freq=z["govt_alert_freq"],
            ))
            seeded += 1
    db.commit()
    print(f"Zones: {seeded} seeded, {updated} updated")
finally:
    db.close()

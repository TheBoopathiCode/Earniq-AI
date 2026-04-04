from app.database import SessionLocal, engine
from app import models

models.Base.metadata.create_all(bind=engine)

ZONES = [
    ("ch-vel",  "Velachery",       "chennai",   75, 12.9815, 80.2180),
    ("ch-tam",  "Tambaram",        "chennai",   82, 12.9249, 80.1000),
    ("ch-omr",  "OMR",             "chennai",   18, 12.9063, 80.2270),
    ("ch-ana",  "Anna Nagar",      "chennai",   32, 13.0850, 80.2101),
    ("ch-tna",  "T. Nagar",        "chennai",   45, 13.0418, 80.2341),
    ("dl-dwk",  "Dwarka",          "delhi",     68, 28.5921, 77.0460),
    ("dl-ito",  "ITO",             "delhi",     85, 28.6289, 77.2405),
    ("dl-sdl",  "South Delhi",     "delhi",     28, 28.5245, 77.2066),
    ("dl-cp",   "Connaught Place", "delhi",     52, 28.6315, 77.2167),
    ("dl-noi",  "Noida Sector 62", "delhi",     15, 28.6208, 77.3633),
    ("mb-krl",  "Kurla",           "mumbai",    72, 19.0726, 72.8845),
    ("mb-drv",  "Dharavi",         "mumbai",    88, 19.0430, 72.8554),
    ("mb-bnd",  "Bandra",          "mumbai",    48, 19.0596, 72.8295),
    ("mb-sio",  "Sion",            "mumbai",    65, 19.0429, 72.8620),
    ("mb-anr",  "Andheri",         "mumbai",    35, 19.1136, 72.8697),
    ("hyd-lbn", "LB Nagar",        "hyderabad", 70, 17.3482, 78.5514),
    ("hyd-nar", "Narayanguda",     "hyderabad", 62, 17.3912, 78.4818),
    ("hyd-wht", "Whitefield",      "hyderabad", 12, 17.4467, 78.3800),
    ("hyd-ban", "Banjara Hills",   "hyderabad", 25, 17.4156, 78.4386),
    ("hyd-sec", "Secunderabad",    "hyderabad", 42, 17.4399, 78.4983),
    ("kol-slt", "Salt Lake",       "kolkata",   22, 22.5800, 88.4116),
    ("kol-how", "Howrah",          "kolkata",   58, 22.5958, 88.2636),
    ("kol-gar", "Gariahat",        "kolkata",   38, 22.5206, 88.3644),
    ("kol-dum", "Dum Dum",         "kolkata",   55, 22.6218, 88.4271),
    ("kol-new", "New Town",        "kolkata",   15, 22.5806, 88.4769),
]

def seed():
    db = SessionLocal()
    try:
        if db.query(models.Zone).count() == 0:
            for zid, name, city, risk, lat, lon in ZONES:
                db.add(models.Zone(
                    zone_id=zid, zone_name=name, city=city,
                    risk_score=risk, lat=lat, lon=lon,
                    current_dcs=round(risk * 0.3, 1),
                    active_disruption=False,
                ))
            db.commit()
            print("Seeded %d zones successfully" % len(ZONES))
        else:
            print("Zones already seeded")
    finally:
        db.close()

if __name__ == "__main__":
    seed()

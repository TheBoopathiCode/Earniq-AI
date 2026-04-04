from app.ml.predictor import predict_premium, predict_coverage_hours, get_zone_waterlogging

print("=== Waterlogging Discount Test ===")
safe  = predict_premium(18, waterlogging_history=15)   # OMR - safe zone
risky = predict_premium(18, waterlogging_history=50)   # same zone, no discount
print("OMR with low waterlogging (15): Rs%.2f" % safe)
print("OMR with avg waterlogging (50): Rs%.2f" % risky)
print("Discount applied: Rs%.2f" % (risky - safe))

print("\n=== Coverage Hours Test ===")
c1 = predict_coverage_hours(50, forecast_rain_48h=0,  forecast_aqi_48h=80,  waterlogging_history=40)
c2 = predict_coverage_hours(50, forecast_rain_48h=20, forecast_aqi_48h=80,  waterlogging_history=40)
c3 = predict_coverage_hours(50, forecast_rain_48h=80, forecast_aqi_48h=100, waterlogging_history=40)
print("No forecast:          %dh" % c1)
print("Moderate rain (20mm): %dh" % c2)
print("Heavy rain (80mm):    %dh" % c3)

print("\n=== Zone Waterlogging Values ===")
for zone_id in ["ch-omr", "ch-vel", "ch-tam", "mb-drv", "kol-slt"]:
    wl = get_zone_waterlogging(zone_id)
    discount = wl < 20
    print("  %s: waterlogging=%d  discount=%s" % (zone_id, wl, "YES -Rs2" if discount else "NO"))

print("\n=== Register Flow Simulation ===")
# Simulates what happens when a worker registers in OMR vs Tambaram
for zone_id, zone_risk in [("ch-omr", 18), ("ch-tam", 82)]:
    wl = get_zone_waterlogging(zone_id)
    p  = predict_premium(zone_risk, waterlogging_history=wl, consistency=0.8)
    c  = predict_coverage_hours(zone_risk, waterlogging_history=wl)
    print("  %s -> Rs%.2f/week | %dh coverage | waterlogging=%d | discount=%s" % (
        zone_id, p, c, wl, "YES" if wl < 20 else "NO"))

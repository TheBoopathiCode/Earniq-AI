from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database import get_db
from app import models
from app.auth import get_current_worker

router = APIRouter()


@router.get("/{worker_id}/notifications")
def get_worker_notifications(
    worker_id: int,
    db: Session = Depends(get_db),
):
    """
    Returns real notifications derived from DB state.
    Each event type maps to a unique deterministic ID so the frontend
    deduplicates with seenRef and never shows the same notification twice.
    """
    notifs = []
    now    = datetime.utcnow()

    # ── 1. Paid claims → payout_credited ──────────────────────────────────────
    paid_claims = (
        db.query(models.Claim)
        .filter(
            models.Claim.worker_id == worker_id,
            models.Claim.status == "paid",
            models.Claim.paid_at >= now - timedelta(days=7),
        )
        .order_by(models.Claim.paid_at.desc())
        .limit(5)
        .all()
    )
    for c in paid_claims:
        notifs.append({
            "id":       f"payout_{c.id}",
            "type":     "payout_credited",
            "title":    f"₹{int(c.payout_amount or 0)} credited to your UPI",
            "body":     f"{c.trigger_type.replace('_',' ').title()} claim approved · UTR {c.utr or 'processing'}",
            "amount":   float(c.payout_amount or 0),
            "claim_id": str(c.id),
        })

    # ── 2. Approved (manual review) claims ────────────────────────────────────
    approved_claims = (
        db.query(models.Claim)
        .filter(
            models.Claim.worker_id == worker_id,
            models.Claim.status == "approved",
            models.Claim.created_at >= now - timedelta(days=7),
        )
        .order_by(models.Claim.created_at.desc())
        .limit(3)
        .all()
    )
    for c in approved_claims:
        notifs.append({
            "id":       f"approved_{c.id}",
            "type":     "claim_approved",
            "title":    "Claim under review",
            "body":     f"{c.trigger_type.replace('_',' ').title()} claim verified · payout processing",
            "claim_id": str(c.id),
        })

    # ── 3. Rejected claims ────────────────────────────────────────────────────
    rejected_claims = (
        db.query(models.Claim)
        .filter(
            models.Claim.worker_id == worker_id,
            models.Claim.status == "rejected",
            models.Claim.created_at >= now - timedelta(days=7),
        )
        .order_by(models.Claim.created_at.desc())
        .limit(3)
        .all()
    )
    for c in rejected_claims:
        notifs.append({
            "id":       f"rejected_{c.id}",
            "type":     "claim_rejected",
            "title":    "Claim not approved",
            "body":     f"{c.trigger_type.replace('_',' ').title()} · fraud score {int(c.fraud_score)}/100 · appeal within 30 days",
            "claim_id": str(c.id),
        })

    # ── 4. Active policy → policy_renewed ─────────────────────────────────────
    policy = (
        db.query(models.Policy)
        .filter(models.Policy.worker_id == worker_id, models.Policy.is_active == True)
        .order_by(models.Policy.created_at.desc())
        .first()
    )
    if policy and policy.created_at and (now - policy.created_at).days <= 2:
        notifs.append({
            "id":   f"policy_{policy.id}",
            "type": "policy_renewed",
            "title": f"{policy.tier.title()} policy active",
            "body":  f"₹{int(policy.weekly_premium)}/week · coverage ₹{policy.coverage_cap} · valid until {policy.valid_until.strftime('%d %b') if policy.valid_until else 'N/A'}",
        })

    # ── 5. High DCS alert ─────────────────────────────────────────────────────
    worker_row = db.query(models.Worker).filter(models.Worker.id == worker_id).first()
    if not worker_row:
        return []

    zone_row = (
        db.query(models.Zone)
        .filter(models.Zone.zone_id == worker_row.zone_id)
        .first()
    )
    if zone_row and zone_row.current_dcs and zone_row.current_dcs >= 70:
        notifs.append({
            "id":   f"dcs_{worker_row.zone_id}_{int(zone_row.current_dcs)}",
            "type": "high_dcs_alert",
            "title": f"High disruption risk in {worker_row.zone_name}",
            "body":  f"DCS {round(zone_row.current_dcs)}/100 · income loss risk active · consider moving zones",
        })
    elif zone_row and zone_row.current_dcs and zone_row.current_dcs >= 40:
        notifs.append({
            "id":   f"dcs_warn_{worker_row.zone_id}_{int(zone_row.current_dcs)}",
            "type": "income_warning",
            "title": f"Moderate risk in {worker_row.zone_name}",
            "body":  f"DCS {round(zone_row.current_dcs)}/100 · monitor conditions",
        })

    # ── 6. Zone active disruption ─────────────────────────────────────────────
    if zone_row and zone_row.active_disruption:
        notifs.append({
            "id":   f"disruption_{worker_row.zone_id}",
            "type": "disruption_confirmed",
            "title": f"Active disruption in {worker_row.zone_name}",
            "body":  "Parametric trigger conditions met · auto-claim may be generated",
        })

    return notifs[:20]

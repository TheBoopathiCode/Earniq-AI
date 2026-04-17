from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.auth import get_current_worker
from app.database import get_db
from app import models

router = APIRouter()


class AppealCreate(BaseModel):
    claim_id:      int
    evidence_text: str
    evidence_type: str  # "photo" | "delivery_log" | "platform_screenshot"


@router.post("")
def submit_appeal(
    appeal: AppealCreate,
    current_worker: models.Worker = Depends(get_current_worker),
    db: Session = Depends(get_db),
):
    cutoff = datetime.utcnow() - timedelta(days=30)
    recent = db.execute(
        text("SELECT COUNT(*) as cnt FROM appeals WHERE worker_id = :wid AND created_at > :cutoff"),
        {"wid": current_worker.id, "cutoff": cutoff}
    ).fetchone()

    if recent and recent[0] >= 1:
        raise HTTPException(status_code=429, detail="One appeal per month allowed.")

    claim = db.query(models.Claim).filter(
        models.Claim.id == appeal.claim_id,
        models.Claim.worker_id == current_worker.id,
        models.Claim.status == "rejected"
    ).first()

    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found or not eligible for appeal.")

    db.execute(
        text("""INSERT INTO appeals
               (worker_id, claim_id, evidence_text, evidence_type, status, created_at)
               VALUES (:wid, :cid, :text, :etype, 'PENDING', :now)"""),
        {
            "wid": current_worker.id, "cid": appeal.claim_id,
            "text": appeal.evidence_text, "etype": appeal.evidence_type,
            "now": datetime.utcnow(),
        }
    )
    db.commit()

    return {
        "message":  "Appeal submitted. Human insurer review within 24 hours.",
        "claim_id": appeal.claim_id,
        "status":   "PENDING",
    }


@router.get("/my")
def my_appeals(
    current_worker: models.Worker = Depends(get_current_worker),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("""SELECT a.id, a.claim_id, a.status, a.evidence_type,
                       a.created_at, a.resolved_at, a.reviewer_note,
                       c.fraud_score, c.trigger_type, c.payout_amount
                FROM appeals a
                JOIN claims c ON a.claim_id = c.id
                WHERE a.worker_id = :wid
                ORDER BY a.created_at DESC"""),
        {"wid": current_worker.id}
    ).fetchall()
    return [dict(r._mapping) for r in rows]

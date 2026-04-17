from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Worker(Base):
    __tablename__ = "workers"
    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(20), unique=True, nullable=False)
    name = Column(String(100), default="")
    hashed_password = Column(String(255), nullable=False)
    platform = Column(String(50), nullable=False)
    city = Column(String(50), nullable=False)
    zone_id = Column(String(20), nullable=False, index=True)
    zone_name = Column(String(100), nullable=False)
    zone_lat = Column(Float, nullable=False)
    zone_lon = Column(Float, nullable=False)
    zone_risk_score = Column(Integer, nullable=False)
    avg_orders = Column(Integer, default=15)
    working_hours = Column(Integer, default=8)
    upi_id = Column(String(100), nullable=False)
    risk_score = Column(Integer, default=50)
    hourly_rate = Column(Integer, default=250)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    policies = relationship("Policy", back_populates="worker")
    claims = relationship("Claim", back_populates="worker")

class Policy(Base):
    __tablename__ = "policies"
    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("workers.id"), nullable=False, index=True)
    tier = Column(String(20), nullable=False)
    weekly_premium = Column(Float, nullable=False)
    coverage_cap = Column(Integer, nullable=False)
    valid_from = Column(DateTime, server_default=func.now())
    valid_until = Column(DateTime, nullable=False)
    triggers_active = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    ai_insight = Column(String(500), nullable=True)
    zone_multiplier = Column(Float, nullable=False)
    claim_factor = Column(Float, default=1.0)
    consistency_bonus = Column(Float, default=0.85)
    created_at = Column(DateTime, server_default=func.now())
    worker = relationship("Worker", back_populates="policies")
    claims = relationship("Claim", back_populates="policy")

class Claim(Base):
    __tablename__ = "claims"
    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("workers.id"), nullable=False, index=True)
    policy_id = Column(Integer, ForeignKey("policies.id"), nullable=False, index=True)
    disruption_event_id = Column(Integer, ForeignKey("disruption_events.id"), nullable=True, index=True)
    trigger_type = Column(String(20), nullable=False)
    dcs_score = Column(Float, nullable=False)
    expected_income = Column(Float, nullable=False)
    actual_income = Column(Float, nullable=False)
    loss_amount = Column(Float, nullable=False)
    loss_percent = Column(Float, nullable=False)
    fraud_score = Column(Float, default=0)
    status = Column(String(20), default="pending", index=True)
    payout_amount = Column(Float, nullable=True)
    utr = Column(String(30), nullable=True)
    weather_signal = Column(Float, default=0)
    aqi_signal = Column(Float, default=0)
    traffic_signal = Column(Float, default=0)
    govt_alert_signal = Column(Float, default=0)
    worker_idle_signal = Column(Float, default=0)
    bio_alert_signal = Column(Float, default=0)
    conflict_signal = Column(Float, default=0)
    infra_outage_signal = Column(Float, default=0)
    fraud_layer1_passed = Column(Boolean, default=True)
    fraud_layer2_passed = Column(Boolean, default=True)
    fraud_layer3_score = Column(Float, default=0.08)
    syndicate_score = Column(Float, default=8)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    paid_at = Column(DateTime, nullable=True, index=True)
    worker = relationship("Worker", back_populates="claims")
    policy = relationship("Policy", back_populates="claims")

class DisruptionEvent(Base):
    __tablename__ = "disruption_events"
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String(20), ForeignKey("zones.zone_id"), nullable=False, index=True)
    trigger_type = Column(String(20), nullable=False)
    dcs_score = Column(Float, nullable=False)
    started_at = Column(DateTime, server_default=func.now())
    ended_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)


class Reserve(Base):
    __tablename__ = "reserves"
    id = Column(Integer, primary_key=True)
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    premium_collected = Column(Float, nullable=False)
    reserve_held = Column(Float, nullable=False)
    claims_paid = Column(Float, nullable=False, default=0.0)
    balance = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Zone(Base):
    __tablename__ = "zones"
    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String(20), unique=True, nullable=False, index=True)
    zone_name = Column(String(100), nullable=False)
    city = Column(String(50), nullable=False, index=True)
    risk_score = Column(Integer, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    current_dcs = Column(Float, default=0)
    active_disruption = Column(Boolean, default=False)
    # ML features for premium calculation
    waterlogging_freq = Column(Float, default=0.30)
    aqi_baseline_annual = Column(Float, default=120)
    heat_days_per_year = Column(Integer, default=20)
    traffic_density = Column(Float, default=0.55)
    govt_alert_freq = Column(Float, default=0.12)


class TrainingLog(Base):
    __tablename__ = "training_logs"
    id = Column(Integer, primary_key=True, index=True)
    started_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False)  # running | success | failed | aborted
    stages_json = Column(JSON, nullable=True)
    error = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class BcrLog(Base):
    __tablename__ = "bcr_logs"
    id                = Column(Integer, primary_key=True, index=True)
    bcr_global        = Column(Float, nullable=False)
    bcr_status        = Column(String(20), nullable=False)   # healthy | warning | danger | loss
    total_claims      = Column(Float, nullable=False)
    total_premium     = Column(Float, nullable=False)
    active_policies   = Column(Integer, nullable=False)
    window_days       = Column(Integer, nullable=False, default=14)  # rolling window used
    controls_applied  = Column(JSON, nullable=True)    # list of control action strings
    zone_bcr_snapshot = Column(JSON, nullable=True)    # {zone_id: bcr} at log time
    reserve_snapshot  = Column(JSON, nullable=True)    # reserve position at log time
    created_at        = Column(DateTime, server_default=func.now())


class Appeal(Base):
    __tablename__ = "appeals"
    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("workers.id"), nullable=False)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    evidence_text = Column(Text, nullable=True)
    evidence_type = Column(String(50), nullable=True)
    status = Column(String(20), default="PENDING")
    reviewer_note = Column(Text, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

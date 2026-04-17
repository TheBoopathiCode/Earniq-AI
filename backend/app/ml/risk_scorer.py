"""
Risk scorer — delegates to train_risk_model + predict_risk.
Single source of truth for the whole backend.
"""
from app.ml.predict_risk import predict_risk, FEATURES  # noqa: F401

__all__ = ["predict_risk", "FEATURES"]

if __name__ == "__main__":
    from app.ml.train_risk_model import train
    train()

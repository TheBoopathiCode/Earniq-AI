from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app import models
from app.routers import auth, zones, premium, dashboard, claims, earnings, admin

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Earniq AI API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api/auth",      tags=["auth"])
app.include_router(zones.router,     prefix="/api/zones",     tags=["zones"])
app.include_router(premium.router,   prefix="/api/premium",   tags=["premium"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(claims.router,    prefix="/api/claims",    tags=["claims"])
app.include_router(earnings.router,  prefix="/api/earnings",  tags=["earnings"])
app.include_router(admin.router,     prefix="/api/admin",     tags=["admin"])


@app.get("/")
def root():
    return {"status": "Earniq AI API v2.0 running", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "healthy"}

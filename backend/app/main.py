"""FastAPI application with routers for VLR Valorant predictor."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import settings
from app.logging_utils import get_logger
import os

logger = get_logger(__name__)

app = FastAPI(
    title="VLR Valorant Predictor",
    description="Predict Valorant match outcomes using VLR.gg data",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
from app.routers import predictions, matches, health, teams, advanced_predictions, dashboard

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(predictions.router, prefix="/predictions", tags=["predictions"])
app.include_router(advanced_predictions.router, prefix="/advanced", tags=["advanced-predictions"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(matches.router, prefix="/matches", tags=["matches"])
app.include_router(teams.router, prefix="/teams", tags=["teams"])

# Mount static files for frontend (frontend is now in ../frontend from backend/)
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_path):
    app.mount("/frontend", StaticFiles(directory=frontend_path), name="frontend")
    # Also mount static files at root level for CSS/JS
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

# Root endpoint to serve the main frontend page
@app.get("/")
async def read_root():
    """Serve the main frontend page."""
    frontend_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "index.html")
    if os.path.exists(frontend_file):
        return FileResponse(frontend_file)
    return {"message": "VLR Valorant Predictor API", "docs": "/docs"}

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    logger.info("Starting VLR Valorant Predictor API")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Shutting down VLR Valorant Predictor API")

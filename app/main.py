"""FastAPI application with routers for VLR Valorant predictor."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.logging_utils import get_logger

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
from app.routers import predictions, matches, health

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(predictions.router, prefix="/predictions", tags=["predictions"])
app.include_router(matches.router, prefix="/matches", tags=["matches"])

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    logger.info("Starting VLR Valorant Predictor API")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Shutting down VLR Valorant Predictor API")

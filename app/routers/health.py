"""Health check endpoints."""

from fastapi import APIRouter
from datetime import datetime
from app.models import HealthResponse
from app.logging_utils import get_logger, metrics
from app.config import settings

router = APIRouter()
logger = get_logger(__name__)

@router.get("/", response_model=HealthResponse)
async def health_check():
    """Basic health check endpoint."""
    try:
        # Get cache status
        cache_status = "healthy"  # Would check actual cache status
        
        # Get model status
        model_status = "loaded"  # Would check actual model status
        
        # Get uptime
        uptime_metrics = metrics.get_metrics()
        uptime = uptime_metrics.get("uptime_seconds", 0)
        
        return HealthResponse(
            status="healthy",
            timestamp=datetime.utcnow(),
            version="0.1.0",
            uptime=uptime,
            cache_status=cache_status,
            model_status=model_status
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="unhealthy",
            timestamp=datetime.utcnow(),
            version="0.1.0",
            uptime=0,
            cache_status="error",
            model_status="error"
        )

@router.get("/metrics")
async def get_metrics():
    """Get application metrics."""
    return metrics.get_metrics()

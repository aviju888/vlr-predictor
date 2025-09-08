"""Environment configuration using Pydantic settings."""

from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # API Configuration
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000
    
    # CORS
    allowed_origins: List[str] = ["*"]
    
    # VLR.gg API
    vlr_base_url: str = "https://vlrggapi.vercel.app"  # Updated to correct URL
    vlr_timeout: int = 30
    vlr_retry_attempts: int = 3
    vlr_retry_delay: float = 1.0
    
    # Caching
    cache_ttl: int = 300  # 5 minutes
    max_cache_size: int = 1000
    
    # Feature Store
    features_cache_ttl: int = 3600  # 1 hour
    stats_lookback_days: int = 30
    
    # Model
    model_path: str = "models/baseline_model.pkl"
    model_confidence_threshold: float = 0.6
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "json"
    
    # Optional LLM for summarization
    openai_api_key: str = ""
    use_llm_summarization: bool = False
    
    # Additional optional fields
    anthropic_api_key: str = ""
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"  # This allows extra fields from .env

# Global settings instance
settings = Settings()
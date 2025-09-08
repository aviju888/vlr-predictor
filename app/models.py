"""Pydantic schemas for request/response models."""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class TeamSide(str, Enum):
    """Team side in a match."""
    ATTACK = "attack"
    DEFENSE = "defense"

class MatchStatus(str, Enum):
    """Match status."""
    UPCOMING = "upcoming"
    LIVE = "live"
    COMPLETED = "completed"

class Team(BaseModel):
    """Team information."""
    id: str
    name: str
    slug: str
    logo_url: Optional[str] = None
    country: Optional[str] = None

class Player(BaseModel):
    """Player information."""
    id: str
    name: str
    team_id: str
    country: Optional[str] = None

class MapInfo(BaseModel):
    """Map information."""
    name: str
    slug: str
    image_url: Optional[str] = None

class Match(BaseModel):
    """Match information."""
    id: str
    team1: Team
    team2: Team
    status: MatchStatus
    scheduled_time: Optional[datetime] = None
    maps: List[MapInfo] = []
    tournament: Optional[str] = None
    round: Optional[str] = None

class TeamStats(BaseModel):
    """Team statistics for prediction."""
    team_id: str
    team_name: str
    avg_acs: float = Field(description="Average Combat Score")
    avg_kd: float = Field(description="Average Kill/Death ratio")
    avg_rating: float = Field(description="Average rating")
    win_rate: float = Field(description="Win rate in last 30 days")
    maps_played: int = Field(description="Number of maps played")
    last_updated: datetime

class PredictionRequest(BaseModel):
    """Request for match prediction."""
    team1_id: str = Field(description="First team ID")
    team2_id: str = Field(description="Second team ID")
    include_confidence: bool = Field(default=True, description="Include confidence score")

class PredictionResponse(BaseModel):
    """Response for match prediction."""
    team1_id: str
    team2_id: str
    predicted_winner: str
    confidence: float = Field(ge=0.0, le=1.0, description="Prediction confidence")
    team1_win_probability: float = Field(ge=0.0, le=1.0)
    team2_win_probability: float = Field(ge=0.0, le=1.0)
    team1_stats: TeamStats
    team2_stats: TeamStats
    prediction_timestamp: datetime
    model_version: str = "baseline"

class MatchSummaryRequest(BaseModel):
    """Request for match summary."""
    match_id: str = Field(description="Match ID to summarize")

class MatchSummaryResponse(BaseModel):
    """Response for match summary."""
    match_id: str
    summary: str
    key_highlights: List[str]
    team1_performance: Dict[str, Any]
    team2_performance: Dict[str, Any]
    generated_at: datetime
    used_llm: bool = False

class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    timestamp: datetime
    version: str
    uptime: float
    cache_status: str
    model_status: str

class ErrorResponse(BaseModel):
    """Error response."""
    error: str
    detail: Optional[str] = None
    timestamp: datetime

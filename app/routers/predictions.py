"""Prediction endpoints."""

from fastapi import APIRouter, HTTPException
from app.models import PredictionRequest, PredictionResponse, TeamStats
from app.features import feature_store
from app.predictor import baseline_predictor, trained_predictor
from app.logging_utils import get_logger, track_api_call

router = APIRouter()
logger = get_logger(__name__)

@router.post("/predict", response_model=PredictionResponse)
async def predict_match(request: PredictionRequest):
    """Predict match outcome between two teams."""
    try:
        # Get team statistics
        team1_stats = await feature_store.get_team_stats(request.team1_id)
        team2_stats = await feature_store.get_team_stats(request.team2_id)
        
        # Make prediction using baseline model
        prediction = baseline_predictor.predict(team1_stats, team2_stats)
        
        # Convert team stats to response format
        team1_response = TeamStats(
            team_id=team1_stats["team_id"],
            team_name=team1_stats["team_name"],
            avg_acs=team1_stats["avg_acs"],
            avg_kd=team1_stats["avg_kd"],
            avg_rating=team1_stats["avg_rating"],
            win_rate=team1_stats["win_rate"],
            maps_played=team1_stats["maps_played"],
            last_updated=team1_stats["last_updated"]
        )
        
        team2_response = TeamStats(
            team_id=team2_stats["team_id"],
            team_name=team2_stats["team_name"],
            avg_acs=team2_stats["avg_acs"],
            avg_kd=team2_stats["avg_kd"],
            avg_rating=team2_stats["avg_rating"],
            win_rate=team2_stats["win_rate"],
            maps_played=team2_stats["maps_played"],
            last_updated=team2_stats["last_updated"]
        )
        
        # Map team IDs to actual team names for response
        predicted_winner_id = request.team1_id if prediction["predicted_winner"] == "team1" else request.team2_id
        predicted_winner_name = team1_response.team_name if prediction["predicted_winner"] == "team1" else team2_response.team_name
        
        return PredictionResponse(
            team1_id=request.team1_id,
            team2_id=request.team2_id,
            predicted_winner=predicted_winner_name,
            confidence=prediction["confidence"],
            team1_win_probability=prediction["team1_win_probability"],
            team2_win_probability=prediction["team2_win_probability"],
            team1_stats=team1_response,
            team2_stats=team2_response,
            prediction_timestamp=prediction["prediction_timestamp"],
            model_version=prediction["model_version"]
        )
        
    except Exception as e:
        logger.error(f"Prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@router.post("/predict/trained", response_model=PredictionResponse)
async def predict_match_trained(request: PredictionRequest):
    """Predict match outcome using trained model."""
    try:
        # Get team statistics
        team1_stats = await feature_store.get_team_stats(request.team1_id)
        team2_stats = await feature_store.get_team_stats(request.team2_id)
        
        # Make prediction using trained model
        prediction = trained_predictor.predict(team1_stats, team2_stats)
        
        # Convert team stats to response format
        team1_response = TeamStats(
            team_id=team1_stats["team_id"],
            team_name=team1_stats["team_name"],
            avg_acs=team1_stats["avg_acs"],
            avg_kd=team1_stats["avg_kd"],
            avg_rating=team1_stats["avg_rating"],
            win_rate=team1_stats["win_rate"],
            maps_played=team1_stats["maps_played"],
            last_updated=team1_stats["last_updated"]
        )
        
        team2_response = TeamStats(
            team_id=team2_stats["team_id"],
            team_name=team2_stats["team_name"],
            avg_acs=team2_stats["avg_acs"],
            avg_kd=team2_stats["avg_kd"],
            avg_rating=team2_stats["avg_rating"],
            win_rate=team2_stats["win_rate"],
            maps_played=team2_stats["maps_played"],
            last_updated=team2_stats["last_updated"]
        )
        
        # Map team IDs to actual team names for response
        predicted_winner_id = request.team1_id if prediction["predicted_winner"] == "team1" else request.team2_id
        predicted_winner_name = team1_response.team_name if prediction["predicted_winner"] == "team1" else team2_response.team_name
        
        return PredictionResponse(
            team1_id=request.team1_id,
            team2_id=request.team2_id,
            predicted_winner=predicted_winner_name,
            confidence=prediction["confidence"],
            team1_win_probability=prediction["team1_win_probability"],
            team2_win_probability=prediction["team2_win_probability"],
            team1_stats=team1_response,
            team2_stats=team2_response,
            prediction_timestamp=prediction["prediction_timestamp"],
            model_version=prediction["model_version"]
        )
        
    except Exception as e:
        logger.error(f"Trained prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Trained prediction failed: {str(e)}")

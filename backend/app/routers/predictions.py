"""Prediction endpoints."""

from fastapi import APIRouter, HTTPException
from app.models import PredictionRequest, PredictionResponse, TeamStats
from datetime import datetime
from app.features import feature_store
from app.predictor import baseline_predictor, trained_predictor
from app.enhanced_predictor import enhanced_predictor
from app.strength_of_schedule_predictor import sos_predictor
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

@router.get("/debug/team/{team_id}")
async def debug_team_stats(team_id: str):
    """Debug endpoint to test team stats retrieval."""
    try:
        # Get team statistics directly
        team_stats = await feature_store.get_team_stats(team_id)
        return {
            "team_id": team_id,
            "stats": team_stats,
            "success": True
        }
    except Exception as e:
        return {
            "team_id": team_id,
            "error": str(e),
            "success": False
        }

@router.post("/predict/enhanced", response_model=PredictionResponse)
async def predict_match_enhanced(request: PredictionRequest, map_name: str = None):
    """Predict match outcome using enhanced model with historical data."""
    try:
        # Get team statistics
        team1_stats = await feature_store.get_team_stats(request.team1_id)
        team2_stats = await feature_store.get_team_stats(request.team2_id)
        
        # Make prediction using enhanced model
        prediction = enhanced_predictor.predict(team1_stats, team2_stats, map_name)
        
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
        logger.error(f"Enhanced prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Enhanced prediction failed: {str(e)}")

@router.post("/matches/add")
async def add_match_to_history(match_data: dict):
    """Add a completed match to historical data."""
    try:
        enhanced_predictor.match_history.add_match(match_data)
        return {"message": "Match added to history successfully"}
    except Exception as e:
        logger.error(f"Failed to add match to history: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add match: {str(e)}")

@router.get("/history/form/{team_name}")
async def get_team_form(team_name: str, matches: int = 5):
    """Get recent form for a team."""
    try:
        form = enhanced_predictor.match_history.get_team_form(team_name, matches)
        return {
            "team_name": team_name,
            "form": form,
            "success": True
        }
    except Exception as e:
        logger.error(f"Failed to get team form: {e}")
        return {
            "team_name": team_name,
            "error": str(e),
            "success": False
        }

@router.get("/history/h2h/{team1}/{team2}")
async def get_head_to_head(team1: str, team2: str):
    """Get head-to-head record between two teams."""
    try:
        h2h = enhanced_predictor.match_history.get_head_to_head(team1, team2)
        return {
            "team1": team1,
            "team2": team2,
            "head_to_head": h2h,
            "success": True
        }
    except Exception as e:
        logger.error(f"Failed to get head-to-head: {e}")
        return {
            "team1": team1,
            "team2": team2,
            "error": str(e),
            "success": False
        }

@router.post("/predict/sos", response_model=PredictionResponse)
async def predict_match_sos(request: PredictionRequest, map_name: str = None):
    """Predict match outcome using strength of schedule adjustments."""
    try:
        team1_stats = await feature_store.get_team_stats(request.team1_id)
        team2_stats = await feature_store.get_team_stats(request.team2_id)
        prediction = sos_predictor.predict(team1_stats, team2_stats)
        
        # Convert team stats to TeamStats objects
        team1_stats_obj = TeamStats(
            team_id=request.team1_id,
            team_name=team1_stats.get('team_name', 'Unknown'),
            avg_acs=team1_stats.get('avg_acs', 0),
            avg_kd=team1_stats.get('avg_kd', 0),
            avg_rating=team1_stats.get('avg_rating', 0),
            win_rate=team1_stats.get('win_rate', 0),
            maps_played=team1_stats.get('maps_played', 0),
            last_updated=team1_stats.get('last_updated', datetime.utcnow())
        )
        
        team2_stats_obj = TeamStats(
            team_id=request.team2_id,
            team_name=team2_stats.get('team_name', 'Unknown'),
            avg_acs=team2_stats.get('avg_acs', 0),
            avg_kd=team2_stats.get('avg_kd', 0),
            avg_rating=team2_stats.get('avg_rating', 0),
            win_rate=team2_stats.get('win_rate', 0),
            maps_played=team2_stats.get('maps_played', 0),
            last_updated=team2_stats.get('last_updated', datetime.utcnow())
        )
        
        return PredictionResponse(
            team1_id=request.team1_id,
            team2_id=request.team2_id,
            predicted_winner=prediction["predicted_winner"],
            confidence=prediction["confidence"],
            team1_win_probability=prediction["team1_win_probability"],
            team2_win_probability=prediction["team2_win_probability"],
            team1_stats=team1_stats_obj,
            team2_stats=team2_stats_obj,
            model_version=prediction["model_version"],
            prediction_timestamp=prediction["prediction_timestamp"]
        )
    except Exception as e:
        logger.error(f"SOS prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"SOS prediction failed: {str(e)}")

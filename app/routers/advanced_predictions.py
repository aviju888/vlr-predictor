"""Advanced prediction endpoints using the new training system."""

import os
import sys
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from app.logging_utils import get_logger
from app.simple_predictor import simple_predictor

# Add the project root to the path to import train_and_predict
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

try:
    from train_and_predict import load_data
except ImportError as e:
    get_logger(__name__).warning(f"Could not import train_and_predict: {e}")

router = APIRouter()
logger = get_logger(__name__)

class MapPredictionRequest(BaseModel):
    """Request model for map-level predictions."""
    teamA: str
    teamB: str
    map_name: str

class MapPredictionResponse(BaseModel):
    """Response model for map-level predictions."""
    model_config = {"protected_namespaces": ()}
    
    teamA: str
    teamB: str
    map_name: str
    prob_teamA: float
    prob_teamB: float
    features: dict
    factor_contrib: dict
    explanation: str
    prediction_timestamp: datetime
    model_version: str = "advanced_v1.0"

@router.post("/map-predict", response_model=MapPredictionResponse)
async def predict_map_outcome(request: MapPredictionRequest):
    """Predict map outcome between two teams on a specific map."""
    try:
        # Set the data source environment variable
        os.environ["DATA_CSV"] = "./data/map_matches_365d.csv"
        
        # Make prediction using the simple model
        result = simple_predictor.predict(request.teamA, request.teamB, request.map_name)
        
        return MapPredictionResponse(
            teamA=request.teamA,
            teamB=request.teamB,
            map_name=request.map_name,
            prob_teamA=result["prob_teamA"],
            prob_teamB=result["prob_teamB"],
            features=result["features"],
            factor_contrib=result["factor_contrib"],
            explanation=result["explanation"],
            prediction_timestamp=datetime.now(),
            model_version="advanced_v1.0"
        )
        
    except Exception as e:
        logger.error(f"Map prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Map prediction failed: {str(e)}")

@router.get("/map-predict")
async def predict_map_outcome_get(
    teamA: str = Query(..., description="Name of team A"),
    teamB: str = Query(..., description="Name of team B"),
    map_name: str = Query(..., description="Name of the map")
):
    """Predict map outcome between two teams on a specific map (GET version)."""
    try:
        # Set the data source environment variable
        os.environ["DATA_CSV"] = "./data/map_matches_365d.csv"
        
        # Make prediction using the simple model
        result = simple_predictor.predict(teamA, teamB, map_name)
        
        return MapPredictionResponse(
            teamA=teamA,
            teamB=teamB,
            map_name=map_name,
            prob_teamA=result["prob_teamA"],
            prob_teamB=result["prob_teamB"],
            features=result["features"],
            factor_contrib=result["factor_contrib"],
            explanation=result["explanation"],
            prediction_timestamp=datetime.now(),
            model_version="advanced_v1.0"
        )
        
    except Exception as e:
        logger.error(f"Map prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Map prediction failed: {str(e)}")

@router.post("/retrain")
async def retrain_model():
    """Retrain the advanced prediction model."""
    try:
        # Set the data source environment variable
        os.environ["DATA_CSV"] = "./data/map_matches_365d.csv"
        
        # Import and run training
        from train_and_predict import main
        import argparse
        
        # Create args for training
        args = argparse.Namespace()
        args.train = True
        args.predict = False
        args.teamA = None
        args.teamB = None
        args.map = None
        
        # Run training
        main()
        
        return {
            "message": "Model retrained successfully",
            "timestamp": datetime.now(),
            "model_version": "advanced_v1.0"
        }
        
    except Exception as e:
        logger.error(f"Model retraining failed: {e}")
        raise HTTPException(status_code=500, detail=f"Model retraining failed: {str(e)}")

@router.get("/model-info")
async def get_model_info():
    """Get information about the current model."""
    try:
        # Check if model artifacts exist
        artifacts_dir = "./artifacts"
        model_exists = os.path.exists(os.path.join(artifacts_dir, "model.joblib"))
        calibrator_exists = os.path.exists(os.path.join(artifacts_dir, "calibrator.joblib"))
        
        # Get metrics if available
        metrics_file = os.path.join(artifacts_dir, "metrics.csv")
        metrics = None
        if os.path.exists(metrics_file):
            import pandas as pd
            metrics_df = pd.read_csv(metrics_file)
            metrics = metrics_df.to_dict('records')
        
        return {
            "model_loaded": model_exists and calibrator_exists,
            "model_version": "advanced_v1.0",
            "features": [
                "winrate_diff",
                "h2h_shrunk", 
                "sos_mapelo_diff",
                "acs_diff",
                "kd_diff"
            ],
            "metrics": metrics,
            "last_updated": datetime.now()
        }
        
    except Exception as e:
        logger.error(f"Failed to get model info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get model info: {str(e)}")

@router.get("/available-maps")
async def get_available_maps():
    """Get list of available maps in the current map pool."""
    return {
        "maps": [
            "Ascent", "Bind", "Breeze", "Haven", "Lotus", 
            "Split", "Sunset", "Icebox", "Abyss"
        ],
        "total_maps": 9
    }

@router.get("/available-teams")
async def get_available_teams():
    """Get list of teams available in the training data."""
    try:
        # Check if we should use VLR.gg data
        use_vlrgg = os.getenv("USE_VLRGG", "false").lower() == "true"
        
        if use_vlrgg:
            # Get teams from VLR.gg data
            try:
                import asyncio
                from app.vlrgg_integration import fetch_map_matches_vlrgg
                
                # Fetch fresh data
                df = asyncio.run(fetch_map_matches_vlrgg(days=30, limit=200))
                if not df.empty:
                    df["date"] = pd.to_datetime(df["date"])
                    teams = sorted(set(df["teamA"].unique()) | set(df["teamB"].unique()))
                else:
                    teams = []
            except Exception as e:
                logger.warning(f"Failed to fetch VLR.gg teams: {e}")
                teams = []
        else:
            # Load data and get unique teams
            os.environ["DATA_CSV"] = "./data/map_matches_365d.csv"
            df = load_data()
            teams = sorted(list(set(df['teamA'].unique()) | set(df['teamB'].unique())))
        
        return {
            "teams": teams,
            "total_teams": len(teams)
        }
        
    except Exception as e:
        logger.error(f"Failed to get available teams: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get available teams: {str(e)}")

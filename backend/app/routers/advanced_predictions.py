"""Advanced prediction endpoints using the new training system."""

import os
import sys
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from app.logging_utils import get_logger
from app.advanced_predictor import advanced_predictor
from app.realistic_predictor import realistic_predictor
from app.symmetric_predictor import symmetric_realistic_predictor
from app.live_realistic_predictor import live_realistic_predictor
from itertools import combinations

# Add the project root to the path to import train_and_predict
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

try:
    from train_and_predict import load_data
    from train_and_predict import CURRENT_MAP_POOL
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
    uncertainty: Optional[str] = None

class SeriesPredictionResponse(BaseModel):
    """Response model for series (BO3) predictions."""
    model_config = {"protected_namespaces": ()}

    teamA: str
    teamB: str
    format: str = "BO3"
    headline: dict
    alternatives: list
    generated_at: datetime
    model_version: str = "advanced_v1.0"

@router.post("/map-predict", response_model=MapPredictionResponse)
async def predict_map_outcome(request: MapPredictionRequest):
    """Predict map outcome between two teams on a specific map."""
    try:
        # Set the data source environment variable
        os.environ["DATA_CSV"] = "./data/map_matches_365d.csv"
        
        # Validate map is in current pool
        if request.map_name not in CURRENT_MAP_POOL:
            raise HTTPException(status_code=422, detail=f"Map '{request.map_name}' is not in the current pool")

        # Make prediction using the calibrated advanced model
        result = advanced_predictor.predict(request.teamA, request.teamB, request.map_name)
        
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
            model_version="advanced_v1.0",
            uncertainty=result.get("uncertainty")
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
        
        # Validate map is in current pool
        if map_name not in CURRENT_MAP_POOL:
            raise HTTPException(status_code=422, detail=f"Map '{map_name}' is not in the current pool")

        # Make prediction using the calibrated advanced model
        result = advanced_predictor.predict(teamA, teamB, map_name)
        
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
            model_version="advanced_v1.0",
            uncertainty=result.get("uncertainty")
        )
        
    except Exception as e:
        logger.error(f"Map prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Map prediction failed: {str(e)}")

@router.get("/series-predict", response_model=SeriesPredictionResponse)
async def predict_series_bo3(
    teamA: str = Query(..., description="Name of team A"),
    teamB: str = Query(..., description="Name of team B"),
    topN: int = Query(3, ge=1, le=10, description="How many top combos to return"),
    maps: Optional[str] = Query(None, description="Comma-separated maps to consider; defaults to current pool")
):
    """Predict best-of-3 series outcome by enumerating 3-map combinations.

    Assumes independence across maps. Series win prob for teamA across maps m1,m2,m3 with
    per-map probs p1,p2,p3 is: p1 p2 + p1 p3 + p2 p3 - 2 p1 p2 p3.
    """
    try:
        os.environ["DATA_CSV"] = "./data/map_matches_365d.csv"

        # Determine candidate maps
        if maps:
            candidate_maps = [m.strip() for m in maps.split(",") if m.strip()]
            # Validate maps are in pool
            invalid = [m for m in candidate_maps if m not in CURRENT_MAP_POOL]
            if invalid:
                raise HTTPException(status_code=422, detail=f"Invalid maps not in pool: {invalid}")
        else:
            candidate_maps = list(CURRENT_MAP_POOL)

        # Need at least 3 maps
        if len(candidate_maps) < 3:
            raise HTTPException(status_code=422, detail="Need at least 3 maps to form a BO3")

        def series_prob(p1: float, p2: float, p3: float) -> float:
            return (p1 * p2 + p1 * p3 + p2 * p3) - 2.0 * (p1 * p2 * p3)

        combos = []
        for trio in combinations(candidate_maps, 3):
            try:
                p = []
                for m in trio:
                    res = advanced_predictor.predict(teamA, teamB, m)
                    p.append(float(res.get("prob_teamA", 0.5)))
                sp = series_prob(p[0], p[1], p[2])
                combos.append({
                    "maps": list(trio),
                    "prob_teamA": sp,
                    "prob_teamB": 1.0 - sp,
                    "per_map": [{"map": trio[i], "prob_teamA": p[i], "prob_teamB": 1.0 - p[i]} for i in range(3)]
                })
            except Exception as ie:
                # Skip problematic trio but continue
                logger.warning(f"Failed trio {trio}: {ie}")
                continue

        if not combos:
            raise HTTPException(status_code=500, detail="Failed to generate any series combos")

        combos.sort(key=lambda x: x["prob_teamA"], reverse=True)
        headline = combos[0]
        alternatives = combos[1:1 + max(0, topN - 1)]

        return SeriesPredictionResponse(
            teamA=teamA,
            teamB=teamB,
            format="BO3",
            headline=headline,
            alternatives=alternatives,
            generated_at=datetime.now(),
            model_version="advanced_v1.0",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Series prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Series prediction failed: {str(e)}")

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
        # artifacts is in backend/artifacts (same level as app/)
        artifacts_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "artifacts")
        model_path = os.path.join(artifacts_dir, "model.joblib")
        calibrator_path = os.path.join(artifacts_dir, "calibrator.joblib")
        model_exists = os.path.exists(model_path)
        calibrator_exists = os.path.exists(calibrator_path)
        
        # Get metrics if available
        metrics_file = os.path.join(artifacts_dir, "metrics.csv")
        metrics = None
        if os.path.exists(metrics_file):
            import pandas as pd
            metrics_df = pd.read_csv(metrics_file)
            metrics = metrics_df.to_dict('records')
        
        calibrator_kind = None
        if calibrator_exists:
            try:
                import joblib
                cal = joblib.load(calibrator_path)
                calibrator_kind = getattr(cal, "kind", None)
            except Exception:
                calibrator_kind = None

        return {
            "model_loaded": model_exists and calibrator_exists,
            "model_version": "advanced_v1.0",
            "calibrator_kind": calibrator_kind,
            "model_timestamp": os.path.getmtime(model_path) if model_exists else None,
            "calibrator_timestamp": os.path.getmtime(calibrator_path) if calibrator_exists else None,
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
        # For now, return a static list of popular teams for frontend testing
        # This avoids the timeout issues with VLR.gg data loading
        popular_teams = [
            # VCT Americas (11 teams)
            "G2 Esports", "Sentinels", "MIBR", "NRG Esports", "LOUD", 
            "100 Thieves", "Cloud9", "KRÜ Esports", "Leviatán", 
            "FURIA Esports", "Evil Geniuses",
            
            # VCT EMEA (11 teams)
            "Team Vitality", "Team Liquid", "Fnatic", "Team Heretics", 
            "GIANTX", "Karmine Corp", "BBL Esports", "FUT Esports", 
            "Natus Vincere", "Gentle Mates", "Movistar KOI",
            
            # VCT Pacific (11 teams)
            "DRX", "T1", "Rex Regum Qeon", "Gen.G", "Paper Rex", 
            "ZETA DIVISION", "Talon Esports", "DetonatioN FocusMe", 
            "Global Esports", "Bleed Esports", "Team Secret",
            
            # VCT China (9 teams - some with actual data)
            "Edward Gaming", "Trace Esports", "Xi Lai Gaming", 
            "Bilibili Gaming", "Dragon Ranger Gaming", "FunPlus Phoenix", 
            "Wolves Esports", "JDG Esports", "Titan Esports Club",
            
            # Teams with historical data
            "100 Thieves GC", "BOARS", "DNSTY", "FULL SENSE", "EMPIRE :3",
            "Alliance Guardians", "Blue Otter GC", "Contra GC"
        ]
        
        # Check if we should use VLR.gg data
        use_vlrgg = os.getenv("USE_VLRGG", "false").lower() == "true"
        
        # Always use VCT teams for now (force override)
        teams = popular_teams
        logger.info(f"Using VCT franchised teams: {len(teams)} teams loaded")
        
        return {
            "teams": teams,
            "total_teams": len(teams)
        }
        
    except Exception as e:
        logger.error(f"Failed to get available teams: {e}")
        # Fallback to popular teams
        return {
            "teams": [
                # VCT Americas
                "G2 Esports", "Sentinels", "MIBR", "NRG Esports", "LOUD", 
                "100 Thieves", "Cloud9", "KRÜ Esports", "Leviatán", 
                "FURIA Esports", "Evil Geniuses",
                
                # VCT EMEA
                "Team Vitality", "Team Liquid", "Fnatic", "Team Heretics", 
                "GIANTX", "Karmine Corp", "BBL Esports", "FUT Esports", 
                "Natus Vincere", "Gentle Mates", "Movistar KOI",
                
                # VCT Pacific
                "DRX", "T1", "Rex Regum Qeon", "Gen.G", "Paper Rex", 
                "ZETA DIVISION", "Talon Esports", "DetonatioN FocusMe", 
                "Global Esports", "Bleed Esports", "Team Secret",
                
                # VCT China
                "Edward Gaming", "Trace Esports", "Xi Lai Gaming", 
                "Bilibili Gaming", "Dragon Ranger Gaming", "FunPlus Phoenix", 
                "Wolves Esports", "JDG Esports", "Titan Esports Club",
                
                # Teams with historical data
                "100 Thieves GC", "BOARS", "DNSTY", "FULL SENSE", "EMPIRE :3",
                "Alliance Guardians", "Blue Otter GC", "Contra GC"
            ],
            "total_teams": 45
        }

@router.get("/realistic/map-predict")
async def predict_map_realistic(
    teamA: str = Query(..., description="Name of team A"),
    teamB: str = Query(..., description="Name of team B"),
    map_name: str = Query(..., description="Name of the map")
):
    """Make a realistic prediction using only historical features (no data leakage)."""
    try:
        # Use the realistic predictor
        prediction = symmetric_realistic_predictor.predict(teamA, teamB, map_name)
        
        return {
            "teamA": teamA,
            "teamB": teamB,
            "map_name": map_name,
            "prob_teamA": prediction["prob_teamA"],
            "prob_teamB": prediction["prob_teamB"],
            "winner": prediction["winner"],
            "confidence": prediction["confidence"],
            "model_version": prediction["model_version"],
            "uncertainty": prediction["uncertainty"],
            "explanation": prediction["explanation"],
            "features": prediction["features"]
        }
        
    except Exception as e:
        logger.error(f"Realistic map prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Realistic map prediction failed: {str(e)}")

@router.get("/live/map-predict")
async def predict_map_live(
    teamA: str = Query(..., description="Name of team A"),
    teamB: str = Query(..., description="Name of team B"),
    map_name: str = Query(..., description="Name of the map")
):
    """Make a prediction using live data cache with 365-day lookback.
    
    This endpoint:
    - Fetches fresh team data from VLR.gg API if cache is stale
    - Uses 365-day historical window for comprehensive analysis
    - Caches results locally for fast subsequent queries
    - Provides detailed data freshness information
    """
    try:
        # Use the live realistic predictor
        prediction = await live_realistic_predictor.predict(teamA, teamB, map_name)
        
        return {
            "teamA": teamA,
            "teamB": teamB,
            "map_name": map_name,
            "prob_teamA": prediction["prob_teamA"],
            "prob_teamB": prediction["prob_teamB"],
            "winner": prediction["winner"],
            "confidence": prediction["confidence"],
            "model_version": prediction["model_version"],
            "uncertainty": prediction.get("uncertainty"),
            "explanation": prediction.get("explanation"),
            "features": prediction.get("features", {}),
            "data_freshness": prediction.get("data_freshness", "unknown"),
            "cache_stats": prediction.get("cache_stats", {})
        }
        
    except Exception as e:
        logger.error(f"Live map prediction failed: {e}")
        # Graceful fallback to 50/50 to avoid frontend 500s
        return {
            "teamA": teamA,
            "teamB": teamB,
            "map_name": map_name,
            "prob_teamA": 0.5,
            "prob_teamB": 0.5,
            "winner": teamA if teamA < teamB else teamB,
            "confidence": 0.5,
            "model_version": "live_realistic_v1.0",
            "uncertainty": "High",
            "explanation": f"Live map prediction failed: {str(e)}",
            "features": {},
            "data_freshness": "error",
            "cache_stats": {}
        }

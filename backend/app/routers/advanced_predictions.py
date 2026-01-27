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
from app.accuracy_tracker import accuracy_tracker
from app.upstream import vlr_client
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

# Valid maps in the current pool
VALID_MAPS = {"Ascent", "Bind", "Breeze", "Haven", "Lotus", "Split", "Sunset", "Icebox", "Abyss"}


def validate_map_name(map_name: str) -> None:
    """Validate that map_name is in the current pool."""
    if map_name not in VALID_MAPS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid map '{map_name}'. Valid maps are: {', '.join(sorted(VALID_MAPS))}"
        )


def validate_team_names(teamA: str, teamB: str) -> None:
    """Validate that team names are reasonable."""
    if not teamA or not teamA.strip():
        raise HTTPException(status_code=422, detail="Team A name cannot be empty")
    if not teamB or not teamB.strip():
        raise HTTPException(status_code=422, detail="Team B name cannot be empty")
    if teamA.strip().lower() == teamB.strip().lower():
        raise HTTPException(status_code=422, detail="Team A and Team B cannot be the same team")
    if len(teamA) > 100 or len(teamB) > 100:
        raise HTTPException(status_code=422, detail="Team names must be less than 100 characters")

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
    # Validate inputs
    validate_team_names(teamA, teamB)
    validate_map_name(map_name)

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

@router.get("/explain")
async def explain_prediction(
    teamA: str = Query(..., description="Name of team A"),
    teamB: str = Query(..., description="Name of team B"),
    map_name: str = Query(..., description="Name of the map")
):
    """Get SHAP-based explanation for a prediction.

    Returns feature importance and human-readable explanations
    for why the model predicts a certain outcome.
    """
    # Validate inputs
    validate_team_names(teamA, teamB)
    validate_map_name(map_name)

    try:
        # Use the realistic predictor's explain method
        explanation = realistic_predictor.explain(teamA, teamB, map_name)

        if "error" in explanation:
            raise HTTPException(status_code=500, detail=explanation["error"])

        return explanation

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Explanation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Explanation failed: {str(e)}")


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
    # Validate inputs
    validate_team_names(teamA, teamB)
    validate_map_name(map_name)

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
        raise HTTPException(
            status_code=500,
            detail=f"Live map prediction failed: {str(e)}. Try using /advanced/realistic/map-predict instead."
        )


# ============================================================================
# Accuracy Tracking Endpoints
# ============================================================================

class OutcomeRecordRequest(BaseModel):
    """Request model for recording match outcomes."""
    team_a: str
    team_b: str
    map_name: str
    actual_winner: str


@router.get("/accuracy/log-prediction")
async def log_prediction_for_tracking(
    teamA: str = Query(..., description="Name of team A"),
    teamB: str = Query(..., description="Name of team B"),
    map_name: str = Query(..., description="Name of the map"),
    track: bool = Query(True, description="Whether to track this prediction")
):
    """Make a prediction and optionally log it for accuracy tracking.

    Returns the prediction along with a tracking ID that can be used
    to record the actual outcome later.
    """
    validate_team_names(teamA, teamB)
    validate_map_name(map_name)

    try:
        # Make the prediction
        prediction = symmetric_realistic_predictor.predict(teamA, teamB, map_name)

        # Log for tracking if requested
        tracking_id = None
        if track:
            tracking_id = accuracy_tracker.log_prediction(
                team_a=teamA,
                team_b=teamB,
                map_name=map_name,
                predicted_winner=prediction["winner"],
                confidence=prediction["confidence"],
                prob_team_a=prediction["prob_teamA"],
                prob_team_b=prediction["prob_teamB"],
                model_version=prediction["model_version"]
            )

        return {
            "teamA": teamA,
            "teamB": teamB,
            "map_name": map_name,
            "prob_teamA": prediction["prob_teamA"],
            "prob_teamB": prediction["prob_teamB"],
            "winner": prediction["winner"],
            "confidence": prediction["confidence"],
            "model_version": prediction["model_version"],
            "tracking_id": tracking_id if track else None,
            "is_tracked": track and tracking_id is not None and tracking_id > 0
        }

    except Exception as e:
        logger.error(f"Tracked prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/accuracy/record-outcome")
async def record_match_outcome(request: OutcomeRecordRequest):
    """Record the actual outcome of a previously predicted match.

    The system will look up the most recent unresolved prediction
    for this match and mark it with the actual winner.
    """
    try:
        success = accuracy_tracker.record_outcome(
            team_a=request.team_a,
            team_b=request.team_b,
            map_name=request.map_name,
            actual_winner=request.actual_winner
        )

        if success:
            return {
                "status": "recorded",
                "team_a": request.team_a,
                "team_b": request.team_b,
                "map_name": request.map_name,
                "actual_winner": request.actual_winner
            }
        else:
            raise HTTPException(
                status_code=404,
                detail=f"No unresolved prediction found for {request.team_a} vs {request.team_b} on {request.map_name}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to record outcome: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to record outcome: {str(e)}")


@router.get("/accuracy/stats")
async def get_accuracy_statistics(
    days: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
    model_version: Optional[str] = Query(None, description="Filter by model version")
):
    """Get prediction accuracy statistics.

    Returns overall accuracy, accuracy by confidence level, accuracy by map,
    and recent predictions with their outcomes.
    """
    try:
        stats = accuracy_tracker.get_accuracy_stats(days=days, model_version=model_version)

        if "error" in stats:
            raise HTTPException(status_code=500, detail=stats["error"])

        return stats

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get accuracy stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get accuracy stats: {str(e)}")


@router.get("/accuracy/pending")
async def get_pending_predictions(
    limit: int = Query(50, ge=1, le=200, description="Maximum predictions to return")
):
    """Get predictions that haven't had their outcomes recorded yet.

    Use this to see which predictions need outcome recording.
    """
    try:
        pending = accuracy_tracker.get_pending_predictions(limit=limit)
        return {
            "total": len(pending),
            "predictions": pending
        }
    except Exception as e:
        logger.error(f"Failed to get pending predictions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get pending predictions: {str(e)}")


# ============================================================================
# Upcoming/Live Matches Endpoints
# ============================================================================

@router.get("/upcoming-matches")
async def get_upcoming_matches_with_predictions(
    limit: int = Query(10, ge=1, le=50, description="Maximum matches to return"),
    include_predictions: bool = Query(True, description="Include AI predictions")
):
    """Get upcoming VCT matches with optional AI predictions.

    Fetches upcoming matches from VLR.gg and generates predictions
    for each match using the realistic model.
    """
    try:
        # Fetch upcoming matches from VLR.gg
        matches = await vlr_client.get_matches(status="upcoming")

        if not matches:
            return {
                "total": 0,
                "matches": [],
                "message": "No upcoming matches found"
            }

        # Process and optionally add predictions
        processed_matches = []
        for match in matches[:limit]:
            team1 = match.get("team1", "").strip()
            team2 = match.get("team2", "").strip()
            tournament = match.get("tournament_name", "Unknown")
            match_time = match.get("time_until_match", match.get("unix_timestamp", "TBD"))

            if not team1 or not team2:
                continue

            match_data = {
                "team1": team1,
                "team2": team2,
                "tournament": tournament,
                "match_time": match_time,
                "status": "upcoming"
            }

            # Add predictions if requested
            if include_predictions:
                try:
                    # Use Ascent as default map for series prediction
                    prediction = symmetric_realistic_predictor.predict(team1, team2, "Ascent")
                    match_data["prediction"] = {
                        "winner": prediction["winner"],
                        "confidence": prediction["confidence"],
                        "prob_team1": prediction["prob_teamA"],
                        "prob_team2": prediction["prob_teamB"],
                        "model_version": prediction["model_version"]
                    }
                except Exception as pred_error:
                    logger.warning(f"Failed to predict {team1} vs {team2}: {pred_error}")
                    match_data["prediction"] = None

            processed_matches.append(match_data)

        return {
            "total": len(processed_matches),
            "matches": processed_matches,
            "data_source": "VLR.gg API"
        }

    except Exception as e:
        logger.error(f"Failed to get upcoming matches: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get upcoming matches: {str(e)}")


@router.get("/live-matches")
async def get_live_matches_with_predictions(
    include_predictions: bool = Query(True, description="Include AI predictions")
):
    """Get currently live VCT matches with scores and predictions.

    Fetches live matches from VLR.gg and shows current scores
    along with AI predictions.
    """
    try:
        # Fetch live matches from VLR.gg
        matches = await vlr_client.get_matches(status="live")

        if not matches:
            return {
                "total": 0,
                "matches": [],
                "message": "No live matches currently"
            }

        processed_matches = []
        for match in matches:
            team1 = match.get("team1", "").strip()
            team2 = match.get("team2", "").strip()
            score1 = match.get("score1", 0)
            score2 = match.get("score2", 0)
            tournament = match.get("tournament_name", "Unknown")
            current_map = match.get("current_map", "Unknown")

            if not team1 or not team2:
                continue

            match_data = {
                "team1": team1,
                "team2": team2,
                "score1": score1,
                "score2": score2,
                "tournament": tournament,
                "current_map": current_map,
                "status": "live"
            }

            # Add predictions if requested
            if include_predictions:
                try:
                    # Use current map or Ascent as default
                    map_name = current_map if current_map in VALID_MAPS else "Ascent"
                    prediction = symmetric_realistic_predictor.predict(team1, team2, map_name)
                    match_data["prediction"] = {
                        "winner": prediction["winner"],
                        "confidence": prediction["confidence"],
                        "prob_team1": prediction["prob_teamA"],
                        "prob_team2": prediction["prob_teamB"],
                        "map_used": map_name,
                        "model_version": prediction["model_version"]
                    }
                except Exception as pred_error:
                    logger.warning(f"Failed to predict {team1} vs {team2}: {pred_error}")
                    match_data["prediction"] = None

            processed_matches.append(match_data)

        return {
            "total": len(processed_matches),
            "matches": processed_matches,
            "data_source": "VLR.gg API"
        }

    except Exception as e:
        logger.error(f"Failed to get live matches: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get live matches: {str(e)}")

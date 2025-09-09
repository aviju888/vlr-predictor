"""
Live Realistic Predictor with 100-Day Dynamic Cache
===================================================

Enhanced predictor that:
1. Makes live API calls for fresh team data (100-day lookback)
2. Caches results locally for fast subsequent queries
3. Uses comprehensive historical context for predictions
4. Maintains zero data leakage with temporal validation
"""

import asyncio
import pandas as pd
import numpy as np
import joblib
from typing import Dict
from datetime import datetime, timedelta
from pathlib import Path

from app.live_data_cache import live_cache
from app.logging_utils import get_logger

logger = get_logger(__name__)

class LiveRealisticPredictor:
    """Realistic predictor with live data cache and 100-day lookback."""
    
    def __init__(self, artifacts_dir: str = "./artifacts"):
        self.artifacts_dir = artifacts_dir
        self.model = None
        self.feature_names = [
            'overall_winrate_diff',
            'map_winrate_diff', 
            'h2h_advantage',
            'recent_form_5_diff',
            'recent_form_10_diff',
            'experience_diff',
            'rest_advantage',
            'momentum_diff',
            'tier_advantage',
            'region_advantage'
        ]
        self._load_model()
    
    def _load_model(self):
        """Load the realistic model."""
        try:
            project_root = Path(__file__).parent.parent
            artifacts_path = project_root / self.artifacts_dir
            
            model_path = artifacts_path / "realistic_model.joblib"
            
            if model_path.exists():
                self.model = joblib.load(str(model_path))
                logger.info("✅ Live realistic model loaded successfully")
            else:
                logger.warning("❌ Live realistic model not found")
                
        except Exception as e:
            logger.error(f"Failed to load live realistic model: {e}")
    
    async def predict(self, teamA: str, teamB: str, map_name: str) -> Dict:
        """Make a prediction using live data cache with 100-day lookback."""
        
        if self.model is None:
            return {
                "prob_teamA": 0.5,
                "prob_teamB": 0.5,
                "winner": "Unknown",
                "confidence": 0.0,
                "model_version": "live_realistic_v1.0",
                "uncertainty": "High",
                "explanation": "Model not loaded",
                "data_freshness": "N/A"
            }
        
        try:
            # Get live data for both teams (100-day lookback)
            logger.info(f"🔍 Fetching live data: {teamA} vs {teamB}")
            
            teamA_data, teamB_data = await live_cache.get_prediction_data(teamA, teamB)
            
            # Create features using live + cached data
            features = self._create_live_features(teamA, teamB, map_name, teamA_data, teamB_data)
            
            # Make prediction
            prob_teamA = self.model.predict_proba([features])[0][1]
            prob_teamB = 1 - prob_teamA
            
            # Determine winner and confidence
            if prob_teamA > prob_teamB:
                winner = teamA
                confidence = prob_teamA
            else:
                winner = teamB
                confidence = prob_teamB
            
            # Determine uncertainty based on data quality
            data_quality = self._assess_data_quality(teamA_data, teamB_data)
            uncertainty = self._determine_uncertainty(confidence, data_quality)
            
            # Create explanation
            explanation = self._create_explanation(teamA, teamB, map_name, features, teamA_data, teamB_data)
            
            return {
                "prob_teamA": float(prob_teamA),
                "prob_teamB": float(prob_teamB),
                "winner": winner,
                "confidence": float(confidence),
                "model_version": "live_realistic_v1.0",
                "uncertainty": uncertainty,
                "explanation": explanation,
                "features": {
                    "overall_winrate_diff": float(features[0]),
                    "map_winrate_diff": float(features[1]),
                    "h2h_advantage": float(features[2]),
                    "recent_form_5_diff": float(features[3]),
                    "recent_form_10_diff": float(features[4]),
                    "experience_diff": float(features[5]),
                    "rest_advantage": float(features[6]),
                    "momentum_diff": float(features[7]),
                    "tier_advantage": float(features[8]),
                    "region_advantage": float(features[9])
                },
                "data_freshness": f"{len(teamA_data)}+{len(teamB_data)} matches (100d)",
                "cache_stats": live_cache.get_cache_stats()
            }
            
        except Exception as e:
            logger.error(f"❌ Live prediction failed: {e}")
            return {
                "prob_teamA": 0.5,
                "prob_teamB": 0.5,
                "winner": "Unknown",
                "confidence": 0.5,
                "model_version": "live_realistic_v1.0",
                "uncertainty": "High",
                "explanation": f"Prediction failed: {str(e)}",
                "data_freshness": "Error"
            }
    
    def _create_live_features(self, teamA: str, teamB: str, map_name: str, 
                             teamA_data: pd.DataFrame, teamB_data: pd.DataFrame) -> np.ndarray:
        """Create features using live data with 100-day context."""
        
        # 1. Overall winrate difference (100-day window)
        teamA_wins = len(teamA_data[teamA_data['result'] == 'win'])
        teamA_total = len(teamA_data)
        teamA_winrate = teamA_wins / max(teamA_total, 1)
        
        teamB_wins = len(teamB_data[teamB_data['result'] == 'win'])
        teamB_total = len(teamB_data)
        teamB_winrate = teamB_wins / max(teamB_total, 1)
        
        overall_winrate_diff = teamA_winrate - teamB_winrate
        
        # 2. Map-specific winrate difference
        teamA_map = teamA_data[teamA_data['map_name'] == map_name]
        teamB_map = teamB_data[teamB_data['map_name'] == map_name]
        
        teamA_map_wins = len(teamA_map[teamA_map['result'] == 'win'])
        teamA_map_total = len(teamA_map)
        teamA_map_winrate = teamA_map_wins / max(teamA_map_total, 1)
        
        teamB_map_wins = len(teamB_map[teamB_map['result'] == 'win'])
        teamB_map_total = len(teamB_map)
        teamB_map_winrate = teamB_map_wins / max(teamB_map_total, 1)
        
        map_winrate_diff = teamA_map_winrate - teamB_map_winrate
        
        # 3. Head-to-head advantage (from both team datasets)
        h2h_teamA = teamA_data[teamA_data['opponent'] == teamB]
        h2h_teamB = teamB_data[teamB_data['opponent'] == teamA]
        
        teamA_h2h_wins = len(h2h_teamA[h2h_teamA['result'] == 'win'])
        teamB_h2h_wins = len(h2h_teamB[h2h_teamB['result'] == 'win'])
        total_h2h = len(h2h_teamA) + len(h2h_teamB)
        
        h2h_advantage = (teamA_h2h_wins - teamB_h2h_wins) / max(total_h2h, 1)
        
        # 4. Recent form differences (5 and 10 games)
        teamA_recent_5 = teamA_data.head(5)
        teamA_recent_10 = teamA_data.head(10)
        teamB_recent_5 = teamB_data.head(5)
        teamB_recent_10 = teamB_data.head(10)
        
        teamA_form_5 = len(teamA_recent_5[teamA_recent_5['result'] == 'win']) / max(len(teamA_recent_5), 1)
        teamB_form_5 = len(teamB_recent_5[teamB_recent_5['result'] == 'win']) / max(len(teamB_recent_5), 1)
        recent_form_5_diff = teamA_form_5 - teamB_form_5
        
        teamA_form_10 = len(teamA_recent_10[teamA_recent_10['result'] == 'win']) / max(len(teamA_recent_10), 1)
        teamB_form_10 = len(teamB_recent_10[teamB_recent_10['result'] == 'win']) / max(len(teamB_recent_10), 1)
        recent_form_10_diff = teamA_form_10 - teamB_form_10
        
        # 5. Experience difference
        experience_diff = teamA_total - teamB_total
        
        # 6. Rest advantage (days since last match)
        teamA_last = teamA_data['match_date'].max() if not teamA_data.empty else datetime.now() - timedelta(days=30)
        teamB_last = teamB_data['match_date'].max() if not teamB_data.empty else datetime.now() - timedelta(days=30)
        
        if hasattr(teamA_last, 'date'):
            teamA_rest = (datetime.now() - teamA_last).days
        else:
            teamA_rest = 30
            
        if hasattr(teamB_last, 'date'):
            teamB_rest = (datetime.now() - teamB_last).days
        else:
            teamB_rest = 30
        
        rest_advantage = teamA_rest - teamB_rest
        
        # 7. Momentum (current win streak)
        teamA_momentum = self._calculate_momentum(teamA_data)
        teamB_momentum = self._calculate_momentum(teamB_data)
        momentum_diff = teamA_momentum - teamB_momentum
        
        # 8. Tier advantage (placeholder - could be enhanced)
        tier_advantage = 0.0
        
        # 9. Region advantage (placeholder - could be enhanced)
        region_advantage = 0.0
        
        return np.array([
            overall_winrate_diff,
            map_winrate_diff,
            h2h_advantage,
            recent_form_5_diff,
            recent_form_10_diff,
            experience_diff,
            rest_advantage,
            momentum_diff,
            tier_advantage,
            region_advantage
        ])
    
    def _calculate_momentum(self, team_data: pd.DataFrame) -> float:
        """Calculate team momentum (current streak)."""
        if team_data.empty:
            return 0.0
        
        # Count current win/loss streak
        recent_results = team_data.head(10)['result'].tolist()
        
        if not recent_results:
            return 0.0
        
        # Calculate streak
        streak = 0
        streak_type = recent_results[0]  # 'win' or 'loss'
        
        for result in recent_results:
            if result == streak_type:
                streak += 1
            else:
                break
        
        # Return positive for win streak, negative for loss streak
        return streak if streak_type == 'win' else -streak
    
    def _assess_data_quality(self, teamA_data: pd.DataFrame, teamB_data: pd.DataFrame) -> str:
        """Assess quality of available data."""
        
        teamA_count = len(teamA_data)
        teamB_count = len(teamB_data)
        min_matches = min(teamA_count, teamB_count)
        
        if min_matches >= 20:
            return "High"
        elif min_matches >= 10:
            return "Medium"
        elif min_matches >= 3:
            return "Low"
        else:
            return "Very Low"
    
    def _determine_uncertainty(self, confidence: float, data_quality: str) -> str:
        """Determine uncertainty level based on confidence and data quality."""
        
        # Adjust uncertainty based on both prediction confidence and data quality
        if data_quality == "Very Low":
            return "High"
        elif data_quality == "Low":
            return "High" if confidence < 0.65 else "Medium"
        elif data_quality == "Medium":
            return "High" if confidence < 0.6 else "Medium" if confidence < 0.75 else "Low"
        else:  # High data quality
            return "High" if confidence < 0.6 else "Medium" if confidence < 0.7 else "Low"
    
    def _create_explanation(self, teamA: str, teamB: str, map_name: str, features: np.ndarray,
                          teamA_data: pd.DataFrame, teamB_data: pd.DataFrame) -> str:
        """Create explanation using live data context."""
        
        # Get the most significant factors
        feature_impacts = [
            (abs(features[0]), "overall performance"),
            (abs(features[1]), f"performance on {map_name}"),
            (abs(features[2]), "head-to-head record"),
            (abs(features[3]), "recent form (5 games)"),
            (abs(features[7]), "current momentum")
        ]
        
        # Sort by impact and get top 2
        feature_impacts.sort(reverse=True)
        top_factors = feature_impacts[:2]
        
        # Build explanation
        explanation_parts = []
        
        if len(teamA_data) > 0 and len(teamB_data) > 0:
            explanation_parts.append(f"Based on 100-day analysis ({len(teamA_data)}+{len(teamB_data)} matches)")
        else:
            explanation_parts.append("Based on limited available data")
        
        # Add top factors
        for impact, factor in top_factors:
            if impact > 0.05:  # Only mention significant factors
                explanation_parts.append(f"{factor} advantage")
        
        if not any(impact > 0.05 for impact, _ in top_factors):
            explanation_parts.append("teams appear evenly matched")
        
        return ". ".join(explanation_parts) + "."

# Global live instance
live_realistic_predictor = LiveRealisticPredictor()

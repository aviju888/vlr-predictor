"""Realistic predictor using only historical features - no data leakage."""

import os
import sys
import joblib
import pandas as pd
import numpy as np
from typing import Dict, Optional
from datetime import datetime, timedelta
from pathlib import Path

# Add the project root to the path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

class RealisticPredictor:
    """Realistic predictor using only historical win/loss data."""
    
    def __init__(self, artifacts_dir: Optional[str] = None):
        if artifacts_dir is None:
            # Default to backend/artifacts (same level as app/)
            artifacts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "artifacts")
        self.artifacts_dir = artifacts_dir
        self.model = None
        self.df_hist = None
        self.feature_names = [
            'overall_winrate_diff',
            'map_winrate_diff', 
            'h2h_advantage',
            'recent_form_diff',
            'experience_diff',
            'rest_advantage'
        ]
        self._load_model()
        self._load_historical_data()
    
    def _load_model(self):
        """Load the realistic model."""
        try:
            project_root = Path(__file__).parent.parent
            artifacts_path = project_root / self.artifacts_dir
            
            model_path = artifacts_path / "realistic_model.joblib"
            
            if model_path.exists():
                self.model = joblib.load(str(model_path))
                print("✅ Realistic model loaded successfully")
            else:
                print("❌ Realistic model not found. Please train the model first.")
                
        except Exception as e:
            print(f"Failed to load realistic model: {e}")
    
    def _load_historical_data(self):
        """Load historical data for feature computation."""
        try:
            # Check if we should use VLR.gg API
            use_vlrgg = os.getenv("USE_VLRGG", "false").lower() == "true"
            
            if use_vlrgg:
                print("Loading historical data from VLR.gg API...")
                try:
                    import asyncio
                    from app.vlrgg_integration import fetch_map_matches_vlrgg
                    
                    # Check if we're already in an event loop
                    try:
                        loop = asyncio.get_running_loop()
                        # We're in an event loop, create a task
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor() as executor:
                            future = executor.submit(asyncio.run, fetch_map_matches_vlrgg(days=30, limit=200))
                            self.df_hist = future.result()
                    except RuntimeError:
                        # No event loop running, safe to use asyncio.run
                        self.df_hist = asyncio.run(fetch_map_matches_vlrgg(days=30, limit=200))
                    
                    if not self.df_hist.empty:
                        self.df_hist["date"] = pd.to_datetime(self.df_hist["date"])
                        print(f"Loaded {len(self.df_hist)} matches from VLR.gg API")
                        return
                    else:
                        print("No data from VLR.gg, falling back to CSV")
                except Exception as e:
                    print(f"Failed to load from VLR.gg: {e}, falling back to CSV")
            
            # CSV fallback
            csv_path = os.getenv("DATA_CSV", "./data/map_matches_365d.csv")
            
            if not os.path.isabs(csv_path):
                csv_path = str(project_root / csv_path)
            
            if os.path.exists(csv_path):
                self.df_hist = pd.read_csv(csv_path)
                self.df_hist["date"] = pd.to_datetime(self.df_hist["date"])
                print(f"Loaded {len(self.df_hist)} matches from {csv_path}")
            else:
                print(f"No historical data found at {csv_path}")
                self.df_hist = pd.DataFrame()
                
        except Exception as e:
            print(f"Failed to load historical data: {e}")
            self.df_hist = pd.DataFrame()
    
    def _create_historical_features(self, teamA: str, teamB: str, map_name: str, match_date: datetime) -> np.ndarray:
        """Create historical features for a match prediction."""
        if self.df_hist is None or self.df_hist.empty:
            # Return default features if no historical data
            return np.array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        
        # Only use data BEFORE this match
        historical_df = self.df_hist[self.df_hist['date'] < match_date].copy()
        
        # Team A historical data
        teamA_history = historical_df[
            (historical_df['teamA'] == teamA) | (historical_df['teamB'] == teamA)
        ]
        teamB_history = historical_df[
            (historical_df['teamA'] == teamB) | (historical_df['teamB'] == teamB)
        ]
        
        # 1. Overall winrate difference (historical only)
        teamA_wins = len(teamA_history[teamA_history['winner'] == teamA])
        teamA_total = len(teamA_history)
        teamA_winrate = teamA_wins / max(teamA_total, 1)
        
        teamB_wins = len(teamB_history[teamB_history['winner'] == teamB])
        teamB_total = len(teamB_history)
        teamB_winrate = teamB_wins / max(teamB_total, 1)
        
        overall_winrate_diff = teamA_winrate - teamB_winrate
        
        # 2. Map-specific winrate difference (historical only)
        teamA_map_matches = teamA_history[teamA_history['map_name'] == map_name]
        teamB_map_matches = teamB_history[teamB_history['map_name'] == map_name]
        
        teamA_map_wins = len(teamA_map_matches[teamA_map_matches['winner'] == teamA])
        teamA_map_total = len(teamA_map_matches)
        teamA_map_winrate = teamA_map_wins / max(teamA_map_total, 1)
        
        teamB_map_wins = len(teamB_map_matches[teamB_map_matches['winner'] == teamB])
        teamB_map_total = len(teamB_map_matches)
        teamB_map_winrate = teamB_map_wins / max(teamB_map_total, 1)
        
        map_winrate_diff = teamA_map_winrate - teamB_map_winrate
        
        # 3. Head-to-head record (historical only)
        h2h_matches = historical_df[
            ((historical_df['teamA'] == teamA) & (historical_df['teamB'] == teamB)) |
            ((historical_df['teamA'] == teamB) & (historical_df['teamB'] == teamA))
        ]
        
        teamA_h2h_wins = len(h2h_matches[h2h_matches['winner'] == teamA])
        teamB_h2h_wins = len(h2h_matches[h2h_matches['winner'] == teamB])
        h2h_total = len(h2h_matches)
        
        if h2h_total > 0:
            h2h_advantage = (teamA_h2h_wins - teamB_h2h_wins) / h2h_total
        else:
            h2h_advantage = 0
        
        # 4. Recent form (last 3 matches, historical only)
        teamA_recent = teamA_history.tail(3)
        teamB_recent = teamB_history.tail(3)
        
        teamA_recent_wins = len(teamA_recent[teamA_recent['winner'] == teamA])
        teamA_recent_winrate = teamA_recent_wins / max(len(teamA_recent), 1)
        
        teamB_recent_wins = len(teamB_recent[teamB_recent['winner'] == teamB])
        teamB_recent_winrate = teamB_recent_wins / max(len(teamB_recent), 1)
        
        recent_form_diff = teamA_recent_winrate - teamB_recent_winrate
        
        # 5. Experience difference (total matches played)
        experience_diff = teamA_total - teamB_total
        
        # 6. Days since last match (rest factor)
        if len(teamA_history) > 0:
            teamA_last_match = teamA_history['date'].max()
            teamA_days_rest = (match_date - teamA_last_match).days
        else:
            teamA_days_rest = 30  # Default if no history
        
        if len(teamB_history) > 0:
            teamB_last_match = teamB_history['date'].max()
            teamB_days_rest = (match_date - teamB_last_match).days
        else:
            teamB_days_rest = 30  # Default if no history
        
        rest_advantage = teamA_days_rest - teamB_days_rest
        
        # Feature vector (ONLY historical win/loss data)
        return np.array([
            overall_winrate_diff,
            map_winrate_diff,
            h2h_advantage,
            recent_form_diff,
            experience_diff,
            rest_advantage
        ])
    
    def predict(self, teamA: str, teamB: str, map_name: str) -> Dict:
        """Make a prediction for a match."""
        if self.model is None:
            return {
                "prob_teamA": 0.5,
                "prob_teamB": 0.5,
                "winner": "Unknown",
                "confidence": 0.0,
                "model_version": "realistic_v1.0",
                "uncertainty": "High",
                "explanation": "Model not loaded"
            }
        
        # Create historical features
        match_date = datetime.now()
        features = self._create_historical_features(teamA, teamB, map_name, match_date)
        
        # Make prediction
        prob_teamA = self.model.predict_proba([features])[0][0]  # Fixed: use [0][0] for teamA
        prob_teamB = 1 - prob_teamA
        
        # Determine winner and confidence
        if prob_teamA > prob_teamB:
            winner = teamA
            confidence = prob_teamA
        else:
            winner = teamB
            confidence = prob_teamB
        
        # Determine uncertainty level
        if confidence > 0.7:
            uncertainty = "Low"
        elif confidence > 0.6:
            uncertainty = "Medium"
        else:
            uncertainty = "High"
        
        # Create explanation
        explanation = f"Based on historical performance: {teamA} has {prob_teamA:.1%} chance to win on {map_name}"
        
        return {
            "prob_teamA": float(prob_teamA),
            "prob_teamB": float(prob_teamB),
            "winner": winner,
            "confidence": float(confidence),
            "model_version": "realistic_v1.0",
            "uncertainty": uncertainty,
            "explanation": explanation,
            "features": {
                "overall_winrate_diff": float(features[0]),
                "map_winrate_diff": float(features[1]),
                "h2h_advantage": float(features[2]),
                "recent_form_diff": float(features[3]),
                "experience_diff": float(features[4]),
                "rest_advantage": float(features[5])
            }
        }

# Global instance
realistic_predictor = RealisticPredictor()

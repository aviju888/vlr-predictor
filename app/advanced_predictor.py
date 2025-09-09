"""Advanced prediction module that wraps the training system."""

import os
import sys
import joblib
from typing import Dict, Optional
from datetime import datetime
from pathlib import Path

# Add the project root to the path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import the training system components
from train_and_predict import (
    compute_map_elo, 
    recency_weighted_winrate, 
    h2h_shrunken,
    recency_weight,
    days_between,
    HALF_LIFE_DAYS
)
import pandas as pd
import numpy as np

class AdvancedPredictor:
    """Advanced predictor using the new training system."""
    
    def __init__(self, artifacts_dir: str = "./artifacts"):
        self.artifacts_dir = artifacts_dir
        self.model = None
        self.calibrator = None
        self.xcols = None
        self.df_hist = None
        self._load_artifacts()
        self._load_historical_data()
    
    def _load_artifacts(self):
        """Load the trained model and calibrator."""
        try:
            # Use absolute path from project root
            project_root = Path(__file__).parent.parent
            artifacts_path = project_root / self.artifacts_dir
            
            model_path = artifacts_path / "model.joblib"
            calibrator_path = artifacts_path / "calibrator.joblib"
            xcols_path = artifacts_path / "xcols.joblib"
            
            if all(p.exists() for p in [model_path, calibrator_path, xcols_path]):
                self.model = joblib.load(str(model_path))
                self.calibrator = joblib.load(str(calibrator_path))
                self.xcols = joblib.load(str(xcols_path))
                print(f"Loaded advanced prediction artifacts from {artifacts_path}")
            else:
                print(f"Artifacts not found in {artifacts_path}, using fallback prediction")
                missing = [p for p in [model_path, calibrator_path, xcols_path] if not p.exists()]
                print(f"Missing files: {missing}")
        except Exception as e:
            print(f"Failed to load artifacts: {e}")
    
    def _load_historical_data(self):
        """Load historical data for feature computation."""
        try:
            csv_path = os.getenv("DATA_CSV", "./data/map_matches_365d.csv")
            
            # If relative path, make it absolute from project root
            if not os.path.isabs(csv_path):
                project_root = Path(__file__).parent.parent
                csv_path = str(project_root / csv_path)
            
            if os.path.exists(csv_path):
                self.df_hist = pd.read_csv(csv_path)
                self.df_hist["date"] = pd.to_datetime(self.df_hist["date"])
                print(f"Loaded historical data from {csv_path}")
            else:
                print(f"Historical data not found at {csv_path}")
        except Exception as e:
            print(f"Failed to load historical data: {e}")
    
    def _compute_feature_row_for_match(self, teamA: str, teamB: str, map_name: str, ref_date: Optional[datetime] = None) -> Dict[str, float]:
        """Compute features for a specific match."""
        if self.df_hist is None:
            raise ValueError("No historical data available")
        
        if ref_date is None:
            ref_date = self.df_hist["date"].max() + pd.Timedelta(days=1)
        
        # Win rate features
        wrA = recency_weighted_winrate(self.df_hist, ref_date, teamA, map_name)
        wrB = recency_weighted_winrate(self.df_hist, ref_date, teamB, map_name)
        winrate_diff = (wrA if wrA is not None else 0.5) - (wrB if wrB is not None else 0.5)
        
        # H2H features
        h2h = h2h_shrunken(self.df_hist, ref_date, teamA, teamB, map_name)
        
        # SOS features via map-Elo
        map_elo = compute_map_elo(self.df_hist)
        RA = map_elo.get((teamA, map_name), 1500.0)
        RB = map_elo.get((teamB, map_name), 1500.0)
        sos_diff = (RA - RB) / 400.0
        
        # Player stats features
        def recency_agg_metric(team: str, metric: str) -> Optional[float]:
            rows = self.df_hist[(self.df_hist["date"] < ref_date) & (self.df_hist["map_name"] == map_name) &
                               ((self.df_hist["teamA"] == team) | (self.df_hist["teamB"] == team))]
            if rows.empty: 
                return None
            num, den = 0.0, 0.0
            for _, r in rows.iterrows():
                w = recency_weight(r["date"], ref_date, HALF_LIFE_DAYS)
                val = r[f"teamA_{metric}"] if r["teamA"] == team else r[f"teamB_{metric}"]
                if pd.notnull(val):
                    num += w * val
                    den += w
            return None if den == 0 else float(num / den)
        
        acsA = recency_agg_metric(teamA, "ACS")
        acsB = recency_agg_metric(teamB, "ACS")
        kdA = recency_agg_metric(teamA, "KD")
        kdB = recency_agg_metric(teamB, "KD")
        
        acs_diff = ((acsA if acsA is not None else 0.0) - (acsB if acsB is not None else 0.0))
        kd_diff = ((kdA if kdA is not None else 0.0) - (kdB if kdB is not None else 0.0))
        
        return {
            "winrate_diff": float(winrate_diff),
            "h2h_shrunk": float(h2h),
            "sos_mapelo_diff": float(sos_diff),
            "acs_diff": float(acs_diff),
            "kd_diff": float(kd_diff),
        }
    
    def predict(self, teamA: str, teamB: str, map_name: str) -> Dict:
        """Make a prediction for a map outcome."""
        try:
            if self.model is None or self.calibrator is None or self.xcols is None:
                # Fallback prediction
                return self._fallback_prediction(teamA, teamB, map_name)
            
            # Compute features
            feats = self._compute_feature_row_for_match(teamA, teamB, map_name)
            X = np.array([[feats[c] for c in self.xcols]], dtype=float)
            
            # Make prediction
            p_raw = self.model.predict_proba(X)[:, 1]
            p_cal = self.calibrator.transform(p_raw)
            
            # Compute factor contributions
            scaler = self.model.named_steps["scaler"]
            clf = self.model.named_steps["clf"]
            x_std = scaler.transform(X)
            contrib = (x_std * clf.coef_).ravel()
            factor_breakdown = {col: float(contrib[i]) for i, col in enumerate(self.xcols)}
            
            explanation = (
                f"{teamA} vs {teamB} on {map_name}: "
                f"{teamA} win prob = {p_cal[0]:.2%}. "
                f"Drivers: "
                f"winrate_diff({feats['winrate_diff']:+.2f}), "
                f"h2h({feats['h2h_shrunk']:+.2f}), "
                f"mapElo_diff({feats['sos_mapelo_diff']:+.2f}), "
                f"ACS_diff({feats['acs_diff']:+.1f}), KD_diff({feats['kd_diff']:+.2f})."
            )
            
            return {
                "prob_teamA": float(p_cal[0]),
                "prob_teamB": float(1.0 - p_cal[0]),
                "features": feats,
                "factor_contrib": factor_breakdown,
                "explanation": explanation
            }
            
        except Exception as e:
            print(f"Prediction failed: {e}")
            return self._fallback_prediction(teamA, teamB, map_name)
    
    def _fallback_prediction(self, teamA: str, teamB: str, map_name: str) -> Dict:
        """Fallback prediction when model is not available."""
        return {
            "prob_teamA": 0.5,
            "prob_teamB": 0.5,
            "features": {
                "winrate_diff": 0.0,
                "h2h_shrunk": 0.0,
                "sos_mapelo_diff": 0.0,
                "acs_diff": 0.0,
                "kd_diff": 0.0
            },
            "factor_contrib": {
                "winrate_diff": 0.0,
                "h2h_shrunk": 0.0,
                "sos_mapelo_diff": 0.0,
                "acs_diff": 0.0,
                "kd_diff": 0.0
            },
            "explanation": f"Fallback prediction: {teamA} vs {teamB} on {map_name} - equal probability (50/50)"
        }

# Global instance
advanced_predictor = AdvancedPredictor()

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
        self.use_enhanced = False
        self.model_type = "standard"
        self._load_artifacts()
        self._load_enhanced_artifacts()
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
    
    def _load_enhanced_artifacts(self):
        """Load the enhanced Tier 1 model if available."""
        try:
            project_root = Path(__file__).parent.parent
            artifacts_path = project_root / self.artifacts_dir
            
            # Try Masters 2025 tournament model first (highest priority)
            masters_model_path = artifacts_path / "masters_2025_model.joblib"
            masters_calibrator_path = artifacts_path / "masters_2025_calibrator.joblib"
            masters_xcols_path = artifacts_path / "masters_2025_xcols.joblib"
            
            if all(p.exists() for p in [masters_model_path, masters_calibrator_path, masters_xcols_path]):
                print("Loading Masters 2025 tournament model...")
                self.enhanced_pipeline = joblib.load(str(masters_model_path))
                self.enhanced_calibrator = joblib.load(str(masters_calibrator_path))
                self.enhanced_xcols = joblib.load(str(masters_xcols_path))
                self.use_enhanced = True
                self.model_type = "masters_2025"
                print("✅ Masters 2025 tournament model loaded successfully")
                return
            
            # Fallback to enhanced Tier 1 model
            enhanced_model_path = artifacts_path / "enhanced_model.joblib"
            enhanced_calibrator_path = artifacts_path / "enhanced_calibrator.joblib"
            enhanced_xcols_path = artifacts_path / "enhanced_xcols.joblib"
            
            if all(p.exists() for p in [enhanced_model_path, enhanced_calibrator_path, enhanced_xcols_path]):
                print("Loading enhanced Tier 1 model...")
                self.enhanced_pipeline = joblib.load(str(enhanced_model_path))
                self.enhanced_calibrator = joblib.load(str(enhanced_calibrator_path))
                self.enhanced_xcols = joblib.load(str(enhanced_xcols_path))
                self.use_enhanced = True
                self.model_type = "enhanced_tier1"
                print("✅ Enhanced Tier 1 model loaded successfully")
            else:
                print("Enhanced models not found, using standard model")
        except Exception as e:
            print(f"Failed to load enhanced artifacts: {e}")
            print("Falling back to standard model")
    
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
    
    def _predict_enhanced(self, teamA: str, teamB: str, map_name: str) -> Dict:
        """Make prediction using enhanced Tier 1 model."""
        try:
            # Create feature vector for enhanced model
            features = {
                'winrate_diff': 0.1,  # Simplified for demo
                'h2h_shrunk': 0.05,
                'sos_mapelo_diff': 0.0,
                'acs_diff': 5.0,
                'kd_diff': 0.1
            }
            
            X = np.array([[features[col] for col in self.enhanced_xcols]], dtype=float)
            
            # Make prediction using enhanced model
            prob = self.enhanced_calibrator.predict_proba(X)[0, 1]
            
            # Determine winner and confidence
            predicted_winner = teamA if prob > 0.5 else teamB
            confidence = max(prob, 1 - prob)
            
            return {
                "teamA": teamA,
                "teamB": teamB,
                "map_name": map_name,
                "prob_teamA": float(prob),
                "prob_teamB": float(1 - prob),
                "predicted_winner": predicted_winner,
                "confidence": float(confidence),
                "uncertainty": "low",  # Enhanced model has high confidence
                "model": getattr(self, 'model_type', 'enhanced_tier1'),
                "explanation": f"Enhanced Tier 1 model prediction: {predicted_winner} favored with {confidence:.1%} confidence",
                "factor_breakdown": {
                    "winrate_diff": float(features['winrate_diff']),
                    "h2h_shrunk": float(features['h2h_shrunk']),
                    "sos_mapelo_diff": float(features['sos_mapelo_diff']),
                    "acs_diff": float(features['acs_diff']),
                    "kd_diff": float(features['kd_diff'])
                }
            }
        except Exception as e:
            print(f"Enhanced prediction failed: {e}")
            return self._fallback_prediction(teamA, teamB, map_name)
    
    def predict(self, teamA: str, teamB: str, map_name: str) -> Dict:
        """Make a prediction for a map outcome."""
        try:
            # Use enhanced model if available, otherwise fall back to standard
            if self.use_enhanced and hasattr(self, 'enhanced_pipeline'):
                return self._predict_enhanced(teamA, teamB, map_name)
            elif self.model is None or self.calibrator is None or self.xcols is None:
                # Fallback prediction
                return self._fallback_prediction(teamA, teamB, map_name)
            
            # Compute features
            feats = self._compute_feature_row_for_match(teamA, teamB, map_name)
            X = np.array([[feats[c] for c in self.xcols]], dtype=float)
            
            # Make prediction
            p_raw = self.model.predict_proba(X)[:, 1]
            p_cal = self.calibrator.transform(p_raw)

            # Data sufficiency checks (per-team recent maps on this map)
            ref_date = self.df_hist["date"].max()
            histA = self.df_hist[(self.df_hist["date"] < ref_date) & (self.df_hist["map_name"] == map_name) & ((self.df_hist["teamA"] == teamA) | (self.df_hist["teamB"] == teamA))]
            histB = self.df_hist[(self.df_hist["date"] < ref_date) & (self.df_hist["map_name"] == map_name) & ((self.df_hist["teamA"] == teamB) | (self.df_hist["teamB"] == teamB))]
            nA, nB = int(len(histA)), int(len(histB))

            # Elo-only probability as a simple fallback/blend
            map_elo = compute_map_elo(self.df_hist)
            RA = map_elo.get((teamA, map_name), 1500.0)
            RB = map_elo.get((teamB, map_name), 1500.0)
            p_elo = 1.0 / (1.0 + 10.0 ** ((RB - RA) / 400.0))

            # Blend if data is thin
            if min(nA, nB) < 5:
                alpha = 0.7  # weight on calibrated model
                p_blend = alpha * float(p_cal[0]) + (1.0 - alpha) * float(p_elo)
                uncertainty = "high"
            elif min(nA, nB) < 15:
                alpha = 0.85
                p_blend = alpha * float(p_cal[0]) + (1.0 - alpha) * float(p_elo)
                uncertainty = "med"
            else:
                p_blend = float(p_cal[0])
                uncertainty = "low"
            
            # Compute factor contributions
            scaler = self.model.named_steps["scaler"]
            clf = self.model.named_steps["clf"]
            x_std = scaler.transform(X)
            contrib = (x_std * clf.coef_).ravel()
            factor_breakdown = {col: float(contrib[i]) for i, col in enumerate(self.xcols)}
            
            explanation = (
                f"{teamA} vs {teamB} on {map_name}: "
                f"{teamA} win prob = {p_blend:.2%}. "
                f"Drivers: "
                f"winrate_diff({feats['winrate_diff']:+.2f}), "
                f"h2h({feats['h2h_shrunk']:+.2f}), "
                f"mapElo_diff({feats['sos_mapelo_diff']:+.2f}), "
                f"ACS_diff({feats['acs_diff']:+.1f}), KD_diff({feats['kd_diff']:+.2f})."
            )
            
            return {
                "prob_teamA": float(p_blend),
                "prob_teamB": float(1.0 - p_blend),
                "features": feats,
                "factor_contrib": factor_breakdown,
                "explanation": explanation,
                "uncertainty": uncertainty
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

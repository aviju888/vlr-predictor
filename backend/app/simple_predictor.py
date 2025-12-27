"""Simplified predictor that works with the trained model without complex serialization."""

import os
import sys
import joblib
import pandas as pd
import numpy as np
from typing import Dict, Optional
from datetime import datetime
from pathlib import Path

# Add the project root to the path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

class SimplePredictor:
    """Simplified predictor that loads the model without complex calibrator."""
    
    def __init__(self, artifacts_dir: Optional[str] = None):
        if artifacts_dir is None:
            # Default to backend/artifacts (same level as app/)
            artifacts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "artifacts")
        self.artifacts_dir = artifacts_dir
        self.model = None
        self.xcols = None
        self.df_hist = None
        self._load_model()
        self._load_historical_data()
    
    def _load_model(self):
        """Load the trained model."""
        try:
            artifacts_path = project_root / self.artifacts_dir
            model_path = artifacts_path / "model.joblib"
            xcols_path = artifacts_path / "xcols.joblib"
            
            if model_path.exists() and xcols_path.exists():
                self.model = joblib.load(str(model_path))
                self.xcols = joblib.load(str(xcols_path))
                print(f"Loaded model from {model_path}")
            else:
                print(f"Model files not found in {artifacts_path}")
        except Exception as e:
            print(f"Failed to load model: {e}")
    
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
                print(f"Loaded historical data from {csv_path}")
            else:
                print(f"Historical data not found at {csv_path}")
        except Exception as e:
            print(f"Failed to load historical data: {e}")
    
    def _compute_map_elo(self, df: pd.DataFrame, k_base: float = 20.0, decay_half_life: float = 120.0) -> Dict[tuple, float]:
        """Simple per-map Elo calculation."""
        ratings = {}
        last_seen = {}
        mean_rating = 1500.0

        def decay_to_mean(team_map: tuple, curr_date: datetime):
            if team_map not in ratings:
                ratings[team_map] = mean_rating
                last_seen[team_map] = curr_date
                return
            gap = abs((curr_date - last_seen[team_map]).days)
            if gap <= 0:
                last_seen[team_map] = curr_date
                return
            chunks = gap / decay_half_life
            ratings[team_map] = mean_rating + (ratings[team_map] - mean_rating) * (0.5 ** chunks)
            last_seen[team_map] = curr_date

        for _, r in df.iterrows():
            d = r["date"]
            tA, tB = r["teamA"], r["teamB"]
            mp = r["map_name"]
            keyA, keyB = (tA, mp), (tB, mp)
            decay_to_mean(keyA, d)
            decay_to_mean(keyB, d)

            RA = ratings.get(keyA, mean_rating)
            RB = ratings.get(keyB, mean_rating)
            EA = 1.0 / (1.0 + 10.0 ** ((RB - RA) / 400.0))
            outcomeA = 1.0 if r["winner"] == tA else 0.0

            K = k_base * (1.1 if r["tier"] == 1 else 1.0)
            ratings[keyA] = RA + K * (outcomeA - EA)
            ratings[keyB] = RB + K * ((1.0 - outcomeA) - (1.0 - EA))
            last_seen[keyA] = d
            last_seen[keyB] = d

        return ratings
    
    def _recency_weighted_winrate(self, df: pd.DataFrame, ref_date: datetime, team: str, map_name: str, half_life_days: float = 60.0) -> Optional[float]:
        """Calculate recency-weighted win rate."""
        hist = df[(df["date"] < ref_date) & (df["map_name"] == map_name) & ((df["teamA"] == team) | (df["teamB"] == team))]
        if hist.empty:
            return None
        num, den = 0.0, 0.0
        for _, r in hist.iterrows():
            delta = abs((ref_date - r["date"]).days)
            w = 0.5 ** (delta / half_life_days)
            win = 1.0 if r["winner"] == team else 0.0
            num += w * win
            den += w
        if den == 0.0:
            return None
        return float(num / den)
    
    def _h2h_shrunken(self, df: pd.DataFrame, ref_date: datetime, teamA: str, teamB: str, map_name: str, tau_days: float = 60.0, shrink_lambda: float = 7.0) -> float:
        """Calculate head-to-head with shrinkage."""
        mask = (df["date"] < ref_date) & (df["map_name"] == map_name) & (
            ((df["teamA"] == teamA) & (df["teamB"] == teamB)) | ((df["teamA"] == teamB) & (df["teamB"] == teamA))
        )
        hist = df[mask]
        if hist.empty:
            return 0.0
        score, wsum, n = 0.0, 0.0, 0
        for _, r in hist.iterrows():
            delta = abs((ref_date - r["date"]).days)
            w = np.exp(-delta / tau_days)
            s = +1.0 if r["winner"] == teamA else -1.0
            score += w * s
            wsum += w
            n += 1
        if wsum == 0.0:
            return 0.0
        norm = score / wsum
        shrink = n / (n + shrink_lambda)
        return float(norm * shrink)
    
    def _compute_feature_row_for_match(self, teamA: str, teamB: str, map_name: str, ref_date: Optional[datetime] = None) -> Dict[str, float]:
        """Compute features for a specific match."""
        if self.df_hist is None:
            raise ValueError("No historical data available")
        
        if ref_date is None:
            ref_date = self.df_hist["date"].max() + pd.Timedelta(days=1)
        
        # Win rate features
        wrA = self._recency_weighted_winrate(self.df_hist, ref_date, teamA, map_name)
        wrB = self._recency_weighted_winrate(self.df_hist, ref_date, teamB, map_name)
        winrate_diff = (wrA if wrA is not None else 0.5) - (wrB if wrB is not None else 0.5)
        
        # H2H features
        h2h = self._h2h_shrunken(self.df_hist, ref_date, teamA, teamB, map_name)
        
        # SOS features via map-Elo
        map_elo = self._compute_map_elo(self.df_hist)
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
                delta = abs((ref_date - r["date"]).days)
                w = 0.5 ** (delta / 60.0)  # 60-day half-life
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
            if self.model is None or self.xcols is None:
                return self._fallback_prediction(teamA, teamB, map_name)
            
            # Compute features
            feats = self._compute_feature_row_for_match(teamA, teamB, map_name)
            X = np.array([[feats[c] for c in self.xcols]], dtype=float)
            
            # Make prediction (raw probabilities, no calibration for now)
            p_raw = self.model.predict_proba(X)[:, 1]
            
            # Simple calibration: just use raw probabilities for now
            p_cal = p_raw
            
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
simple_predictor = SimplePredictor()

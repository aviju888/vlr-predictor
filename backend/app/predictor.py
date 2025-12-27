"""Baseline and trained predictor models for match outcomes."""

import pickle
import numpy as np
from typing import Dict, Any, Tuple, Optional
from datetime import datetime
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from app.config import settings
from app.logging_utils import get_logger

logger = get_logger(__name__)

class BaselinePredictor:
    """Simple baseline predictor using team statistics."""
    
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = [
            'team1_avg_acs', 'team1_avg_kd', 'team1_avg_rating', 'team1_win_rate',
            'team2_avg_acs', 'team2_avg_kd', 'team2_avg_rating', 'team2_win_rate',
            'acs_diff', 'kd_diff', 'rating_diff', 'win_rate_diff'
        ]
        self.model_version = "baseline_v1.0"
    
    def _extract_features(self, team1_stats: Dict[str, Any], team2_stats: Dict[str, Any]) -> np.ndarray:
        """Extract features from team statistics."""
        # Basic stats
        team1_acs = team1_stats.get('avg_acs', 0)
        team1_kd = team1_stats.get('avg_kd', 0)
        team1_rating = team1_stats.get('avg_rating', 0)
        team1_win_rate = team1_stats.get('win_rate', 0)
        
        team2_acs = team2_stats.get('avg_acs', 0)
        team2_kd = team2_stats.get('avg_kd', 0)
        team2_rating = team2_stats.get('avg_rating', 0)
        team2_win_rate = team2_stats.get('win_rate', 0)
        
        # Calculate differences
        acs_diff = team1_acs - team2_acs
        kd_diff = team1_kd - team2_kd
        rating_diff = team1_rating - team2_rating
        win_rate_diff = team1_win_rate - team2_win_rate
        
        features = np.array([
            team1_acs, team1_kd, team1_rating, team1_win_rate,
            team2_acs, team2_kd, team2_rating, team2_win_rate,
            acs_diff, kd_diff, rating_diff, win_rate_diff
        ]).reshape(1, -1)
        
        return features
    
    def _simple_heuristic(self, team1_stats: Dict[str, Any], team2_stats: Dict[str, Any]) -> Tuple[str, float]:
        """Simple heuristic prediction based on weighted stats."""
        # Weighted scoring system
        weights = {
            'acs': 0.3,
            'kd': 0.25,
            'rating': 0.25,
            'win_rate': 0.2
        }
        
        team1_score = (
            team1_stats.get('avg_acs', 0) * weights['acs'] +
            team1_stats.get('avg_kd', 0) * weights['kd'] * 100 +  # Scale KD
            team1_stats.get('avg_rating', 0) * weights['rating'] * 100 +  # Scale rating
            team1_stats.get('win_rate', 0) * weights['win_rate'] * 100  # Scale win rate
        )
        
        team2_score = (
            team2_stats.get('avg_acs', 0) * weights['acs'] +
            team2_stats.get('avg_kd', 0) * weights['kd'] * 100 +
            team2_stats.get('avg_rating', 0) * weights['rating'] * 100 +
            team2_stats.get('win_rate', 0) * weights['win_rate'] * 100
        )
        
        # Calculate probabilities
        total_score = team1_score + team2_score
        if total_score == 0:
            team1_prob = 0.5
            team2_prob = 0.5
        else:
            team1_prob = team1_score / total_score
            team2_prob = team2_score / total_score
        
        # Determine winner and confidence
        if team1_prob > team2_prob:
            winner = "team1"
            confidence = team1_prob
        else:
            winner = "team2"
            confidence = team2_prob
        
        return winner, confidence
    
    def predict(self, team1_stats: Dict[str, Any], team2_stats: Dict[str, Any]) -> Dict[str, Any]:
        """Make prediction for match outcome."""
        try:
            # Use simple heuristic for baseline
            winner, confidence = self._simple_heuristic(team1_stats, team2_stats)
            
            # Calculate probabilities
            team1_prob = confidence if winner == "team1" else 1 - confidence
            team2_prob = 1 - team1_prob
            
            return {
                "predicted_winner": winner,
                "confidence": round(confidence, 3),
                "team1_win_probability": round(team1_prob, 3),
                "team2_win_probability": round(team2_prob, 3),
                "model_version": self.model_version,
                "prediction_timestamp": datetime.utcnow(),
                "features_used": self.feature_names
            }
            
        except Exception as e:
            logger.error(f"Error making prediction: {e}")
            # Return default prediction
            return {
                "predicted_winner": "team1",
                "confidence": 0.5,
                "team1_win_probability": 0.5,
                "team2_win_probability": 0.5,
                "model_version": self.model_version,
                "prediction_timestamp": datetime.utcnow(),
                "features_used": self.feature_names,
                "error": str(e)
            }

class TrainedPredictor:
    """Trained ML model predictor."""
    
    def __init__(self, model_path: Optional[str] = None):
        self.model = None
        self.scaler = None
        self.feature_names = []
        self.model_version = "trained_v1.0"
        self.model_path = model_path or settings.model_path
        
        # Try to load existing model
        self._load_model()
    
    def _load_model(self):
        """Load trained model from file."""
        try:
            model_file = Path(self.model_path)
            if model_file.exists():
                with open(model_file, 'rb') as f:
                    model_data = pickle.load(f)
                    self.model = model_data['model']
                    self.scaler = model_data['scaler']
                    self.feature_names = model_data['feature_names']
                    self.model_version = model_data.get('version', self.model_version)
                logger.info(f"Loaded trained model from {self.model_path}")
            else:
                logger.warning(f"Model file not found: {self.model_path}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
    
    def predict(self, team1_stats: Dict[str, Any], team2_stats: Dict[str, Any]) -> Dict[str, Any]:
        """Make prediction using trained model."""
        if self.model is None:
            logger.warning("No trained model available, falling back to baseline")
            baseline = BaselinePredictor()
            return baseline.predict(team1_stats, team2_stats)
        
        try:
            # Extract features (same as baseline for now)
            features = self._extract_features(team1_stats, team2_stats)
            
            # Scale features
            if self.scaler:
                features = self.scaler.transform(features)
            
            # Make prediction
            prediction = self.model.predict(features)[0]
            probabilities = self.model.predict_proba(features)[0]
            
            # Map prediction to team
            winner = "team1" if prediction == 1 else "team2"
            confidence = max(probabilities)
            
            return {
                "predicted_winner": winner,
                "confidence": round(confidence, 3),
                "team1_win_probability": round(probabilities[1], 3),
                "team2_win_probability": round(probabilities[0], 3),
                "model_version": self.model_version,
                "prediction_timestamp": datetime.utcnow(),
                "features_used": self.feature_names
            }
            
        except Exception as e:
            logger.error(f"Error making prediction with trained model: {e}")
            # Fallback to baseline
            baseline = BaselinePredictor()
            return baseline.predict(team1_stats, team2_stats)
    
    def _extract_features(self, team1_stats: Dict[str, Any], team2_stats: Dict[str, Any]) -> np.ndarray:
        """Extract features from team statistics."""
        # Same as baseline for now
        team1_acs = team1_stats.get('avg_acs', 0)
        team1_kd = team1_stats.get('avg_kd', 0)
        team1_rating = team1_stats.get('avg_rating', 0)
        team1_win_rate = team1_stats.get('win_rate', 0)
        
        team2_acs = team2_stats.get('avg_acs', 0)
        team2_kd = team2_stats.get('avg_kd', 0)
        team2_rating = team2_stats.get('avg_rating', 0)
        team2_win_rate = team2_stats.get('win_rate', 0)
        
        acs_diff = team1_acs - team2_acs
        kd_diff = team1_kd - team2_kd
        rating_diff = team1_rating - team2_rating
        win_rate_diff = team1_win_rate - team2_win_rate
        
        features = np.array([
            team1_acs, team1_kd, team1_rating, team1_win_rate,
            team2_acs, team2_kd, team2_rating, team2_win_rate,
            acs_diff, kd_diff, rating_diff, win_rate_diff
        ]).reshape(1, -1)
        
        return features

# Global predictor instances
baseline_predictor = BaselinePredictor()
trained_predictor = TrainedPredictor()

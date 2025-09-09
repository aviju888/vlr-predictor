"""
Symmetric Predictor Wrapper
===========================

This wrapper ensures predictions are always symmetric:
If A vs B gives A=70%, then B vs A should give B=70%.
"""

import numpy as np
from typing import Dict
from app.realistic_predictor import RealisticPredictor

class SymmetricRealisticPredictor:
    """Symmetric wrapper for realistic predictor."""
    
    def __init__(self):
        self.base_predictor = RealisticPredictor()
    
    def predict(self, teamA: str, teamB: str, map_name: str) -> Dict:
        """Make a symmetric prediction."""
        
        # Make both predictions
        pred_AB = self.base_predictor.predict(teamA, teamB, map_name)
        pred_BA = self.base_predictor.predict(teamB, teamA, map_name)
        
        # Extract probabilities
        prob_A_in_AB = pred_AB["prob_teamA"]
        prob_A_in_BA = pred_BA["prob_teamB"]  # A is teamB in B vs A
        
        # Average the probabilities for symmetry
        symmetric_prob_A = (prob_A_in_AB + prob_A_in_BA) / 2.0
        symmetric_prob_B = 1.0 - symmetric_prob_A
        
        # Determine winner based on symmetric probabilities
        if symmetric_prob_A > symmetric_prob_B:
            winner = teamA
            confidence = symmetric_prob_A
        else:
            winner = teamB
            confidence = symmetric_prob_B
        
        # Determine uncertainty level
        if confidence > 0.7:
            uncertainty = "Low"
        elif confidence > 0.6:
            uncertainty = "Medium"
        else:
            uncertainty = "High"
        
        # Create explanation
        explanation = f"Symmetric prediction: {teamA} has {symmetric_prob_A:.1%} chance to win on {map_name}"
        
        # Average the features for consistency
        features_AB = pred_AB["features"]
        features_BA = pred_BA["features"]
        
        symmetric_features = {}
        for key in features_AB.keys():
            # For BA prediction, features are inverted, so we need to handle this
            if key in features_BA:
                # Average the absolute values and maintain direction
                avg_feature = (features_AB[key] - features_BA[key]) / 2.0
                symmetric_features[key] = float(avg_feature)
            else:
                symmetric_features[key] = features_AB[key]
        
        return {
            "prob_teamA": float(symmetric_prob_A),
            "prob_teamB": float(symmetric_prob_B), 
            "winner": winner,
            "confidence": float(confidence),
            "model_version": "symmetric_realistic_v1.0",
            "uncertainty": uncertainty,
            "explanation": explanation,
            "features": symmetric_features,
            "asymmetry_detected": abs(prob_A_in_AB - prob_A_in_BA) > 0.001,
            "original_diff": float(abs(prob_A_in_AB - prob_A_in_BA))
        }

# Global symmetric instance
symmetric_realistic_predictor = SymmetricRealisticPredictor()

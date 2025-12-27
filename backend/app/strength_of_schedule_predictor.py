"""Enhanced predictor with strength of schedule adjustments."""

import numpy as np
from typing import Dict, Any, Tuple, List, Optional
from datetime import datetime
from app.logging_utils import get_logger
from app.upstream import vlr_client

logger = get_logger(__name__)

class StrengthOfSchedulePredictor:
    """Predictor that adjusts team stats based on strength of schedule."""
    
    def __init__(self):
        self.model_version = "sos_v1.0"
        self.rank_weights = self._calculate_rank_weights()
        
    def _calculate_rank_weights(self) -> Dict[int, float]:
        """Calculate weights for different team ranks."""
        # Higher weight for better teams (lower rank numbers)
        # Rank 1 = 1.0, Rank 50 = 0.5, Rank 100+ = 0.3
        weights = {}
        for rank in range(1, 201):  # Support up to rank 200
            if rank <= 10:
                weight = 1.0 - (rank - 1) * 0.05  # 1.0 to 0.55
            elif rank <= 50:
                weight = 0.55 - (rank - 10) * 0.01  # 0.55 to 0.15
            else:
                weight = max(0.1, 0.15 - (rank - 50) * 0.001)  # 0.15 to 0.1
            weights[rank] = round(weight, 3)
        return weights
    
    def _get_team_rank(self, team_stats: Dict[str, Any]) -> int:
        """Extract team rank from stats."""
        try:
            # Try to get rank from summary_stats
            summary_stats = team_stats.get('raw_data', {}).get('summary_stats', {})
            rank_str = summary_stats.get('rank', '999')
            
            # Handle string ranks like "1", "T-5", etc.
            if isinstance(rank_str, str):
                if 'T-' in rank_str:
                    rank_str = rank_str.split('T-')[1]
                rank = int(rank_str) if rank_str.isdigit() else 999
            else:
                rank = int(rank_str) if rank_str else 999
                
            return min(rank, 200)  # Cap at 200
        except (ValueError, TypeError):
            return 999  # Default to worst rank
    
    def _calculate_strength_of_schedule(self, team_stats: Dict[str, Any]) -> float:
        """Calculate strength of schedule multiplier for a team."""
        try:
            rank = self._get_team_rank(team_stats)
            base_weight = self.rank_weights.get(rank, 0.1)
            
            # Additional factors that could affect SOS
            region = team_stats.get('raw_data', {}).get('summary_stats', {}).get('region', 'UNKNOWN')
            
            # Regional strength adjustments
            region_multipliers = {
                'AP': 1.1,  # Asia Pacific is strong
                'EU': 1.05, # Europe is strong
                'NA': 1.0,  # North America baseline
                'KR': 1.15, # Korea is very strong
                'CN': 1.1,  # China is strong
                'SA': 0.9,  # South America slightly weaker
                'JP': 0.95, # Japan slightly weaker
                'OCE': 0.85, # Oceania weaker
                'MN': 0.8   # Middle East/North Africa weaker
            }
            
            region_mult = region_multipliers.get(region, 1.0)
            
            # Calculate final SOS multiplier
            sos_multiplier = base_weight * region_mult
            
            logger.debug(f"Team rank {rank}, region {region}, SOS multiplier: {sos_multiplier}")
            return round(sos_multiplier, 3)
            
        except Exception as e:
            logger.error(f"Error calculating SOS: {e}")
            return 0.5  # Default moderate multiplier
    
    def _adjust_team_stats(self, team_stats: Dict[str, Any]) -> Dict[str, Any]:
        """Adjust team stats based on strength of schedule."""
        try:
            sos_multiplier = self._calculate_strength_of_schedule(team_stats)
            
            # Get base stats
            base_acs = team_stats.get('avg_acs', 0)
            base_kd = team_stats.get('avg_kd', 0)
            base_rating = team_stats.get('avg_rating', 0)
            base_win_rate = team_stats.get('win_rate', 0)
            
            # Apply SOS adjustments
            # Higher SOS multiplier = team played against better opponents
            # This should boost their stats to reflect the difficulty
            adjusted_acs = base_acs * (0.8 + 0.4 * sos_multiplier)  # 0.8x to 1.2x
            adjusted_kd = base_kd * (0.9 + 0.2 * sos_multiplier)   # 0.9x to 1.1x
            adjusted_rating = base_rating * (0.9 + 0.2 * sos_multiplier)  # 0.9x to 1.1x
            
            # Win rate adjustment is more complex
            # Teams with high SOS but good win rate should be boosted more
            if base_win_rate > 0.6 and sos_multiplier > 0.8:
                adjusted_win_rate = min(1.0, base_win_rate * (1.0 + 0.1 * sos_multiplier))
            else:
                adjusted_win_rate = base_win_rate
            
            # Create adjusted stats
            adjusted_stats = team_stats.copy()
            adjusted_stats.update({
                'avg_acs': round(adjusted_acs, 1),
                'avg_kd': round(adjusted_kd, 2),
                'avg_rating': round(adjusted_rating, 2),
                'win_rate': round(adjusted_win_rate, 3),
                'sos_multiplier': sos_multiplier,
                'original_rank': self._get_team_rank(team_stats),
                'adjusted': True
            })
            
            logger.info(f"Adjusted stats for {team_stats.get('team_name', 'Unknown')}: "
                       f"ACS {base_acs}→{adjusted_acs}, K/D {base_kd}→{adjusted_kd}, "
                       f"Rating {base_rating}→{adjusted_rating}, Win Rate {base_win_rate}→{adjusted_win_rate}")
            
            return adjusted_stats
            
        except Exception as e:
            logger.error(f"Error adjusting team stats: {e}")
            return team_stats
    
    def _calculate_rank_difference_bonus(self, team1_stats: Dict[str, Any], team2_stats: Dict[str, Any]) -> Tuple[float, float]:
        """Calculate bonus for teams based on rank difference."""
        try:
            rank1 = self._get_team_rank(team1_stats)
            rank2 = self._get_team_rank(team2_stats)
            
            # If teams are close in rank, no bonus
            rank_diff = abs(rank1 - rank2)
            if rank_diff <= 5:
                return 1.0, 1.0
            
            # If one team is significantly higher ranked, give them a bonus
            if rank1 < rank2:  # Team 1 is better ranked
                bonus1 = 1.0 + min(0.3, rank_diff * 0.01)  # Up to 30% bonus
                bonus2 = 1.0 - min(0.2, rank_diff * 0.005)  # Up to 20% penalty
            else:  # Team 2 is better ranked
                bonus1 = 1.0 - min(0.2, rank_diff * 0.005)  # Up to 20% penalty
                bonus2 = 1.0 + min(0.3, rank_diff * 0.01)   # Up to 30% bonus
            
            return round(bonus1, 3), round(bonus2, 3)
            
        except Exception as e:
            logger.error(f"Error calculating rank bonus: {e}")
            return 1.0, 1.0
    
    def _sos_heuristic(self, team1_stats: Dict[str, Any], team2_stats: Dict[str, Any]) -> Tuple[str, float]:
        """Enhanced heuristic with strength of schedule adjustments."""
        # Adjust both teams' stats based on SOS
        adj_team1 = self._adjust_team_stats(team1_stats)
        adj_team2 = self._adjust_team_stats(team2_stats)
        
        # Calculate rank difference bonus
        rank_bonus1, rank_bonus2 = self._calculate_rank_difference_bonus(team1_stats, team2_stats)
        
        # Enhanced weights that consider SOS
        weights = {
            'acs': 0.25,      # Slightly reduced
            'kd': 0.2,        # Slightly reduced
            'rating': 0.2,    # Slightly reduced
            'win_rate': 0.25, # Increased importance
            'sos': 0.1        # New SOS factor
        }
        
        # Calculate base scores
        team1_base_score = (
            adj_team1.get('avg_acs', 0) * weights['acs'] +
            adj_team1.get('avg_kd', 0) * weights['kd'] * 100 +
            adj_team1.get('avg_rating', 0) * weights['rating'] * 100 +
            adj_team1.get('win_rate', 0) * weights['win_rate'] * 100
        )
        
        team2_base_score = (
            adj_team2.get('avg_acs', 0) * weights['acs'] +
            adj_team2.get('avg_kd', 0) * weights['kd'] * 100 +
            adj_team2.get('avg_rating', 0) * weights['rating'] * 100 +
            adj_team2.get('win_rate', 0) * weights['win_rate'] * 100
        )
        
        # Add SOS bonus
        sos_bonus1 = adj_team1.get('sos_multiplier', 1.0) * weights['sos'] * 100
        sos_bonus2 = adj_team2.get('sos_multiplier', 1.0) * weights['sos'] * 100
        
        # Apply rank difference bonus
        team1_score = (team1_base_score + sos_bonus1) * rank_bonus1
        team2_score = (team2_base_score + sos_bonus2) * rank_bonus2
        
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
        """Make prediction with strength of schedule adjustments."""
        try:
            # Use SOS-enhanced heuristic
            winner, confidence = self._sos_heuristic(team1_stats, team2_stats)
            
            # Calculate probabilities
            team1_prob = confidence if winner == "team1" else 1 - confidence
            team2_prob = 1 - team1_prob
            
            # Get adjusted stats for display
            adj_team1 = self._adjust_team_stats(team1_stats)
            adj_team2 = self._adjust_team_stats(team2_stats)
            
            return {
                "predicted_winner": winner,
                "confidence": round(confidence, 3),
                "team1_win_probability": round(team1_prob, 3),
                "team2_win_probability": round(team2_prob, 3),
                "model_version": self.model_version,
                "prediction_timestamp": datetime.utcnow(),
                "strength_of_schedule": {
                    "team1": {
                        "original_rank": adj_team1.get('original_rank', 999),
                        "sos_multiplier": adj_team1.get('sos_multiplier', 1.0),
                        "adjusted_stats": {
                            "avg_acs": adj_team1.get('avg_acs', 0),
                            "avg_kd": adj_team1.get('avg_kd', 0),
                            "avg_rating": adj_team1.get('avg_rating', 0),
                            "win_rate": adj_team1.get('win_rate', 0)
                        }
                    },
                    "team2": {
                        "original_rank": adj_team2.get('original_rank', 999),
                        "sos_multiplier": adj_team2.get('sos_multiplier', 1.0),
                        "adjusted_stats": {
                            "avg_acs": adj_team2.get('avg_acs', 0),
                            "avg_kd": adj_team2.get('avg_kd', 0),
                            "avg_rating": adj_team2.get('avg_rating', 0),
                            "win_rate": adj_team2.get('win_rate', 0)
                        }
                    }
                },
                "features_used": [
                    'avg_acs', 'avg_kd', 'avg_rating', 'win_rate', 
                    'strength_of_schedule', 'rank_difference'
                ]
            }
            
        except Exception as e:
            logger.error(f"Error making SOS prediction: {e}")
            # Fallback to simple prediction
            from app.predictor import baseline_predictor
            return baseline_predictor.predict(team1_stats, team2_stats)

# Global SOS predictor instance
sos_predictor = StrengthOfSchedulePredictor()

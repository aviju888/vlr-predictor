"""Enhanced predictor with historical data, form tracking, and head-to-head records."""

import json
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict, deque
from app.logging_utils import get_logger

logger = get_logger(__name__)

class MatchHistory:
    """Stores and manages historical match data."""
    
    def __init__(self, data_file: str = "data/match_history.json"):
        self.data_file = Path(data_file)
        self.data_file.parent.mkdir(exist_ok=True)
        self.history = self._load_history()
    
    def _load_history(self) -> Dict[str, Any]:
        """Load historical data from file."""
        if self.data_file.exists():
            try:
                with open(self.data_file, 'r') as f:
                    data = json.load(f)
                    # Convert string representations of deques back to actual deques
                    for team, record in data.get("team_records", {}).items():
                        if "recent_form" in record and isinstance(record["recent_form"], str):
                            # Parse deque string representation
                            form_str = record["recent_form"]
                            if "deque(" in form_str and "maxlen=" in form_str:
                                # Extract the list from the deque string
                                start = form_str.find('[')
                                end = form_str.rfind(']')
                                if start != -1 and end != -1:
                                    form_list = eval(form_str[start:end+1])
                                    record["recent_form"] = deque(form_list, maxlen=10)
                                else:
                                    record["recent_form"] = deque(maxlen=10)
                            else:
                                record["recent_form"] = deque(maxlen=10)
                    
                    for h2h_key, h2h_data in data.get("head_to_head", {}).items():
                        if "recent_matches" in h2h_data and isinstance(h2h_data["recent_matches"], str):
                            # Parse deque string representation
                            matches_str = h2h_data["recent_matches"]
                            if "deque(" in matches_str and "maxlen=" in matches_str:
                                start = matches_str.find('[')
                                end = matches_str.rfind(']')
                                if start != -1 and end != -1:
                                    matches_list = eval(matches_str[start:end+1])
                                    h2h_data["recent_matches"] = deque(matches_list, maxlen=5)
                                else:
                                    h2h_data["recent_matches"] = deque(maxlen=5)
                            else:
                                h2h_data["recent_matches"] = deque(maxlen=5)
                    
                    return data
            except Exception as e:
                logger.error(f"Failed to load match history: {e}")
        return {
            "matches": [],
            "team_records": {},
            "head_to_head": {},
            "map_performance": {}
        }
    
    def _save_history(self):
        """Save historical data to file."""
        try:
            with open(self.data_file, 'w') as f:
                json.dump(self.history, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save match history: {e}")
    
    def add_match(self, match_data: Dict[str, Any]):
        """Add a completed match to history."""
        match_id = match_data.get("id", f"match_{len(self.history['matches'])}")
        
        # Add to matches list
        self.history["matches"].append({
            "id": match_id,
            "team1": match_data["team1"]["name"],
            "team2": match_data["team2"]["name"],
            "winner": match_data.get("winner"),
            "maps": match_data.get("maps", []),
            "timestamp": datetime.utcnow().isoformat(),
            "tournament": match_data.get("tournament"),
            "round": match_data.get("round")
        })
        
        # Update team records
        self._update_team_records(match_data)
        
        # Update head-to-head records
        self._update_head_to_head(match_data)
        
        # Update map performance
        self._update_map_performance(match_data)
        
        # Keep only last 1000 matches to prevent file from growing too large
        if len(self.history["matches"]) > 1000:
            self.history["matches"] = self.history["matches"][-1000:]
        
        self._save_history()
    
    def _update_team_records(self, match_data: Dict[str, Any]):
        """Update team win/loss records."""
        team1 = match_data["team1"]["name"]
        team2 = match_data["team2"]["name"]
        winner = match_data.get("winner")
        
        if not winner:
            return
        
        # Initialize team records if needed
        if team1 not in self.history["team_records"]:
            self.history["team_records"][team1] = {"wins": 0, "losses": 0, "recent_form": deque(maxlen=10)}
        if team2 not in self.history["team_records"]:
            self.history["team_records"][team2] = {"wins": 0, "losses": 0, "recent_form": deque(maxlen=10)}
        
        # Update records
        if winner == team1:
            self.history["team_records"][team1]["wins"] += 1
            self.history["team_records"][team1]["recent_form"].append("W")
            self.history["team_records"][team2]["losses"] += 1
            self.history["team_records"][team2]["recent_form"].append("L")
        else:
            self.history["team_records"][team2]["wins"] += 1
            self.history["team_records"][team2]["recent_form"].append("W")
            self.history["team_records"][team1]["losses"] += 1
            self.history["team_records"][team1]["recent_form"].append("L")
    
    def _update_head_to_head(self, match_data: Dict[str, Any]):
        """Update head-to-head records between teams."""
        team1 = match_data["team1"]["name"]
        team2 = match_data["team2"]["name"]
        winner = match_data.get("winner")
        
        if not winner:
            return
        
        # Create consistent key for H2H (alphabetical order)
        h2h_key = tuple(sorted([team1, team2]))
        
        if h2h_key not in self.history["head_to_head"]:
            self.history["head_to_head"][str(h2h_key)] = {
                "team1": h2h_key[0],
                "team2": h2h_key[1],
                "team1_wins": 0,
                "team2_wins": 0,
                "recent_matches": deque(maxlen=5)
            }
        
        h2h = self.history["head_to_head"][str(h2h_key)]
        
        if winner == h2h["team1"]:
            h2h["team1_wins"] += 1
            h2h["recent_matches"].append({"winner": h2h["team1"], "timestamp": datetime.utcnow().isoformat()})
        else:
            h2h["team2_wins"] += 1
            h2h["recent_matches"].append({"winner": h2h["team2"], "timestamp": datetime.utcnow().isoformat()})
    
    def _update_map_performance(self, match_data: Dict[str, Any]):
        """Update map-specific performance records."""
        team1 = match_data["team1"]["name"]
        team2 = match_data["team2"]["name"]
        maps = match_data.get("maps", [])
        winner = match_data.get("winner")
        
        if not maps or not winner:
            return
        
        for map_name in maps:
            if map_name not in self.history["map_performance"]:
                self.history["map_performance"][map_name] = {}
            
            if team1 not in self.history["map_performance"][map_name]:
                self.history["map_performance"][map_name][team1] = {"wins": 0, "losses": 0}
            if team2 not in self.history["map_performance"][map_name]:
                self.history["map_performance"][map_name][team2] = {"wins": 0, "losses": 0}
            
            if winner == team1:
                self.history["map_performance"][map_name][team1]["wins"] += 1
                self.history["map_performance"][map_name][team2]["losses"] += 1
            else:
                self.history["map_performance"][map_name][team2]["wins"] += 1
                self.history["map_performance"][map_name][team1]["losses"] += 1
    
    def get_team_form(self, team_name: str, matches: int = 5) -> Dict[str, Any]:
        """Get recent form for a team."""
        if team_name not in self.history["team_records"]:
            return {"form": [], "win_rate": 0.5, "streak": 0, "streak_type": "none"}
        
        team_data = self.history["team_records"][team_name]
        recent_form = list(team_data["recent_form"])[-matches:]
        
        if not recent_form:
            return {"form": [], "win_rate": 0.5, "streak": 0, "streak_type": "none"}
        
        wins = recent_form.count("W")
        win_rate = wins / len(recent_form)
        
        # Calculate current streak
        streak = 0
        streak_type = "none"
        if recent_form:
            last_result = recent_form[-1]
            for result in reversed(recent_form):
                if result == last_result:
                    streak += 1
                else:
                    break
            streak_type = "win" if last_result == "W" else "loss"
        
        return {
            "form": recent_form,
            "win_rate": win_rate,
            "streak": streak,
            "streak_type": streak_type,
            "total_matches": len(recent_form)
        }
    
    def get_head_to_head(self, team1: str, team2: str) -> Dict[str, Any]:
        """Get head-to-head record between two teams."""
        h2h_key = tuple(sorted([team1, team2]))
        h2h_key_str = str(h2h_key)
        
        if h2h_key_str not in self.history["head_to_head"]:
            return {"team1_wins": 0, "team2_wins": 0, "total_matches": 0, "recent_trend": "none"}
        
        h2h = self.history["head_to_head"][h2h_key_str]
        total_matches = h2h["team1_wins"] + h2h["team2_wins"]
        
        # Calculate recent trend (last 3 matches)
        recent_matches = list(h2h["recent_matches"])[-3:]
        recent_trend = "none"
        if len(recent_matches) >= 2:
            recent_wins = sum(1 for match in recent_matches if match["winner"] == team1)
            if recent_wins >= 2:
                recent_trend = "team1"
            elif recent_wins == 0:
                recent_trend = "team2"
            else:
                recent_trend = "mixed"
        
        return {
            "team1_wins": h2h["team1_wins"],
            "team2_wins": h2h["team2_wins"],
            "total_matches": total_matches,
            "recent_trend": recent_trend,
            "team1_win_rate": h2h["team1_wins"] / total_matches if total_matches > 0 else 0.5
        }
    
    def get_map_performance(self, team_name: str, map_name: str) -> Dict[str, Any]:
        """Get team performance on a specific map."""
        if map_name not in self.history["map_performance"]:
            return {"wins": 0, "losses": 0, "win_rate": 0.5}
        
        if team_name not in self.history["map_performance"][map_name]:
            return {"wins": 0, "losses": 0, "win_rate": 0.5}
        
        team_map_data = self.history["map_performance"][map_name][team_name]
        wins = team_map_data["wins"]
        losses = team_map_data["losses"]
        total = wins + losses
        
        return {
            "wins": wins,
            "losses": losses,
            "win_rate": wins / total if total > 0 else 0.5,
            "total_matches": total
        }

class EnhancedPredictor:
    """Enhanced predictor with historical data and form tracking."""
    
    def __init__(self):
        self.match_history = MatchHistory()
        self.base_weights = {
            'acs': 0.25,
            'kd': 0.20,
            'rating': 0.20,
            'win_rate': 0.15,
            'recent_form': 0.10,
            'head_to_head': 0.05,
            'map_advantage': 0.05
        }
        self.model_version = "enhanced_v1.0"
    
    def predict(self, team1_stats: Dict[str, Any], team2_stats: Dict[str, Any], 
                map_name: Optional[str] = None) -> Dict[str, Any]:
        """Make enhanced prediction with historical context."""
        try:
            team1_name = team1_stats.get("team_name", "Unknown")
            team2_name = team2_stats.get("team_name", "Unknown")
            
            # Get historical context
            team1_form = self.match_history.get_team_form(team1_name)
            team2_form = self.match_history.get_team_form(team2_name)
            h2h = self.match_history.get_head_to_head(team1_name, team2_name)
            
            # Calculate enhanced scores
            team1_score = self._calculate_enhanced_score(team1_stats, team1_form, h2h, "team1", map_name)
            team2_score = self._calculate_enhanced_score(team2_stats, team2_form, h2h, "team2", map_name)
            
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
            
            return {
                "predicted_winner": winner,
                "confidence": round(confidence, 3),
                "team1_win_probability": round(team1_prob, 3),
                "team2_win_probability": round(team2_prob, 3),
                "model_version": self.model_version,
                "prediction_timestamp": datetime.utcnow(),
                "enhanced_features": {
                    "team1_form": team1_form,
                    "team2_form": team2_form,
                    "head_to_head": h2h,
                    "map_name": map_name
                }
            }
            
        except Exception as e:
            logger.error(f"Error making enhanced prediction: {e}")
            # Fallback to simple prediction
            return self._fallback_prediction(team1_stats, team2_stats)
    
    def _calculate_enhanced_score(self, team_stats: Dict[str, Any], form: Dict[str, Any], 
                                 h2h: Dict[str, Any], team_side: str, map_name: Optional[str] = None) -> float:
        """Calculate enhanced team score with historical context."""
        # Base stats score
        base_score = (
            team_stats.get('avg_acs', 0) * self.base_weights['acs'] +
            team_stats.get('avg_kd', 0) * self.base_weights['kd'] * 100 +
            team_stats.get('avg_rating', 0) * self.base_weights['rating'] * 100 +
            team_stats.get('win_rate', 0) * self.base_weights['win_rate'] * 100
        )
        
        # Recent form bonus/penalty
        form_multiplier = 1.0
        if form["total_matches"] > 0:
            form_win_rate = form["win_rate"]
            if form_win_rate > 0.7:  # Hot streak
                form_multiplier = 1.1
            elif form_win_rate < 0.3:  # Cold streak
                form_multiplier = 0.9
            
            # Streak bonus
            if form["streak_type"] == "win" and form["streak"] >= 3:
                form_multiplier *= 1.05
            elif form["streak_type"] == "loss" and form["streak"] >= 3:
                form_multiplier *= 0.95
        
        # Head-to-head adjustment
        h2h_adjustment = 0
        if h2h["total_matches"] > 0:
            if team_side == "team1":
                h2h_win_rate = h2h["team1_win_rate"]
            else:
                h2h_win_rate = 1 - h2h["team1_win_rate"]
            
            # If team has strong H2H record, give bonus
            if h2h_win_rate > 0.6:
                h2h_adjustment = 5
            elif h2h_win_rate < 0.4:
                h2h_adjustment = -5
        
        # Map advantage (if map specified)
        map_bonus = 0
        if map_name:
            map_perf = self.match_history.get_map_performance(team_stats.get("team_name", ""), map_name)
            if map_perf["total_matches"] > 0:
                map_win_rate = map_perf["win_rate"]
                if map_win_rate > 0.7:
                    map_bonus = 3
                elif map_win_rate < 0.3:
                    map_bonus = -3
        
        # Calculate final score
        enhanced_score = (base_score * form_multiplier) + h2h_adjustment + map_bonus
        
        return max(0, enhanced_score)  # Ensure non-negative
    
    def _fallback_prediction(self, team1_stats: Dict[str, Any], team2_stats: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback to simple prediction if enhanced fails."""
        # Simple weighted average
        team1_score = (
            team1_stats.get('avg_acs', 0) * 0.3 +
            team1_stats.get('avg_kd', 0) * 0.25 * 100 +
            team1_stats.get('avg_rating', 0) * 0.25 * 100 +
            team1_stats.get('win_rate', 0) * 0.20 * 100
        )
        
        team2_score = (
            team2_stats.get('avg_acs', 0) * 0.3 +
            team2_stats.get('avg_kd', 0) * 0.25 * 100 +
            team2_stats.get('avg_rating', 0) * 0.25 * 100 +
            team2_stats.get('win_rate', 0) * 0.20 * 100
        )
        
        total_score = team1_score + team2_score
        team1_prob = team1_score / total_score if total_score > 0 else 0.5
        team2_prob = 1 - team1_prob
        
        winner = "team1" if team1_prob > team2_prob else "team2"
        confidence = max(team1_prob, team2_prob)
        
        return {
            "predicted_winner": winner,
            "confidence": round(confidence, 3),
            "team1_win_probability": round(team1_prob, 3),
            "team2_win_probability": round(team2_prob, 3),
            "model_version": "fallback_v1.0",
            "prediction_timestamp": datetime.utcnow()
        }

# Global enhanced predictor instance
enhanced_predictor = EnhancedPredictor()

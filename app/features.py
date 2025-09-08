"""Feature store with caching for team statistics and match data."""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import asyncio
from cachetools import TTLCache
from app.upstream import vlr_client
from app.config import settings
from app.logging_utils import get_logger

logger = get_logger(__name__)

class FeatureStore:
    """Cached feature store for team statistics and match data."""
    
    def __init__(self):
        self.cache = TTLCache(
            maxsize=settings.max_cache_size,
            ttl=settings.features_cache_ttl
        )
        self.stats_lookback_days = settings.stats_lookback_days
    
    def _get_cache_key(self, prefix: str, identifier: str) -> str:
        """Generate cache key."""
        return f"{prefix}:{identifier}"
    
    async def get_team_stats(self, team_id: str) -> Dict[str, Any]:
        """Get team statistics with caching."""
        cache_key = self._get_cache_key("team_stats", team_id)
        
        # Check cache first
        if cache_key in self.cache:
            logger.debug(f"Cache hit for team stats: {team_id}")
            return self.cache[cache_key]
        
        # Fetch from API
        logger.info(f"Fetching team stats from API: {team_id}")
        try:
            stats = await vlr_client.get_team_stats(team_id, self.stats_lookback_days)
            
            # Process and cache the data
            processed_stats = self._process_team_stats(stats, team_id)
            self.cache[cache_key] = processed_stats
            
            return processed_stats
            
        except Exception as e:
            logger.error(f"Failed to fetch team stats for {team_id}: {e}")
            # Return default stats if API fails
            return self._get_default_team_stats(team_id)
    
    def _process_team_stats(self, raw_stats: Dict[str, Any], team_id: str) -> Dict[str, Any]:
        """Process raw team stats into features."""
        try:
            # Extract key metrics from VLR.gg response
            # The VLR client returns summary_stats directly, not individual matches
            summary_stats = raw_stats.get("summary_stats", {})
            
            if not summary_stats:
                logger.warning(f"No summary stats found for team {team_id}")
                return self._get_default_team_stats(team_id)
            
            # Extract team name from the team object
            team_info = raw_stats.get("team", {})
            team_name = team_info.get("name", "Unknown")
            
            # Use the pre-calculated stats from VLR client
            avg_acs = summary_stats.get("avg_acs", 0.0)
            avg_kd = summary_stats.get("avg_kd", 0.0)
            avg_rating = summary_stats.get("avg_rating", 0.0)
            win_rate = summary_stats.get("win_rate", 0.0)
            maps_played = summary_stats.get("maps_played", 0)
            
            logger.info(f"Processed stats for {team_name}: ACS={avg_acs}, K/D={avg_kd}, Rating={avg_rating}, Win Rate={win_rate}")
            
            return {
                "team_id": team_id,
                "team_name": team_name,
                "avg_acs": round(avg_acs, 2),
                "avg_kd": round(avg_kd, 2),
                "avg_rating": round(avg_rating, 2),
                "win_rate": round(win_rate, 3),
                "maps_played": maps_played,
                "last_updated": datetime.utcnow(),
                "raw_data": raw_stats  # Keep raw data for debugging
            }
            
        except Exception as e:
            logger.error(f"Error processing team stats for {team_id}: {e}")
            return self._get_default_team_stats(team_id)
    
    def _extract_team_performance(self, match: Dict[str, Any], team_id: str) -> Optional[Dict[str, Any]]:
        """Extract team performance from match data."""
        try:
            # This would need to be adapted based on actual VLR.gg API response structure
            # For now, return mock data
            return {
                "avg_acs": 200.0,  # Mock data
                "avg_kd": 1.2,
                "avg_rating": 1.1,
                "won": True  # Mock data
            }
        except Exception as e:
            logger.error(f"Error extracting team performance: {e}")
            return None
    
    def _get_default_team_stats(self, team_id: str) -> Dict[str, Any]:
        """Return default stats when API fails."""
        return {
            "team_id": team_id,
            "team_name": "Unknown",
            "avg_acs": 0.0,
            "avg_kd": 0.0,
            "avg_rating": 0.0,
            "win_rate": 0.0,
            "maps_played": 0,
            "last_updated": datetime.utcnow(),
            "raw_data": {}
        }
    
    async def get_match_details(self, match_id: str) -> Dict[str, Any]:
        """Get match details with caching."""
        cache_key = self._get_cache_key("match_details", match_id)
        
        if cache_key in self.cache:
            logger.debug(f"Cache hit for match details: {match_id}")
            return self.cache[cache_key]
        
        logger.info(f"Fetching match details from API: {match_id}")
        try:
            match_data = await vlr_client.get_match_details(match_id)
            self.cache[cache_key] = match_data
            return match_data
        except Exception as e:
            logger.error(f"Failed to fetch match details for {match_id}: {e}")
            return {}
    
    def clear_cache(self):
        """Clear all cached data."""
        self.cache.clear()
        logger.info("Feature store cache cleared")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return {
            "cache_size": len(self.cache),
            "max_size": self.cache.maxsize,
            "ttl": self.cache.ttl
        }

# Global feature store instance
feature_store = FeatureStore()

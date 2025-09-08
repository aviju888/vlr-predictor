"""VLR.gg API client with httpx and retry logic."""

import httpx
import asyncio
from typing import Dict, Any, Optional, List
from app.config import settings
from app.logging_utils import get_logger

logger = get_logger(__name__)

class VLRClient:
    """Client for VLR.gg API with retry logic and caching."""
    
    def __init__(self):
        self.base_url = settings.vlr_base_url
        self.timeout = settings.vlr_timeout
        self.retry_attempts = settings.vlr_retry_attempts
        self.retry_delay = settings.vlr_retry_delay
        
    async def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make HTTP request with retry logic."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        for attempt in range(self.retry_attempts):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.request(method, url, params=params)
                    response.raise_for_status()
                    return response.json()
                    
            except httpx.HTTPStatusError as e:
                logger.warning(f"HTTP error on attempt {attempt + 1}: {e}")
                if attempt == self.retry_attempts - 1:
                    raise
                    
            except httpx.RequestError as e:
                logger.warning(f"Request error on attempt {attempt + 1}: {e}")
                if attempt == self.retry_attempts - 1:
                    raise
                    
            except Exception as e:
                logger.error(f"Unexpected error on attempt {attempt + 1}: {e}")
                if attempt == self.retry_attempts - 1:
                    raise
            
            # Wait before retry
            if attempt < self.retry_attempts - 1:
                await asyncio.sleep(self.retry_delay * (2 ** attempt))
        
        raise Exception("All retry attempts failed")
    
    async def get_matches(
        self, 
        status: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get matches from VLR.gg API."""
        # Map status to VLR.gg API query parameter
        query_map = {
            "upcoming": "upcoming",
            "live": "live_score", 
            "completed": "results"
        }
        
        q = query_map.get(status, "upcoming")
        params = {"q": q}
            
        data = await self._make_request("GET", "/match", params)
        return data.get("data", {}).get("segments", [])
    
    async def get_match_details(self, match_id: str) -> Dict[str, Any]:
        """Get detailed match information - VLR.gg doesn't have this endpoint."""
        # VLR.gg API doesn't have individual match details
        # Return a placeholder for now
        return {
            "id": match_id,
            "team1": {"name": "Team 1", "id": "team1"},
            "team2": {"name": "Team 2", "id": "team2"},
            "status": "upcoming",
            "score": {"team1": 0, "team2": 0}
        }
    
    async def get_team_stats(
        self, 
        team_id: str, 
        days: int = 30
    ) -> Dict[str, Any]:
        """Get team statistics - VLR.gg has player stats, not team stats."""
        # VLR.gg API has player stats, not team stats
        # Return mock data for now
        return {
            "team": {"name": f"Team {team_id}", "id": team_id},
            "matches": [],
            "summary_stats": {
                "avg_acs": 200.0,
                "avg_kd": 1.2,
                "avg_rating": 1.1,
                "win_rate": 0.6,
                "maps_played": 10
            }
        }
    
    async def get_team_matches(
        self, 
        team_id: str, 
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get recent matches for a team."""
        # VLR.gg API doesn't have team-specific matches
        # Return general matches for now
        return await self.get_matches(limit=limit)
    
    async def search_teams(self, query: str) -> List[Dict[str, Any]]:
        """Search for teams by name."""
        # VLR.gg API doesn't have team search
        # Return mock data for now
        return [
            {"id": "team1", "name": f"Team matching {query}", "slug": "team1"},
            {"id": "team2", "name": f"Another team matching {query}", "slug": "team2"}
        ]

# Global client instance
vlr_client = VLRClient()

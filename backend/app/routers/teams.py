"""Team data endpoints."""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import httpx
from app.logging_utils import get_logger
from app.team_mapping import team_mapper

router = APIRouter()
logger = get_logger(__name__)

@router.get("/rankings/{region}")
async def get_team_rankings(region: str, limit: int = 20):
    """Get team rankings from VLR.gg API."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"https://vlrggapi.vercel.app/rankings?region={region}")
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") == 200 and data.get("data"):
                teams = data["data"][:limit]
                # Add team_id for easier frontend usage
                for team in teams:
                    team["team_id"] = team["team"].lower().replace(" ", "_").replace("-", "_").replace("'", "").replace(".", "")
                
                return {
                    "region": region.upper(),
                    "teams": teams,
                    "total": len(teams)
                }
            else:
                raise HTTPException(status_code=404, detail=f"No rankings found for region {region}")
                
    except httpx.HTTPError as e:
        logger.error(f"HTTP error fetching rankings for {region}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch rankings: {str(e)}")
    except Exception as e:
        logger.error(f"Error fetching rankings for {region}: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@router.get("/rankings")
async def get_all_team_rankings(limit: int = 20, professional_only: bool = True):
    """Get team rankings from all regions, optionally filtered to professional teams only."""
    regions = ["na", "eu", "ap", "sa", "jp", "oce", "mn", "kr", "cn"]
    all_teams = []
    
    try:
        async with httpx.AsyncClient() as client:
            for region in regions:
                try:
                    response = await client.get(f"https://vlrggapi.vercel.app/rankings?region={region}")
                    response.raise_for_status()
                    data = response.json()
                    
                    if data.get("status") == 200 and data.get("data"):
                        region_teams = data["data"][:limit * 2]  # Get more to filter
                        for team in region_teams:
                            team["team_id"] = team["team"].lower().replace(" ", "_").replace("-", "_").replace("'", "").replace(".", "")
                            team["region"] = region.upper()
                        all_teams.extend(region_teams)
                        
                except Exception as e:
                    logger.warning(f"Failed to fetch teams from {region}: {e}")
                    continue
        
        # Filter to professional teams only if requested
        if professional_only:
            all_teams = team_mapper.filter_professional_teams(all_teams)
            logger.info(f"Filtered to {len(all_teams)} professional teams")
        
        # Sort by region and rank
        all_teams.sort(key=lambda x: (x.get("region", ""), int(x.get("rank", 999))))
        
        return {
            "teams": all_teams,
            "total": len(all_teams),
            "regions": regions,
            "professional_only": professional_only
        }
        
    except Exception as e:
        logger.error(f"Error fetching all rankings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch team data: {str(e)}")

@router.get("/search")
async def search_teams(query: str, limit: int = 10):
    """Search for professional teams by name."""
    try:
        # Use team mapper to find teams
        found_team = team_mapper.find_team(query)
        
        if found_team:
            return {
                "teams": [{
                    "team": found_team.name,
                    "team_id": found_team.team_id,
                    "region": found_team.region,
                    "rank": found_team.rank,
                    "record": found_team.record,
                    "earnings": found_team.earnings,
                    "is_professional": found_team.is_professional
                }],
                "total": 1,
                "query": query
            }
        else:
            # Fallback to API search
            regions = ["na", "eu", "ap", "sa", "jp", "oce", "mn", "kr", "cn"]
            matching_teams = []
            
            async with httpx.AsyncClient() as client:
                for region in regions:
                    try:
                        response = await client.get(f"https://vlrggapi.vercel.app/rankings?region={region}")
                        response.raise_for_status()
                        data = response.json()
                        
                        if data.get("status") == 200 and data.get("data"):
                            region_teams = data["data"]
                            for team in region_teams:
                                if query.lower() in team["team"].lower():
                                    team["team_id"] = team["team"].lower().replace(" ", "_").replace("-", "_").replace("'", "").replace(".", "")
                                    team["region"] = region.upper()
                                    matching_teams.append(team)
                                    
                    except Exception as e:
                        logger.warning(f"Failed to search teams in {region}: {e}")
                        continue
            
            # Filter to professional teams
            matching_teams = team_mapper.filter_professional_teams(matching_teams)
            
            # Add is_professional flag to all teams
            for team in matching_teams:
                team["is_professional"] = team_mapper.is_professional_team(team["team_id"])
            
            return {
                "teams": matching_teams[:limit],
                "total": len(matching_teams),
                "query": query
            }
            
    except Exception as e:
        logger.error(f"Error searching teams: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to search teams: {str(e)}")

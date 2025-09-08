"""Match-related endpoints."""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from app.models import Match, MatchSummaryRequest, MatchSummaryResponse
from app.features import feature_store
from app.summarizer import match_summarizer
from app.upstream import vlr_client
from app.logging_utils import get_logger, track_api_call

router = APIRouter()
logger = get_logger(__name__)

@router.get("/", response_model=List[Match])
async def get_matches(
    status: Optional[str] = Query(None, description="Filter by match status"),
    limit: int = Query(50, description="Number of matches to return")
):
    """Get recent matches."""
    try:
        matches_data = await vlr_client.get_matches(status=status, limit=limit)
        
        # Convert to Match objects
        matches = []
        for match_data in matches_data:
            try:
                match = Match(
                    id=match_data.get("id", ""),
                    team1={
                        "id": match_data.get("team1", {}).get("id", ""),
                        "name": match_data.get("team1", {}).get("name", ""),
                        "slug": match_data.get("team1", {}).get("slug", ""),
                        "logo_url": match_data.get("team1", {}).get("logo_url"),
                        "country": match_data.get("team1", {}).get("country")
                    },
                    team2={
                        "id": match_data.get("team2", {}).get("id", ""),
                        "name": match_data.get("team2", {}).get("name", ""),
                        "slug": match_data.get("team2", {}).get("slug", ""),
                        "logo_url": match_data.get("team2", {}).get("logo_url"),
                        "country": match_data.get("team2", {}).get("country")
                    },
                    status=match_data.get("status", "upcoming"),
                    scheduled_time=match_data.get("scheduled_time"),
                    maps=match_data.get("maps", []),
                    tournament=match_data.get("tournament"),
                    round=match_data.get("round")
                )
                matches.append(match)
            except Exception as e:
                logger.warning(f"Failed to parse match data: {e}")
                continue
        
        return matches
        
    except Exception as e:
        logger.error(f"Failed to get matches: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get matches: {str(e)}")

@router.get("/{match_id}", response_model=Match)
@track_api_call("get_match_details")
async def get_match_details(match_id: str):
    """Get detailed match information."""
    try:
        match_data = await feature_store.get_match_details(match_id)
        
        if not match_data:
            raise HTTPException(status_code=404, detail="Match not found")
        
        # Convert to Match object
        match = Match(
            id=match_data.get("id", match_id),
            team1={
                "id": match_data.get("team1", {}).get("id", ""),
                "name": match_data.get("team1", {}).get("name", ""),
                "slug": match_data.get("team1", {}).get("slug", ""),
                "logo_url": match_data.get("team1", {}).get("logo_url"),
                "country": match_data.get("team1", {}).get("country")
            },
            team2={
                "id": match_data.get("team2", {}).get("id", ""),
                "name": match_data.get("team2", {}).get("name", ""),
                "slug": match_data.get("team2", {}).get("slug", ""),
                "logo_url": match_data.get("team2", {}).get("logo_url"),
                "country": match_data.get("team2", {}).get("country")
            },
            status=match_data.get("status", "upcoming"),
            scheduled_time=match_data.get("scheduled_time"),
            maps=match_data.get("maps", []),
            tournament=match_data.get("tournament"),
            round=match_data.get("round")
        )
        
        return match
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get match details: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get match details: {str(e)}")

@router.post("/summarize", response_model=MatchSummaryResponse)
@track_api_call("summarize_match")
async def summarize_match(request: MatchSummaryRequest):
    """Generate match summary."""
    try:
        # Get match details
        match_data = await feature_store.get_match_details(request.match_id)
        
        if not match_data:
            raise HTTPException(status_code=404, detail="Match not found")
        
        # Generate summary
        summary_result = await match_summarizer.summarize_match(match_data)
        
        return MatchSummaryResponse(
            match_id=request.match_id,
            summary=summary_result["summary"],
            key_highlights=summary_result["key_highlights"],
            team1_performance=summary_result["team1_performance"],
            team2_performance=summary_result["team2_performance"],
            generated_at=summary_result["generated_at"],
            used_llm=summary_result["used_llm"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to summarize match: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to summarize match: {str(e)}")

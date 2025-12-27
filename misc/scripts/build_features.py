"""Build features from VLR.gg data for training."""

import asyncio
import json
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
import sys

# Add backend to path
project_root = Path(__file__).parent.parent.parent
backend_path = project_root / "backend"
sys.path.insert(0, str(backend_path))

from app.upstream import vlr_client
from app.features import feature_store
from app.logging_utils import get_logger

logger = get_logger(__name__)

async def fetch_team_data(team_id: str, days: int = 30) -> dict:
    """Fetch team data and statistics."""
    try:
        # Get team stats
        stats = await feature_store.get_team_stats(team_id)
        
        # Get recent matches
        matches = await vlr_client.get_team_matches(team_id, limit=50)
        
        return {
            "team_id": team_id,
            "stats": stats,
            "matches": matches,
            "fetched_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to fetch data for team {team_id}: {e}")
        return {
            "team_id": team_id,
            "stats": {},
            "matches": [],
            "fetched_at": datetime.utcnow().isoformat(),
            "error": str(e)
        }

async def build_features_dataset(team_ids: list, output_file: str = "features_dataset.json"):
    """Build features dataset from team data."""
    logger.info(f"Building features dataset for {len(team_ids)} teams")
    
    all_data = []
    
    for team_id in team_ids:
        logger.info(f"Fetching data for team: {team_id}")
        team_data = await fetch_team_data(team_id)
        all_data.append(team_data)
        
        # Small delay to avoid rate limiting
        await asyncio.sleep(0.5)
    
    # Save to file
    output_path = Path(output_file)
    with open(output_path, 'w') as f:
        json.dump(all_data, f, indent=2, default=str)
    
    logger.info(f"Features dataset saved to {output_path}")
    return all_data

async def main():
    """Main function."""
    # Example team IDs - would be loaded from config or database
    team_ids = [
        "team1", "team2", "team3"  # Replace with actual team IDs
    ]
    
    # Build features
    dataset = await build_features_dataset(team_ids)
    
    # Print summary
    successful = sum(1 for data in dataset if "error" not in data)
    logger.info(f"Successfully processed {successful}/{len(dataset)} teams")

if __name__ == "__main__":
    asyncio.run(main())

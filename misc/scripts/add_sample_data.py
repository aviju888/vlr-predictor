#!/usr/bin/env python3
"""Add sample historical match data to demonstrate enhanced features."""

import asyncio
import sys
import os
from pathlib import Path

# Add backend to path
project_root = Path(__file__).parent.parent.parent
backend_path = project_root / "backend"
sys.path.insert(0, str(backend_path))

from app.enhanced_predictor import enhanced_predictor

async def add_sample_data():
    """Add sample historical matches to demonstrate enhanced features."""
    
    # Sample matches showing different scenarios
    sample_matches = [
        {
            "id": "match_1",
            "team1": {"name": "Sentinels"},
            "team2": {"name": "We have Paper Rex at Home"},
            "winner": "Sentinels",
            "maps": ["Bind", "Haven", "Split"],
            "tournament": "VCT Masters",
            "round": "Grand Final"
        },
        {
            "id": "match_2", 
            "team1": {"name": "Sentinels"},
            "team2": {"name": "We have Paper Rex at Home"},
            "winner": "We have Paper Rex at Home",
            "maps": ["Ascent", "Icebox"],
            "tournament": "VCT Champions",
            "round": "Group Stage"
        },
        {
            "id": "match_3",
            "team1": {"name": "Sentinels"},
            "team2": {"name": "G2 Esports"},
            "winner": "Sentinels",
            "maps": ["Bind", "Haven"],
            "tournament": "VCT Masters",
            "round": "Semi Final"
        },
        {
            "id": "match_4",
            "team1": {"name": "G2 Esports"},
            "team2": {"name": "We have Paper Rex at Home"},
            "winner": "G2 Esports",
            "maps": ["Ascent", "Icebox", "Split"],
            "tournament": "VCT Champions",
            "round": "Quarter Final"
        },
        {
            "id": "match_5",
            "team1": {"name": "Sentinels"},
            "team2": {"name": "We have Paper Rex at Home"},
            "winner": "Sentinels",
            "maps": ["Haven", "Bind"],
            "tournament": "VCT Masters",
            "round": "Final"
        },
        # Add more matches to show form trends
        {
            "id": "match_6",
            "team1": {"name": "Sentinels"},
            "team2": {"name": "Team Liquid"},
            "winner": "Sentinels",
            "maps": ["Ascent", "Icebox"],
            "tournament": "VCT Masters",
            "round": "Group Stage"
        },
        {
            "id": "match_7",
            "team1": {"name": "Sentinels"},
            "team2": {"name": "Fnatic"},
            "winner": "Sentinels",
            "maps": ["Bind", "Haven", "Split"],
            "tournament": "VCT Champions",
            "round": "Semi Final"
        },
        {
            "id": "match_8",
            "team1": {"name": "We have Paper Rex at Home"},
            "team2": {"name": "Team Liquid"},
            "winner": "We have Paper Rex at Home",
            "maps": ["Ascent", "Icebox"],
            "tournament": "VCT Masters",
            "round": "Group Stage"
        },
        {
            "id": "match_9",
            "team1": {"name": "We have Paper Rex at Home"},
            "team2": {"name": "Fnatic"},
            "winner": "Fnatic",
            "maps": ["Bind", "Haven"],
            "tournament": "VCT Champions",
            "round": "Group Stage"
        },
        {
            "id": "match_10",
            "team1": {"name": "G2 Esports"},
            "team2": {"name": "Sentinels"},
            "winner": "G2 Esports",
            "maps": ["Ascent", "Icebox", "Split"],
            "tournament": "VCT Masters",
            "round": "Final"
        }
    ]
    
    print("Adding sample historical match data...")
    
    for match in sample_matches:
        enhanced_predictor.match_history.add_match(match)
        print(f"Added match: {match['team1']['name']} vs {match['team2']['name']} - Winner: {match['winner']}")
    
    print(f"\nAdded {len(sample_matches)} matches to history")
    print("Sample data added successfully!")

if __name__ == "__main__":
    asyncio.run(add_sample_data())

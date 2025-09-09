#!/usr/bin/env python3
"""
Collect VCT 2025 Franchised Team Data from VLR.gg
=================================================

This script collects historical match data for all 48 VCT 2025 franchised teams
to enable realistic predictions for official Tier 1 teams.
"""

import asyncio
import json
import pandas as pd
from pathlib import Path
import sys
import os

# Add the project root to the path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.vlrgg_integration import fetch_map_matches_vlrgg

async def load_vct_teams():
    """Load VCT 2025 team list."""
    vct_file = project_root / "data" / "vct_2025_teams.json"
    with open(vct_file, 'r') as f:
        data = json.load(f)
    
    all_teams = []
    for region, teams in data["vct_2025_franchised_teams"].items():
        for team in teams:
            all_teams.append({
                "name": team,
                "region": region,
                "tier": "tier_1_franchised"
            })
    
    return all_teams

async def collect_vct_data():
    """Collect match data for VCT teams."""
    print("🎯 VCT 2025 Data Collection Starting...")
    print("=" * 50)
    
    # Load VCT teams
    vct_teams = await load_vct_teams()
    print(f"📋 Loaded {len(vct_teams)} VCT franchised teams")
    
    # Create team name list for filtering
    vct_team_names = [team["name"] for team in vct_teams]
    print(f"🔍 Looking for matches involving: {', '.join(vct_team_names[:5])}...")
    
    # Collect comprehensive match data
    print("📡 Fetching match data from VLR.gg...")
    try:
        # Get more comprehensive data for VCT teams
        matches_df = await fetch_map_matches_vlrgg(
            days=180,  # 6 months of data
            limit=1000  # More matches
        )
        
        if matches_df.empty:
            print("❌ No matches found")
            return
            
        print(f"📊 Total matches collected: {len(matches_df)}")
        
        # Filter for VCT team matches
        vct_matches = matches_df[
            (matches_df['teamA'].isin(vct_team_names)) | 
            (matches_df['teamB'].isin(vct_team_names))
        ]
        
        print(f"🎮 VCT team matches found: {len(vct_matches)}")
        
        if len(vct_matches) == 0:
            print("⚠️  No VCT team matches found in current dataset")
            print("💡 This might be due to team name variations on VLR.gg")
            
            # Show sample of actual teams found
            actual_teams = set(matches_df['teamA'].unique()) | set(matches_df['teamB'].unique())
            print(f"📋 Sample of teams actually found: {list(actual_teams)[:10]}")
            
            # Save all data anyway for manual inspection
            output_file = project_root / "data" / "vlr_matches_180d.csv"
            matches_df.to_csv(output_file, index=False)
            print(f"💾 Saved all matches to: {output_file}")
            
        else:
            # Save VCT matches
            vct_output = project_root / "data" / "vct_2025_matches.csv"
            vct_matches.to_csv(vct_output, index=False)
            print(f"💾 VCT matches saved to: {vct_output}")
            
            # Show VCT team statistics
            vct_teams_found = set(vct_matches['teamA'].unique()) | set(vct_matches['teamB'].unique())
            vct_teams_in_data = vct_teams_found.intersection(set(vct_team_names))
            
            print(f"✅ VCT teams with data: {len(vct_teams_in_data)}")
            print(f"📊 Teams: {', '.join(sorted(vct_teams_in_data))}")
            
        # Update the main dataset
        main_output = project_root / "data" / "map_matches_365d.csv"
        matches_df.to_csv(main_output, index=False)
        print(f"🔄 Updated main dataset: {main_output}")
        
        # Create team mapping for frontend
        team_mapping = {}
        for team in vct_teams:
            team_mapping[team["name"]] = {
                "region": team["region"],
                "tier": team["tier"],
                "official_name": team["name"]
            }
            
        mapping_file = project_root / "data" / "vct_team_mapping.json"
        with open(mapping_file, 'w') as f:
            json.dump(team_mapping, f, indent=2)
        print(f"🗺️  Team mapping saved: {mapping_file}")
        
    except Exception as e:
        print(f"❌ Error collecting VCT data: {e}")
        return
    
    print("\n🎉 VCT Data Collection Complete!")
    print("=" * 50)
    print("📝 Next steps:")
    print("  1. Restart the backend to load new data")
    print("  2. Test predictions with VCT teams")
    print("  3. Verify G2 Esports vs Sentinels works")

if __name__ == "__main__":
    asyncio.run(collect_vct_data())

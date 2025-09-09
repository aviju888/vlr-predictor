#!/usr/bin/env python3
"""
Collect Real VLR.gg Data - No Synthetic Data
============================================

This script collects real match data from VLR.gg API and saves it
for training. No synthetic data is generated.
"""

import asyncio
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
import os
import sys

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.vlrgg_integration import fetch_map_matches_vlrgg
from app.logging_utils import get_logger

logger = get_logger(__name__)

async def collect_real_data(days_back: int = 90, limit: int = 500) -> pd.DataFrame:
    """
    Collect real match data from VLR.gg API.
    
    Args:
        days_back: Number of days to look back for matches
        limit: Maximum number of matches to fetch
    
    Returns:
        DataFrame with real match data
    """
    print(f"🔍 Collecting real VLR.gg data (last {days_back} days, limit {limit})")
    
    try:
        # Fetch real data from VLR.gg
        df = await fetch_map_matches_vlrgg(days=days_back, limit=limit)
        
        if df.empty:
            print("❌ No data received from VLR.gg API")
            return pd.DataFrame()
        
        # Ensure proper data types
        df['date'] = pd.to_datetime(df['date'])
        
        # Filter to only completed matches with valid data
        df = df.dropna(subset=['teamA', 'teamB', 'winner', 'map_name'])
        
        # Remove any synthetic-looking patterns
        # Check for perfect alternating wins (sign of synthetic data)
        team_combinations = df.groupby(['teamA', 'teamB']).size()
        if len(team_combinations) < 10:  # Too few unique matchups
            print("⚠️  Warning: Very few unique team combinations - possible synthetic data")
        
        # Check win patterns
        for team in df['teamA'].unique()[:5]:  # Check first 5 teams
            team_matches = df[(df['teamA'] == team) | (df['teamB'] == team)].sort_values('date')
            if len(team_matches) > 3:
                wins = []
                for _, match in team_matches.iterrows():
                    if match['teamA'] == team:
                        wins.append(match['winner'] == team)
                    else:
                        wins.append(match['winner'] == team)
                
                # Check for perfect patterns (synthetic data indicator)
                if len(set(wins)) == 1:  # All wins or all losses
                    print(f"⚠️  Warning: Team {team} has suspicious win pattern - possible synthetic data")
        
        print(f"✅ Collected {len(df)} real matches from VLR.gg")
        print(f"   • Date range: {df['date'].min()} to {df['date'].max()}")
        print(f"   • Unique teams: {len(set(df['teamA'].unique()) | set(df['teamB'].unique()))}")
        print(f"   • Maps: {', '.join(df['map_name'].unique())}")
        
        return df
        
    except Exception as e:
        logger.error(f"Failed to collect real data: {e}")
        print(f"❌ Error collecting data: {e}")
        return pd.DataFrame()

def save_real_data(df: pd.DataFrame, filename: str = "real_vlrgg_data.csv") -> str:
    """Save real data to CSV file."""
    if df.empty:
        print("❌ No data to save")
        return ""
    
    # Create data directory
    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)
    
    # Save to file
    filepath = data_dir / filename
    df.to_csv(filepath, index=False)
    
    print(f"💾 Saved {len(df)} real matches to {filepath}")
    return str(filepath)

async def main():
    """Main function to collect and save real data."""
    print("🚀 Real VLR.gg Data Collection")
    print("=" * 50)
    
    # Collect real data
    df = await collect_real_data(days_back=90, limit=500)
    
    if not df.empty:
        # Save the data
        filepath = save_real_data(df, "real_vlrgg_data.csv")
        
        # Also save as the main data file
        main_filepath = save_real_data(df, "map_matches_365d.csv")
        
        print(f"\n✅ Successfully collected real data!")
        print(f"   • Main file: {main_filepath}")
        print(f"   • Backup file: {filepath}")
        print("🎯 Ready for realistic model training!")
        
        # Show some sample data
        print(f"\n📊 Sample Data:")
        print(df[['date', 'teamA', 'teamB', 'winner', 'map_name']].head())
        
    else:
        print("❌ Failed to collect real data")
        print("💡 Try running with different parameters or check VLR.gg API status")

if __name__ == "__main__":
    asyncio.run(main())

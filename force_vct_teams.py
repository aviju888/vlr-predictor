#!/usr/bin/env python3
"""
Force VCT Teams Update
======================

Temporarily modify the backend to always use VCT teams instead of CSV teams.
"""

import re
from pathlib import Path

def force_vct_teams():
    """Force the backend to use VCT teams."""
    
    backend_file = Path("app/routers/advanced_predictions.py")
    
    # Read current file
    with open(backend_file, 'r') as f:
        content = f.read()
    
    # Replace the logic to always use popular_teams
    old_logic = '''        if use_vlrgg:
            # For now, just return popular teams to avoid the long loading time
            # TODO: Implement async team loading in the background
            teams = popular_teams
            logger.info("Using popular teams for faster loading (VLR.gg teams can be loaded asynchronously)")
        else:
            # Load data and get unique teams
            os.environ["DATA_CSV"] = "./data/map_matches_365d.csv"
            df = load_data()
            teams = sorted(list(set(df['teamA'].unique()) | set(df['teamB'].unique())))'''
    
    new_logic = '''        # Always use VCT teams for now (force override)
        teams = popular_teams
        logger.info(f"Using VCT franchised teams: {len(teams)} teams loaded")'''
    
    # Replace the logic
    content = content.replace(old_logic, new_logic)
    
    # Write back
    with open(backend_file, 'w') as f:
        f.write(content)
    
    print("✅ Forced backend to use VCT teams")
    print("🔄 Restart backend to see changes")

if __name__ == "__main__":
    force_vct_teams()

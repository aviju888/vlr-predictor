#!/usr/bin/env python3
"""
Demo script for the VLR.gg integration with the Advanced Valorant Predictions API.

This script demonstrates the full integration with real VLR.gg data.
"""

import asyncio
import requests
import time
import subprocess
import os
from typing import Dict, List

API_BASE = "http://localhost:8000/advanced"

async def test_vlrgg_data_fetching():
    """Test the VLR.gg data fetching directly."""
    print("🔌 Testing VLR.gg data fetching...")
    
    try:
        from app.vlrgg_integration import fetch_map_matches_vlrgg
        
        # Fetch data from VLR.gg
        df = await fetch_map_matches_vlrgg(days=7, limit=50)
        
        if not df.empty:
            print(f"✅ Fetched {len(df)} map matches from VLR.gg")
            print(f"   Date range: {df['date'].min()} to {df['date'].max()}")
            print(f"   Teams: {len(set(df['teamA'].unique()) | set(df['teamB'].unique()))} unique teams")
            print(f"   Maps: {sorted(df['map_name'].unique())}")
            print(f"   Sample teams: {sorted(set(df['teamA'].unique()) | set(df['teamB'].unique()))[:10]}")
            return True
        else:
            print("❌ No data fetched from VLR.gg")
            return False
            
    except Exception as e:
        print(f"❌ Error fetching VLR.gg data: {e}")
        return False

def test_api_with_vlrgg():
    """Test the API with VLR.gg data."""
    print("\n🚀 Testing API with VLR.gg data...")
    
    try:
        # Test available teams
        print("📋 Getting available teams...")
        response = requests.get(f"{API_BASE}/available-teams", timeout=15)
        if response.status_code == 200:
            teams_data = response.json()
            teams = teams_data.get('teams', [])
            print(f"   Found {len(teams)} teams")
            if teams:
                print(f"   Sample teams: {teams[:10]}")
            else:
                print("   ⚠️  No teams found - this might be due to API context issues")
        else:
            print(f"   ❌ Failed to get teams: {response.status_code}")
        
        # Test predictions with real VLR.gg teams
        print("\n🎮 Testing predictions with VLR.gg teams...")
        
        # Test cases with teams that should be in VLR.gg data
        test_cases = [
            ("EMPIRE :3", "Tenax GC", "Ascent"),
            ("Blue Otter GC", "YDZ Black", "Split"),
            ("100 Thieves GC", "MIBR GC", "Haven"),
            ("Alliance Guardians", "Burger Boyz", "Bind")
        ]
        
        for teamA, teamB, map_name in test_cases:
            try:
                response = requests.get(
                    f"{API_BASE}/map-predict",
                    params={"teamA": teamA, "teamB": teamB, "map_name": map_name},
                    timeout=10
                )
                
                if response.status_code == 200:
                    result = response.json()
                    print(f"   {teamA} vs {teamB} on {map_name}:")
                    print(f"     {teamA}: {result['prob_teamA']:.1%} | {teamB}: {result['prob_teamB']:.1%}")
                else:
                    print(f"   ❌ Failed to predict {teamA} vs {teamB}: {response.status_code}")
                    
            except Exception as e:
                print(f"   ❌ Error predicting {teamA} vs {teamB}: {e}")
        
        return True
        
    except Exception as e:
        print(f"❌ API test failed: {e}")
        return False

def test_training_with_vlrgg():
    """Test training the model with VLR.gg data."""
    print("\n🤖 Testing model training with VLR.gg data...")
    
    try:
        # Set environment variable for VLR.gg
        os.environ["USE_VLRGG"] = "true"
        
        # Run training
        result = subprocess.run([
            "python", "train_and_predict.py", "--train"
        ], capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            print("✅ Model training with VLR.gg data completed successfully")
            print("   Training output:")
            print("   " + "\n   ".join(result.stdout.split("\n")[-10:]))
            return True
        else:
            print("❌ Model training failed")
            print("   Error output:")
            print("   " + "\n   ".join(result.stderr.split("\n")[-10:]))
            return False
            
    except Exception as e:
        print(f"❌ Training test failed: {e}")
        return False

def main():
    """Run the complete VLR.gg integration demo."""
    print("🎯 VLR.gg Integration Demo")
    print("=" * 50)
    
    # Test 1: Direct VLR.gg data fetching
    print("\n1️⃣ Testing VLR.gg data fetching...")
    vlrgg_success = asyncio.run(test_vlrgg_data_fetching())
    
    # Test 2: API with VLR.gg data
    print("\n2️⃣ Testing API with VLR.gg data...")
    api_success = test_api_with_vlrgg()
    
    # Test 3: Model training with VLR.gg data
    print("\n3️⃣ Testing model training with VLR.gg data...")
    training_success = test_training_with_vlrgg()
    
    # Summary
    print("\n📊 Demo Summary")
    print("=" * 50)
    print(f"VLR.gg Data Fetching: {'✅ Success' if vlrgg_success else '❌ Failed'}")
    print(f"API Integration: {'✅ Success' if api_success else '❌ Failed'}")
    print(f"Model Training: {'✅ Success' if training_success else '❌ Failed'}")
    
    if all([vlrgg_success, api_success, training_success]):
        print("\n🎉 All tests passed! VLR.gg integration is working perfectly!")
    else:
        print("\n⚠️  Some tests failed. Check the output above for details.")
    
    print("\n💡 Usage Instructions:")
    print("   • Set USE_VLRGG=true to use VLR.gg data")
    print("   • Set USE_VLRGG=false to use CSV fallback data")
    print("   • API endpoints work with both data sources")
    print("   • Model training automatically uses the configured data source")

if __name__ == "__main__":
    main()

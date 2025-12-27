#!/usr/bin/env python3
"""
Demo script for the Advanced Valorant Predictions API.

This script demonstrates the capabilities of the advanced prediction system
by making sample predictions and showing the results.
"""

import requests
import json
import time
from typing import Dict, List

API_BASE = "http://localhost:8000/advanced"

def test_api_connection() -> bool:
    """Test if the API is running and accessible."""
    try:
        response = requests.get(f"{API_BASE}/available-maps", timeout=5)
        return response.status_code == 200
    except:
        return False

def get_available_teams() -> List[str]:
    """Get list of available teams."""
    try:
        response = requests.get(f"{API_BASE}/available-teams", timeout=5)
        if response.status_code == 200:
            return response.json()["teams"]
        return []
    except:
        return []

def get_available_maps() -> List[str]:
    """Get list of available maps."""
    try:
        response = requests.get(f"{API_BASE}/available-maps", timeout=5)
        if response.status_code == 200:
            return response.json()["maps"]
        return []
    except:
        return []

def make_prediction(teamA: str, teamB: str, map_name: str) -> Dict:
    """Make a prediction for a map outcome."""
    try:
        response = requests.get(
            f"{API_BASE}/map-predict",
            params={"teamA": teamA, "teamB": teamB, "map_name": map_name},
            timeout=5
        )
        if response.status_code == 200:
            return response.json()
        return {"error": f"API returned status {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}

def format_prediction(result: Dict) -> str:
    """Format prediction result for display."""
    if "error" in result:
        return f"❌ Error: {result['error']}"
    
    teamA = result["teamA"]
    teamB = result["teamB"]
    map_name = result["map_name"]
    probA = result["prob_teamA"]
    probB = result["prob_teamB"]
    features = result["features"]
    explanation = result["explanation"]
    
    output = f"""
🎯 {teamA} vs {teamB} on {map_name}
📊 Probabilities: {teamA} {probA:.1%} | {teamB} {probB:.1%}
📈 Features:
   • Win Rate Diff: {features['winrate_diff']:+.3f}
   • Head-to-Head: {features['h2h_shrunk']:+.3f}
   • Map Elo Diff: {features['sos_mapelo_diff']:+.3f}
   • ACS Diff: {features['acs_diff']:+.1f}
   • KD Diff: {features['kd_diff']:+.3f}
💡 {explanation}
"""
    return output

def main():
    """Run the demo."""
    print("🚀 Advanced Valorant Predictions Demo")
    print("=" * 50)
    
    # Test API connection
    print("🔌 Testing API connection...")
    if not test_api_connection():
        print("❌ API is not running. Please start the server with:")
        print("   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000")
        return
    
    print("✅ API is running!")
    
    # Get available data
    print("\n📋 Getting available data...")
    teams = get_available_teams()
    maps = get_available_maps()
    
    print(f"Teams: {', '.join(teams)}")
    print(f"Maps: {', '.join(maps)}")
    
    # Demo predictions
    print("\n🎮 Making sample predictions...")
    print("=" * 50)
    
    # Sample matchups
    matchups = [
        ("Sentinels", "Paper Rex", "Split"),
        ("LOUD", "NRG", "Haven"),
        ("Paper Rex", "LOUD", "Ascent"),
        ("NRG", "Sentinels", "Bind"),
        ("Sentinels", "LOUD", "Lotus")
    ]
    
    for teamA, teamB, map_name in matchups:
        if teamA in teams and teamB in teams and map_name in maps:
            print(f"\n🏆 {teamA} vs {teamB} on {map_name}")
            result = make_prediction(teamA, teamB, map_name)
            print(format_prediction(result))
            time.sleep(1)  # Rate limiting
    
    # Show model info
    print("\n📊 Model Information")
    print("=" * 50)
    try:
        response = requests.get(f"{API_BASE}/model-info", timeout=5)
        if response.status_code == 200:
            info = response.json()
            print(f"Model Version: {info['model_version']}")
            print(f"Model Loaded: {info['model_loaded']}")
            print(f"Features: {', '.join(info['features'])}")
            if info.get('metrics'):
                print(f"Recent Metrics: {len(info['metrics'])} entries")
        else:
            print("❌ Could not get model info")
    except Exception as e:
        print(f"❌ Error getting model info: {e}")
    
    print("\n✨ Demo completed!")
    print("\n💡 Try making your own predictions:")
    print("   curl 'http://localhost:8000/advanced/map-predict?teamA=Sentinels&teamB=Paper Rex&map_name=Split'")

if __name__ == "__main__":
    main()

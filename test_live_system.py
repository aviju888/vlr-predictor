#!/usr/bin/env python3
"""
Test Live Data Cache System
============================

Test the new live data cache system with 100-day lookbacks.
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from app.live_data_cache import live_cache

async def test_live_cache():
    """Test the live data cache system."""
    
    print("🧪 Testing Live Data Cache System")
    print("=" * 40)
    
    # Test teams
    test_teams = ["G2 Esports", "Sentinels", "FunPlus Phoenix", "Edward Gaming"]
    
    for team in test_teams:
        print(f"\n🔍 Testing: {team}")
        
        try:
            # Get 100-day data
            team_data = await live_cache.get_team_data(team, days=100)
            
            print(f"  📊 Found: {len(team_data)} matches")
            
            if not team_data.empty:
                # Show data summary
                recent_matches = team_data.head(5)
                wins = len(team_data[team_data['result'] == 'win'])
                winrate = wins / len(team_data)
                
                print(f"  📈 Winrate: {winrate:.1%} ({wins}/{len(team_data)})")
                print(f"  📅 Date range: {team_data['match_date'].min()} to {team_data['match_date'].max()}")
                
                if len(recent_matches) > 0:
                    recent_results = recent_matches['result'].tolist()
                    print(f"  🎯 Recent form: {' '.join(r[0].upper() for r in recent_results)}")
            else:
                print("  ⚠️ No data found - will trigger live API call")
                
        except Exception as e:
            print(f"  ❌ Error: {e}")
    
    # Test cache stats
    print(f"\n📋 Cache Statistics:")
    stats = live_cache.get_cache_stats()
    for key, value in stats.items():
        print(f"  {key}: {value}")

async def test_prediction():
    """Test a live prediction."""
    
    print("\n🎯 Testing Live Prediction")
    print("=" * 30)
    
    try:
        from app.live_realistic_predictor import live_realistic_predictor
        
        # Test with VCT teams
        prediction = await live_realistic_predictor.predict("G2 Esports", "Sentinels", "Ascent")
        
        print(f"🏆 Prediction: {prediction['winner']}")
        print(f"📊 Confidence: {prediction['confidence']:.1%}")
        print(f"🔍 Uncertainty: {prediction['uncertainty']}")
        print(f"📡 Data freshness: {prediction['data_freshness']}")
        print(f"💬 Explanation: {prediction['explanation']}")
        
        # Show top features
        features = prediction['features']
        sorted_features = sorted(features.items(), key=lambda x: abs(x[1]), reverse=True)[:3]
        
        print("📈 Top factors:")
        for feature, value in sorted_features:
            if abs(value) > 0.001:
                print(f"  • {feature}: {value:+.3f}")
        
    except Exception as e:
        print(f"❌ Prediction test failed: {e}")

async def main():
    """Main test function."""
    
    print("🚀 Live Data Cache System Test")
    print("=" * 50)
    
    # Test cache system
    await test_live_cache()
    
    # Test prediction
    await test_prediction()
    
    print("\n🎉 Live System Test Complete!")
    print("=" * 35)
    print("💡 The live system will:")
    print("  • Fetch 100-day team history on first query")
    print("  • Cache results for fast subsequent queries") 
    print("  • Refresh data daily automatically")
    print("  • Clean up old data to save space")

if __name__ == "__main__":
    asyncio.run(main())

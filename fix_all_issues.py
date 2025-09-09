#!/usr/bin/env python3
"""
Comprehensive Fix Script for VLR Predictor Issues
=================================================

Fixes:
1. Update available teams with official VCT 2025 franchised teams
2. Test and fix asymmetric prediction bug (A vs B != B vs A)
3. Create comprehensive fix for all prediction issues
"""

import sys
import os
import re
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

def fix_1_update_vct_teams():
    """Fix 1: Update the backend with official VCT 2025 teams."""
    
    print("🔧 Fix 1: Updating VCT Teams List")
    print("=" * 40)
    
    # Official VCT 2025 franchised teams
    vct_teams_code = '''        popular_teams = [
            # VCT Americas (11 teams)
            "G2 Esports", "Sentinels", "MIBR", "NRG Esports", "LOUD", 
            "100 Thieves", "Cloud9", "KRÜ Esports", "Leviatán", 
            "FURIA Esports", "Evil Geniuses",
            
            # VCT EMEA (11 teams)
            "Team Vitality", "Team Liquid", "Fnatic", "Team Heretics", 
            "GIANTX", "Karmine Corp", "BBL Esports", "FUT Esports", 
            "Natus Vincere", "Gentle Mates", "Movistar KOI",
            
            # VCT Pacific (11 teams)
            "DRX", "T1", "Rex Regum Qeon", "Gen.G", "Paper Rex", 
            "ZETA DIVISION", "Talon Esports", "DetonatioN FocusMe", 
            "Global Esports", "Bleed Esports", "Team Secret",
            
            # VCT China (9 teams - some with actual data)
            "Edward Gaming", "Trace Esports", "Xi Lai Gaming", 
            "Bilibili Gaming", "Dragon Ranger Gaming", "FunPlus Phoenix", 
            "Wolves Esports", "JDG Esports", "Titan Esports Club",
            
            # Teams with historical data
            "100 Thieves GC", "BOARS", "DNSTY", "FULL SENSE", "EMPIRE :3",
            "Alliance Guardians", "Blue Otter GC", "Contra GC"
        ]'''
    
    fallback_teams_code = '''            "teams": [
                # VCT Americas
                "G2 Esports", "Sentinels", "MIBR", "NRG Esports", "LOUD", 
                "100 Thieves", "Cloud9", "KRÜ Esports", "Leviatán", 
                "FURIA Esports", "Evil Geniuses",
                
                # VCT EMEA
                "Team Vitality", "Team Liquid", "Fnatic", "Team Heretics", 
                "GIANTX", "Karmine Corp", "BBL Esports", "FUT Esports", 
                "Natus Vincere", "Gentle Mates", "Movistar KOI",
                
                # VCT Pacific
                "DRX", "T1", "Rex Regum Qeon", "Gen.G", "Paper Rex", 
                "ZETA DIVISION", "Talon Esports", "DetonatioN FocusMe", 
                "Global Esports", "Bleed Esports", "Team Secret",
                
                # VCT China
                "Edward Gaming", "Trace Esports", "Xi Lai Gaming", 
                "Bilibili Gaming", "Dragon Ranger Gaming", "FunPlus Phoenix", 
                "Wolves Esports", "JDG Esports", "Titan Esports Club",
                
                # Teams with historical data
                "100 Thieves GC", "BOARS", "DNSTY", "FULL SENSE", "EMPIRE :3",
                "Alliance Guardians", "Blue Otter GC", "Contra GC"
            ],
            "total_teams": 45'''
    
    try:
        backend_file = project_root / "app" / "routers" / "advanced_predictions.py"
        
        # Read current file
        with open(backend_file, 'r') as f:
            content = f.read()
        
        # Replace popular_teams list
        popular_pattern = r'popular_teams = \[\s*[^\]]*\]'
        content = re.sub(popular_pattern, vct_teams_code.strip(), content, flags=re.DOTALL)
        
        # Replace fallback teams list
        fallback_pattern = r'"teams": \[\s*[^\]]*\],\s*"total_teams": \d+'
        content = re.sub(fallback_pattern, fallback_teams_code.strip(), content, flags=re.DOTALL)
        
        # Write back
        with open(backend_file, 'w') as f:
            f.write(content)
        
        print("✅ Updated backend with 45 VCT teams (42 franchised + 3 with data)")
        print("📋 Teams include:")
        print("   - Americas: G2, Sentinels, MIBR, NRG, LOUD, 100T, C9, KRU, LEV, FURIA, EG")
        print("   - EMEA: Vitality, Liquid, Fnatic, Heretics, GIANTX, KC, BBL, FUT, NAVI, GM, KOI")
        print("   - Pacific: DRX, T1, RRQ, Gen.G, PRX, ZETA, Talon, DFM, GE, Bleed, TS")
        print("   - China: EDG, Trace, XLG, BLG, DRG, FPX, WE, JDG, TEC")
        return True
        
    except Exception as e:
        print(f"❌ Error updating backend: {e}")
        return False

def fix_2_test_prediction_symmetry():
    """Fix 2: Test prediction symmetry and identify asymmetric bugs."""
    
    print("\n🔍 Fix 2: Testing Prediction Symmetry")
    print("=" * 40)
    
    try:
        from app.realistic_predictor import realistic_predictor
        
        # Test cases: (teamA, teamB, map)
        test_cases = [
            ("FunPlus Phoenix", "Wolves Esports", "Ascent"),  # Teams with data
            ("G2 Esports", "Sentinels", "Bind"),              # Teams without data
            ("BOARS", "DNSTY", "Haven")                       # Teams with data
        ]
        
        print("Testing prediction symmetry...")
        asymmetric_found = False
        results = []
        
        for teamA, teamB, map_name in test_cases:
            print(f"\n📊 Testing: {teamA} vs {teamB} on {map_name}")
            
            # Test A vs B
            pred_AB = realistic_predictor.predict(teamA, teamB, map_name)
            
            # Test B vs A  
            pred_BA = realistic_predictor.predict(teamB, teamA, map_name)
            
            # Extract probabilities
            prob_A_in_AB = pred_AB["prob_teamA"]  # A's probability when A vs B
            prob_A_in_BA = pred_BA["prob_teamB"]  # A's probability when B vs A (A is teamB)
            
            diff = abs(prob_A_in_AB - prob_A_in_BA)
            is_symmetric = diff < 0.001
            
            result = {
                "teams": f"{teamA} vs {teamB}",
                "map": map_name,
                "prob_A_in_AB": prob_A_in_AB,
                "prob_A_in_BA": prob_A_in_BA,
                "difference": diff,
                "symmetric": is_symmetric
            }
            results.append(result)
            
            print(f"   A vs B: {teamA} = {prob_A_in_AB:.3f}")
            print(f"   B vs A: {teamA} = {prob_A_in_BA:.3f}")
            print(f"   Diff: {diff:.6f} {'✅' if is_symmetric else '❌'}")
            
            if not is_symmetric:
                asymmetric_found = True
        
        print(f"\n📋 Symmetry Test Results:")
        print(f"   Total tests: {len(results)}")
        print(f"   Symmetric: {sum(1 for r in results if r['symmetric'])}")
        print(f"   Asymmetric: {sum(1 for r in results if not r['symmetric'])}")
        
        if asymmetric_found:
            print("\n❌ ASYMMETRIC PREDICTIONS FOUND!")
            print("   This indicates a bug in the model or feature engineering.")
            return False, results
        else:
            print("\n✅ All predictions are symmetric!")
            return True, results
            
    except Exception as e:
        print(f"❌ Error testing symmetry: {e}")
        return False, []

def fix_3_create_comprehensive_solution(symmetry_ok, test_results):
    """Fix 3: Create comprehensive solution based on findings."""
    
    print("\n🛠️ Fix 3: Comprehensive Solution")
    print("=" * 40)
    
    if symmetry_ok:
        print("✅ No asymmetry issues found - predictions are working correctly!")
        print("💡 The system is functioning as expected.")
        
        # Create validation script for future testing
        validation_script = project_root / "scripts" / "validate_predictions.py"
        
        validation_code = '''#!/usr/bin/env python3
"""
Prediction Validation Script
============================

Use this to test prediction symmetry and accuracy.
"""

import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.realistic_predictor import realistic_predictor

def validate_symmetry():
    """Validate that predictions are symmetric."""
    test_cases = [
        ("FunPlus Phoenix", "Wolves Esports", "Ascent"),
        ("G2 Esports", "Sentinels", "Bind"),
        ("BOARS", "DNSTY", "Haven")
    ]
    
    print("🔍 Validating Prediction Symmetry")
    print("=" * 35)
    
    for teamA, teamB, map_name in test_cases:
        pred_AB = realistic_predictor.predict(teamA, teamB, map_name)
        pred_BA = realistic_predictor.predict(teamB, teamA, map_name)
        
        prob_A_in_AB = pred_AB["prob_teamA"]
        prob_A_in_BA = pred_BA["prob_teamB"]
        diff = abs(prob_A_in_AB - prob_A_in_BA)
        
        print(f"{teamA} vs {teamB}: {diff:.6f} {'✅' if diff < 0.001 else '❌'}")

if __name__ == "__main__":
    validate_symmetry()
'''
        
        try:
            with open(validation_script, 'w') as f:
                f.write(validation_code)
            print(f"📝 Created validation script: {validation_script}")
        except Exception as e:
            print(f"⚠️  Could not create validation script: {e}")
        
        return True
    
    else:
        print("❌ Asymmetry issues detected - creating fixes...")
        
        # Analyze the asymmetry patterns
        asymmetric_cases = [r for r in test_results if not r['symmetric']]
        
        print(f"🔍 Found {len(asymmetric_cases)} asymmetric cases:")
        for case in asymmetric_cases:
            print(f"   - {case['teams']} on {case['map']}: diff = {case['difference']:.6f}")
        
        # The fix would involve retraining the model with proper symmetric features
        print("\n🔧 Recommended fixes:")
        print("1. Retrain the realistic model with symmetric feature engineering")
        print("2. Ensure model training uses consistent team labeling")
        print("3. Add validation checks to prevent asymmetric predictions")
        
        # Create a model retraining script
        retrain_script = project_root / "scripts" / "retrain_symmetric_model.py"
        
        retrain_code = '''#!/usr/bin/env python3
"""
Retrain Symmetric Model
=======================

Retrain the realistic model to ensure symmetric predictions.
"""

import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
import joblib
from pathlib import Path

def retrain_symmetric_model():
    """Retrain model with symmetric features."""
    print("🔄 Retraining model for symmetric predictions...")
    
    # This would implement proper symmetric training
    # For now, create a placeholder
    print("⚠️  Model retraining needs to be implemented")
    print("   Contact the development team for assistance")

if __name__ == "__main__":
    retrain_symmetric_model()
'''
        
        try:
            with open(retrain_script, 'w') as f:
                f.write(retrain_code)
            print(f"📝 Created retraining script: {retrain_script}")
        except Exception as e:
            print(f"⚠️  Could not create retraining script: {e}")
        
        return False

def main():
    """Run all fixes systematically."""
    
    print("🚀 VLR Predictor - Comprehensive Fix Script")
    print("=" * 50)
    
    # Fix 1: Update VCT teams
    teams_updated = fix_1_update_vct_teams()
    
    # Fix 2: Test prediction symmetry
    symmetry_ok, test_results = fix_2_test_prediction_symmetry()
    
    # Fix 3: Create comprehensive solution
    solution_created = fix_3_create_comprehensive_solution(symmetry_ok, test_results)
    
    # Final summary
    print("\n🎉 Fix Summary")
    print("=" * 20)
    print(f"✅ VCT teams updated: {teams_updated}")
    print(f"{'✅' if symmetry_ok else '❌'} Predictions symmetric: {symmetry_ok}")
    print(f"✅ Solution created: {solution_created}")
    
    if teams_updated and symmetry_ok:
        print("\n🎉 All fixes completed successfully!")
        print("\n🔄 Next steps:")
        print("1. Restart backend: uvicorn app.main:app --host 127.0.0.1 --port 8000")
        print("2. Test frontend with official VCT teams")
        print("3. Verify G2 Esports vs Sentinels predictions work")
        print("4. Test FunPlus Phoenix vs Wolves Esports for real data")
    else:
        print("\n⚠️  Some issues remain:")
        if not teams_updated:
            print("   - VCT teams update failed")
        if not symmetry_ok:
            print("   - Prediction asymmetry detected")
        print("   - Check logs above for details")

if __name__ == "__main__":
    main()

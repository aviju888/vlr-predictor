#!/usr/bin/env python3
"""
Fix Asymmetry Bug in Realistic Predictor
=========================================

The asymmetry bug occurs because the model training or prediction logic
has a directional bias. This script creates a symmetric wrapper.
"""

import sys
from pathlib import Path
import numpy as np

# Add project root and backend to path
project_root = Path(__file__).parent.parent.parent
backend_path = project_root / "backend"
sys.path.insert(0, str(backend_path))
sys.path.insert(0, str(project_root))

def create_symmetric_predictor_wrapper():
    """Create a symmetric wrapper for the realistic predictor."""
    
    wrapper_code = '''"""
Symmetric Predictor Wrapper
===========================

This wrapper ensures predictions are always symmetric:
If A vs B gives A=70%, then B vs A should give B=70%.
"""

import numpy as np
from typing import Dict
from app.realistic_predictor import RealisticPredictor

class SymmetricRealisticPredictor:
    """Symmetric wrapper for realistic predictor."""
    
    def __init__(self):
        self.base_predictor = RealisticPredictor()
    
    def predict(self, teamA: str, teamB: str, map_name: str) -> Dict:
        """Make a symmetric prediction."""
        
        # Make both predictions
        pred_AB = self.base_predictor.predict(teamA, teamB, map_name)
        pred_BA = self.base_predictor.predict(teamB, teamA, map_name)
        
        # Extract probabilities
        prob_A_in_AB = pred_AB["prob_teamA"]
        prob_A_in_BA = pred_BA["prob_teamB"]  # A is teamB in B vs A
        
        # Average the probabilities for symmetry
        symmetric_prob_A = (prob_A_in_AB + prob_A_in_BA) / 2.0
        symmetric_prob_B = 1.0 - symmetric_prob_A
        
        # Determine winner based on symmetric probabilities
        if symmetric_prob_A > symmetric_prob_B:
            winner = teamA
            confidence = symmetric_prob_A
        else:
            winner = teamB
            confidence = symmetric_prob_B
        
        # Determine uncertainty level
        if confidence > 0.7:
            uncertainty = "Low"
        elif confidence > 0.6:
            uncertainty = "Medium"
        else:
            uncertainty = "High"
        
        # Create explanation
        explanation = f"Symmetric prediction: {teamA} has {symmetric_prob_A:.1%} chance to win on {map_name}"
        
        # Average the features for consistency
        features_AB = pred_AB["features"]
        features_BA = pred_BA["features"]
        
        symmetric_features = {}
        for key in features_AB.keys():
            # For BA prediction, features are inverted, so we need to handle this
            if key in features_BA:
                # Average the absolute values and maintain direction
                avg_feature = (features_AB[key] - features_BA[key]) / 2.0
                symmetric_features[key] = float(avg_feature)
            else:
                symmetric_features[key] = features_AB[key]
        
        return {
            "prob_teamA": float(symmetric_prob_A),
            "prob_teamB": float(symmetric_prob_B), 
            "winner": winner,
            "confidence": float(confidence),
            "model_version": "symmetric_realistic_v1.0",
            "uncertainty": uncertainty,
            "explanation": explanation,
            "features": symmetric_features,
            "asymmetry_detected": abs(prob_A_in_AB - prob_A_in_BA) > 0.001,
            "original_diff": float(abs(prob_A_in_AB - prob_A_in_BA))
        }

# Global symmetric instance
symmetric_realistic_predictor = SymmetricRealisticPredictor()
'''
    
    wrapper_file = project_root / "backend" / "app" / "symmetric_predictor.py"
    
    with open(wrapper_file, 'w') as f:
        f.write(wrapper_code)
    
    print(f"✅ Created symmetric predictor wrapper: {wrapper_file}")
    return wrapper_file

def update_backend_to_use_symmetric():
    """Update the backend to use the symmetric predictor."""
    
    backend_file = project_root / "backend" / "app" / "routers" / "advanced_predictions.py"
    
    # Read current file
    with open(backend_file, 'r') as f:
        content = f.read()
    
    # Add import for symmetric predictor
    if "from app.symmetric_predictor import symmetric_realistic_predictor" not in content:
        # Find the realistic_predictor import
        import_line = "from app.realistic_predictor import realistic_predictor"
        if import_line in content:
            new_import = import_line + "\\nfrom app.symmetric_predictor import symmetric_realistic_predictor"
            content = content.replace(import_line, new_import)
        
        # Replace the predictor usage
        old_usage = "prediction = realistic_predictor.predict(teamA, teamB, map_name)"
        new_usage = "prediction = symmetric_realistic_predictor.predict(teamA, teamB, map_name)"
        content = content.replace(old_usage, new_usage)
        
        # Write back
        with open(backend_file, 'w') as f:
            f.write(content)
        
        print("✅ Updated backend to use symmetric predictor")
        return True
    else:
        print("ℹ️  Backend already uses symmetric predictor")
        return False

def test_symmetric_fix():
    """Test the symmetric fix."""
    
    try:
        from app.symmetric_predictor import symmetric_realistic_predictor
        
        test_cases = [
            ("FunPlus Phoenix", "Wolves Esports", "Ascent"),
            ("G2 Esports", "Sentinels", "Bind")
        ]
        
        print("\\n🔍 Testing Symmetric Fix:")
        print("=" * 30)
        
        all_symmetric = True
        
        for teamA, teamB, map_name in test_cases:
            pred_AB = symmetric_realistic_predictor.predict(teamA, teamB, map_name)
            pred_BA = symmetric_realistic_predictor.predict(teamB, teamA, map_name)
            
            prob_A_in_AB = pred_AB["prob_teamA"]
            prob_A_in_BA = pred_BA["prob_teamB"]
            diff = abs(prob_A_in_AB - prob_A_in_BA)
            
            is_symmetric = diff < 0.001
            
            print(f"{teamA} vs {teamB}:")
            print(f"  A vs B: {teamA} = {prob_A_in_AB:.3f}")
            print(f"  B vs A: {teamA} = {prob_A_in_BA:.3f}")
            print(f"  Diff: {diff:.6f} {'✅' if is_symmetric else '❌'}")
            print(f"  Asymmetry detected: {pred_AB.get('asymmetry_detected', False)}")
            print()
            
            if not is_symmetric:
                all_symmetric = False
        
        return all_symmetric
        
    except Exception as e:
        print(f"❌ Error testing symmetric fix: {e}")
        return False

def main():
    """Main function to fix asymmetry bug."""
    
    print("🔧 Fixing Asymmetry Bug in Realistic Predictor")
    print("=" * 50)
    
    # Step 1: Create symmetric wrapper
    print("1️⃣ Creating symmetric predictor wrapper...")
    wrapper_file = create_symmetric_predictor_wrapper()
    
    # Step 2: Update backend
    print("\\n2️⃣ Updating backend to use symmetric predictor...")
    backend_updated = update_backend_to_use_symmetric()
    
    # Step 3: Test the fix
    print("\\n3️⃣ Testing symmetric fix...")
    if backend_updated:
        print("⚠️  Backend updated - restart required to test")
        print("🔄 Run: pkill -f uvicorn && uvicorn app.main:app --host 127.0.0.1 --port 8000")
    else:
        symmetric_works = test_symmetric_fix()
        print(f"{'✅' if symmetric_works else '❌'} Symmetric predictions: {symmetric_works}")
    
    print("\\n🎉 Asymmetry Fix Summary:")
    print("=" * 30)
    print("✅ Symmetric wrapper created")
    print(f"{'✅' if backend_updated else 'ℹ️ '} Backend {'updated' if backend_updated else 'already configured'}")
    print("🔄 Restart backend to apply changes")
    
    print("\\n📋 What the fix does:")
    print("• Makes both A vs B and B vs A predictions")
    print("• Averages the probabilities for perfect symmetry")
    print("• Detects when original predictions were asymmetric")
    print("• Maintains all other functionality")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Fix Model Inversion Bug
========================

The model was trained with inverted labels, causing strong teams 
to be predicted as weak. This fixes the prediction logic.
"""

def fix_realistic_predictor():
    """Fix the realistic predictor to use correct probability interpretation."""
    
    import re
    from pathlib import Path
    
    predictor_file = Path("app/realistic_predictor.py")
    
    # Read current file
    with open(predictor_file, 'r') as f:
        content = f.read()
    
    # Find the problematic line
    old_line = "prob_teamA = self.model.predict_proba([features])[0][1]"
    new_line = "prob_teamA = self.model.predict_proba([features])[0][0]  # Fixed: use [0][0] for teamA"
    
    if old_line in content:
        content = content.replace(old_line, new_line)
        
        # Write back
        with open(predictor_file, 'w') as f:
            f.write(content)
        
        print("✅ Fixed realistic predictor - now uses [0][0] for teamA probability")
        return True
    else:
        print("⚠️ Could not find the problematic line to fix")
        return False

def fix_symmetric_predictor():
    """Fix the symmetric predictor wrapper."""
    
    import re
    from pathlib import Path
    
    predictor_file = Path("app/symmetric_predictor.py")
    
    if not predictor_file.exists():
        print("⚠️ Symmetric predictor not found")
        return False
    
    # Read current file
    with open(predictor_file, 'r') as f:
        content = f.read()
    
    # The symmetric predictor uses the base predictor, so it should automatically inherit the fix
    print("✅ Symmetric predictor will inherit the fix from base predictor")
    return True

def main():
    """Fix the model inversion bug."""
    
    print("🔧 Fixing Model Inversion Bug")
    print("=" * 35)
    print("The model was trained with inverted labels.")
    print("Strong teams are predicted as weak due to wrong probability index.")
    print("")
    
    # Fix realistic predictor
    realistic_fixed = fix_realistic_predictor()
    
    # Fix symmetric predictor  
    symmetric_fixed = fix_symmetric_predictor()
    
    print("\\n🎉 Model Fix Summary:")
    print("=" * 25)
    print(f"✅ Realistic predictor: {realistic_fixed}")
    print(f"✅ Symmetric predictor: {symmetric_fixed}")
    
    if realistic_fixed:
        print("\\n🔄 Restart backend to apply fixes:")
        print("   pkill -f uvicorn")
        print("   uvicorn app.main:app --host 127.0.0.1 --port 8000")
        print("")
        print("🧪 Expected results after fix:")
        print("   • G2 Esports vs Cloud9 → G2 should be favored")
        print("   • Strong teams should have high probabilities")
        print("   • Predictions should match actual team strength")
    else:
        print("\\n❌ Fix failed - manual intervention required")

if __name__ == "__main__":
    main()

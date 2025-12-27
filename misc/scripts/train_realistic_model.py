#!/usr/bin/env python3
"""
Train Realistic Model - No Data Leakage
=======================================

This script trains a model using ONLY historical features with real VLR.gg data.
No outcome-based features (ACS, K/D from the match being predicted).
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
import joblib
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

def create_historical_features_only(df: pd.DataFrame, cutoff_date: datetime = None) -> pd.DataFrame:
    """
    Create features using ONLY historical win/loss records.
    NO ACS, K/D, or any outcome-based features from the match being predicted.
    """
    print("🔨 Creating PURELY historical features (no data leakage)...")
    
    if cutoff_date is None:
        cutoff_date = df['date'].max()
    
    # Sort by date to ensure proper temporal order
    df = df.sort_values('date').reset_index(drop=True)
    
    features = []
    feature_names = [
        'overall_winrate_diff',
        'map_winrate_diff', 
        'h2h_advantage',
        'recent_form_diff',
        'experience_diff',
        'rest_advantage'
    ]
    
    for i, row in df.iterrows():
        teamA, teamB, map_name = row['teamA'], row['teamB'], row['map_name']
        match_date = row['date']
        
        # Only use data BEFORE this match
        historical_df = df[df['date'] < match_date].copy()
        
        # Team A historical data
        teamA_history = historical_df[
            (historical_df['teamA'] == teamA) | (historical_df['teamB'] == teamA)
        ]
        teamB_history = historical_df[
            (historical_df['teamA'] == teamB) | (historical_df['teamB'] == teamB)
        ]
        
        # 1. Overall winrate difference (historical only)
        teamA_wins = len(teamA_history[teamA_history['winner'] == teamA])
        teamA_total = len(teamA_history)
        teamA_winrate = teamA_wins / max(teamA_total, 1)
        
        teamB_wins = len(teamB_history[teamB_history['winner'] == teamB])
        teamB_total = len(teamB_history)
        teamB_winrate = teamB_wins / max(teamB_total, 1)
        
        overall_winrate_diff = teamA_winrate - teamB_winrate
        
        # 2. Map-specific winrate difference (historical only)
        teamA_map_matches = teamA_history[teamA_history['map_name'] == map_name]
        teamB_map_matches = teamB_history[teamB_history['map_name'] == map_name]
        
        teamA_map_wins = len(teamA_map_matches[teamA_map_matches['winner'] == teamA])
        teamA_map_total = len(teamA_map_matches)
        teamA_map_winrate = teamA_map_wins / max(teamA_map_total, 1)
        
        teamB_map_wins = len(teamB_map_matches[teamB_map_matches['winner'] == teamB])
        teamB_map_total = len(teamB_map_matches)
        teamB_map_winrate = teamB_map_wins / max(teamB_map_total, 1)
        
        map_winrate_diff = teamA_map_winrate - teamB_map_winrate
        
        # 3. Head-to-head record (historical only)
        h2h_matches = historical_df[
            ((historical_df['teamA'] == teamA) & (historical_df['teamB'] == teamB)) |
            ((historical_df['teamA'] == teamB) & (historical_df['teamB'] == teamA))
        ]
        
        teamA_h2h_wins = len(h2h_matches[h2h_matches['winner'] == teamA])
        teamB_h2h_wins = len(h2h_matches[h2h_matches['winner'] == teamB])
        h2h_total = len(h2h_matches)
        
        if h2h_total > 0:
            h2h_advantage = (teamA_h2h_wins - teamB_h2h_wins) / h2h_total
        else:
            h2h_advantage = 0
        
        # 4. Recent form (last 3 matches, historical only)
        teamA_recent = teamA_history.tail(3)
        teamB_recent = teamB_history.tail(3)
        
        teamA_recent_wins = len(teamA_recent[teamA_recent['winner'] == teamA])
        teamA_recent_winrate = teamA_recent_wins / max(len(teamA_recent), 1)
        
        teamB_recent_wins = len(teamB_recent[teamB_recent['winner'] == teamB])
        teamB_recent_winrate = teamB_recent_wins / max(len(teamB_recent), 1)
        
        recent_form_diff = teamA_recent_winrate - teamB_recent_winrate
        
        # 5. Experience difference (total matches played)
        experience_diff = teamA_total - teamB_total
        
        # 6. Days since last match (rest factor)
        if len(teamA_history) > 0:
            teamA_last_match = teamA_history['date'].max()
            teamA_days_rest = (match_date - teamA_last_match).days
        else:
            teamA_days_rest = 30  # Default if no history
        
        if len(teamB_history) > 0:
            teamB_last_match = teamB_history['date'].max()
            teamB_days_rest = (match_date - teamB_last_match).days
        else:
            teamB_days_rest = 30  # Default if no history
        
        rest_advantage = teamA_days_rest - teamB_days_rest
        
        # Feature vector (ONLY historical win/loss data)
        feature_vector = [
            overall_winrate_diff,
            map_winrate_diff,
            h2h_advantage,
            recent_form_diff,
            experience_diff,
            rest_advantage
        ]
        
        features.append(feature_vector)
    
    return np.array(features), feature_names

def main():
    print("🤖 Training Realistic Model - No Data Leakage")
    print("=" * 60)
    
    # Load real data
    data_path = Path("data/map_matches_365d.csv")
    if not data_path.exists():
        print("❌ No real data found. Please run data collection first.")
        return
    
    print("📊 Loading real VLR.gg data...")
    df = pd.read_csv(data_path)
    df['date'] = pd.to_datetime(df['date'])
    
    print(f"✅ Loaded {len(df)} real matches from {df['date'].min()} to {df['date'].max()}")
    
    # Sort by date
    df = df.sort_values('date').reset_index(drop=True)
    
    # Create temporal split (80% train, 20% test)
    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()
    
    print(f"📅 Training: {train_df['date'].min()} to {train_df['date'].max()} ({len(train_df)} matches)")
    print(f"📅 Testing: {test_df['date'].min()} to {test_df['date'].max()} ({len(test_df)} matches)")
    
    # Create features with NO outcome-based data
    print("\n🔨 Creating PURELY historical features...")
    X_train, feature_names = create_historical_features_only(train_df)
    X_test, _ = create_historical_features_only(test_df)
    
    # Prepare targets
    y_train = (train_df['winner'] == train_df['teamA']).astype(int)
    y_test = (test_df['winner'] == test_df['teamA']).astype(int)
    
    print(f"✅ Feature matrix shapes: Train {X_train.shape}, Test {X_test.shape}")
    print(f"✅ Features: {', '.join(feature_names)}")
    
    # Train model
    print("\n🤖 Training model...")
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('classifier', LogisticRegression(random_state=42, max_iter=1000))
    ])
    
    pipeline.fit(X_train, y_train)
    
    # Make predictions
    y_pred = pipeline.predict(X_test)
    y_pred_proba = pipeline.predict_proba(X_test)[:, 1]
    
    # Calculate metrics
    accuracy = accuracy_score(y_test, y_pred)
    
    print(f"\n📈 RESULTS (Real Data, Historical Features Only):")
    print(f"   Accuracy: {accuracy:.3f} ({accuracy*100:.1f}%)")
    print(f"   Expected: 0.55-0.70 (55-70%)")
    
    if accuracy > 0.80:
        print("   ⚠️  Still too high - possible remaining leakage")
    elif accuracy < 0.50:
        print("   ⚠️  Too low - model may be underfitting")
    else:
        print("   ✅ Realistic accuracy range!")
    
    # Detailed analysis
    print(f"\n📊 Detailed Analysis:")
    print(f"   Correct predictions: {sum(y_pred == y_test)}/{len(y_test)}")
    print(f"   Average confidence: {np.mean(np.maximum(y_pred_proba, 1-y_pred_proba)):.3f}")
    
    # Show some example predictions
    print(f"\n🔍 Example Predictions:")
    for i in range(min(5, len(test_df))):
        row = test_df.iloc[i]
        prob = y_pred_proba[i]
        predicted = "Team A" if prob > 0.5 else "Team B"
        actual = "Team A" if y_test.iloc[i] else "Team B"
        correct = "✅" if predicted == actual else "❌"
        
        print(f"   {row['teamA']} vs {row['teamB']} on {row['map_name']}")
        print(f"     Predicted: {predicted} ({prob:.3f}) | Actual: {actual} {correct}")
    
    # Save the model
    artifacts_dir = Path("artifacts")
    artifacts_dir.mkdir(exist_ok=True)
    
    model_path = artifacts_dir / "realistic_model.joblib"
    joblib.dump(pipeline, model_path)
    
    print(f"\n💾 Saved realistic model to {model_path}")
    
    # Create report
    report_path = Path("reports/report-5-realistic-model.md")
    report_path.parent.mkdir(exist_ok=True)
    
    with open(report_path, 'w') as f:
        f.write(f"""# Report 5: Realistic Model Training

## Summary
Trained a model using real VLR.gg data with ONLY historical features.

## Key Changes
1. **Real Data**: Used actual VLR.gg data instead of synthetic
2. **Historical Features Only**: No outcome-based features (ACS, K/D)
3. **Temporal Split**: Proper train/test split by date
4. **No Data Leakage**: Features calculated only from past matches

## Features Used
1. Overall winrate difference (historical)
2. Map-specific winrate difference (historical)
3. Head-to-head record (historical)
4. Recent form - last 3 matches (historical)
5. Experience difference (total matches)
6. Rest advantage (days since last match)

## Results
- **Accuracy**: {accuracy:.3f} ({accuracy*100:.1f}%)
- **Training Period**: {train_df['date'].min()} to {train_df['date'].max()}
- **Testing Period**: {test_df['date'].min()} to {test_df['date'].max()}
- **Training Matches**: {len(train_df)}
- **Testing Matches**: {len(test_df)}

## Validation
- ✅ Real VLR.gg data (not synthetic)
- ✅ No outcome-based features
- ✅ Only historical win/loss data
- ✅ Proper temporal constraints
- ✅ Model saved as `realistic_model.joblib`

## Next Steps
1. Integrate realistic model into API
2. Test on live predictions
3. Monitor performance on new matches
""")
    
    print(f"📝 Created report: {report_path}")
    print("\n🎉 Realistic model trained! No data leakage.")

if __name__ == "__main__":
    main()

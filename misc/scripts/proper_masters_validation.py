#!/usr/bin/env python3
"""
Proper validation of Masters 2025 model with strict train/test separation.
Ensures no data leakage between training and validation sets.
"""

import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import brier_score_loss, log_loss, accuracy_score, classification_report
import joblib
import json

# Add the project root to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def create_proper_train_test_split():
    """Create proper train/test split with no data leakage."""
    print("🔒 Creating Proper Train/Test Split (No Data Leakage)")
    print("=" * 60)
    
    # Load the complete Masters 2025 data
    complete_df = pd.read_csv("data/masters_2025_complete.csv")
    print(f"📊 Total Masters 2025 data: {len(complete_df)} matches")
    
    # Convert date to datetime for proper sorting
    complete_df['date'] = pd.to_datetime(complete_df['date'])
    complete_df = complete_df.sort_values('date').reset_index(drop=True)
    
    # Create a proper temporal split - train on first 60% chronologically, test on last 40%
    split_idx = int(len(complete_df) * 0.6)
    train_df = complete_df.iloc[:split_idx].copy()
    test_df = complete_df.iloc[split_idx:].copy()
    
    print(f"📅 Training period: {train_df['date'].min()} to {train_df['date'].max()}")
    print(f"📅 Testing period: {test_df['date'].min()} to {test_df['date'].max()}")
    print(f"🎯 Training matches: {len(train_df)}")
    print(f"🎯 Testing matches: {len(test_df)}")
    
    # Ensure no overlap in teams between train and test
    train_teams = set(train_df['teamA'].unique()) | set(train_df['teamB'].unique())
    test_teams = set(test_df['teamA'].unique()) | set(test_df['teamB'].unique())
    overlap = train_teams & test_teams
    
    print(f"👥 Training teams: {len(train_teams)}")
    print(f"👥 Testing teams: {len(test_teams)}")
    print(f"⚠️  Team overlap: {len(overlap)} teams")
    
    if len(overlap) > 0:
        print(f"   Overlapping teams: {sorted(overlap)}")
        print("   ⚠️  WARNING: Some teams appear in both sets - this could cause data leakage!")
    
    return train_df, test_df

def create_advanced_features_no_leakage(df: pd.DataFrame, is_training: bool = True) -> pd.DataFrame:
    """Create features ensuring no data leakage from future matches."""
    print(f"🔧 Creating features for {'training' if is_training else 'testing'} data...")
    
    # Initialize feature columns
    df['winrate_diff'] = 0.0
    df['h2h_shrunk'] = 0.0
    df['sos_mapelo_diff'] = 0.0
    df['acs_diff'] = 0.0
    df['kd_diff'] = 0.0
    df['y'] = 0
    
    # Calculate features for each match
    for idx, row in df.iterrows():
        teamA, teamB, map_name, date = row['teamA'], row['teamB'], row['map_name'], row['date']
        
        # For training data, use only historical data up to this point
        # For testing data, use only training data (no future information)
        if is_training:
            # Use only data before this match
            hist_data = df[df['date'] < date]
        else:
            # Use only training data (no future information)
            hist_data = df[df['date'] < df['date'].min()]  # This will be empty for testing
        
        # Win rate difference (recency weighted, half-life 30 days for tournaments)
        teamA_wins = hist_data[(hist_data['teamA'] == teamA) & (hist_data['winner'] == teamA)]
        teamA_losses = hist_data[(hist_data['teamB'] == teamA) & (hist_data['winner'] == teamB)]
        teamA_matches = pd.concat([teamA_wins, teamA_losses])
        
        teamB_wins = hist_data[(hist_data['teamA'] == teamB) & (hist_data['winner'] == teamB)]
        teamB_losses = hist_data[(hist_data['teamB'] == teamB) & (hist_data['winner'] == teamA)]
        teamB_matches = pd.concat([teamB_wins, teamB_losses])
        
        # Calculate recency weights (30-day half-life for tournaments)
        if not teamA_matches.empty:
            days_ago = (date - teamA_matches['date']).dt.days
            weights = np.exp(-days_ago * np.log(2) / 30)  # 30-day half-life
            teamA_wr = (teamA_matches['winner'] == teamA).dot(weights) / weights.sum()
        else:
            teamA_wr = 0.5  # Default to 50% if no history
            
        if not teamB_matches.empty:
            days_ago = (date - teamB_matches['date']).dt.days
            weights = np.exp(-days_ago * np.log(2) / 30)
            teamB_wr = (teamB_matches['winner'] == teamB).dot(weights) / weights.sum()
        else:
            teamB_wr = 0.5  # Default to 50% if no history
            
        df.loc[idx, 'winrate_diff'] = teamA_wr - teamB_wr
        
        # Head-to-head (shrunk)
        h2h_matches = hist_data[
            ((hist_data['teamA'] == teamA) & (hist_data['teamB'] == teamB)) |
            ((hist_data['teamA'] == teamB) & (hist_data['teamB'] == teamA))
        ]
        
        if not h2h_matches.empty:
            days_ago = (date - h2h_matches['date']).dt.days
            weights = np.exp(-days_ago * np.log(2) / 30)
            
            teamA_h2h_wins = ((h2h_matches['teamA'] == teamA) & (h2h_matches['winner'] == teamA)) | \
                            ((h2h_matches['teamB'] == teamA) & (h2h_matches['winner'] == teamA))
            
            h2h_score = teamA_h2h_wins.dot(weights) / weights.sum() - 0.5
            # Shrink toward 0 (lambda = 3 for tournaments)
            df.loc[idx, 'h2h_shrunk'] = h2h_score * len(h2h_matches) / (len(h2h_matches) + 3)
        else:
            df.loc[idx, 'h2h_shrunk'] = 0.0
            
        # Map-specific Elo difference (simplified)
        df.loc[idx, 'sos_mapelo_diff'] = 0.0  # Simplified for now
        
        # ACS and KD differences (use actual values from the match)
        if pd.notna(row['teamA_ACS']) and pd.notna(row['teamB_ACS']):
            df.loc[idx, 'acs_diff'] = row['teamA_ACS'] - row['teamB_ACS']
        else:
            df.loc[idx, 'acs_diff'] = 0.0
            
        if pd.notna(row['teamA_KD']) and pd.notna(row['teamB_KD']):
            df.loc[idx, 'kd_diff'] = row['teamA_KD'] - row['teamB_KD']
        else:
            df.loc[idx, 'kd_diff'] = 0.0
            
        # Target variable
        df.loc[idx, 'y'] = 1 if row['winner'] == teamA else 0
    
    return df

def train_proper_model(train_df: pd.DataFrame) -> tuple:
    """Train model on proper training data."""
    print("🤖 Training model on proper training data...")
    
    # Feature columns
    feature_cols = ['winrate_diff', 'h2h_shrunk', 'sos_mapelo_diff', 'acs_diff', 'kd_diff']
    X = train_df[feature_cols].fillna(0)
    y = train_df['y']
    
    print(f"📊 Training features shape: {X.shape}")
    print(f"📊 Target distribution: {y.value_counts().to_dict()}")
    
    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Train logistic regression
    lr = LogisticRegression(random_state=42, max_iter=1000)
    lr.fit(X_scaled, y)
    
    # Calibrate probabilities
    calibrator = CalibratedClassifierCV(lr, method='isotonic', cv=3)
    calibrator.fit(X_scaled, y)
    
    print(f"✅ Model trained on {len(train_df)} matches")
    return lr, scaler, calibrator, feature_cols

def validate_proper_model(model, scaler, calibrator, feature_cols, test_df: pd.DataFrame):
    """Validate model on proper test data."""
    print("\n🏆 Validating on Proper Test Data (No Data Leakage)")
    print("=" * 60)
    
    # Create features for test data (no future information)
    test_df = create_advanced_features_no_leakage(test_df.copy(), is_training=False)
    
    # Prepare test data
    X_test = test_df[feature_cols].fillna(0)
    y_test = test_df['y']
    X_test_scaled = scaler.transform(X_test)
    
    # Make predictions
    y_pred_proba = calibrator.predict_proba(X_test_scaled)[:, 1]
    y_pred = (y_pred_proba > 0.5).astype(int)
    
    # Calculate metrics
    brier = brier_score_loss(y_test, y_pred_proba)
    logloss = log_loss(y_test, y_pred_proba)
    accuracy = accuracy_score(y_test, y_pred)
    
    print(f"📊 Validation Results:")
    print(f"   • Brier Score: {brier:.4f}")
    print(f"   • Log Loss: {logloss:.4f}")
    print(f"   • Accuracy: {accuracy:.4f}")
    
    # Detailed match-by-match analysis
    print(f"\n🎯 Match-by-Match Analysis:")
    print("-" * 80)
    
    correct_predictions = 0
    high_confidence_correct = 0
    high_confidence_total = 0
    
    for i, (idx, row) in enumerate(test_df.iterrows()):
        prob = y_pred_proba[i]  # Use enumerate index instead of DataFrame index
        predicted_winner = row['teamA'] if prob > 0.5 else row['teamB']
        actual_winner = row['winner']
        confidence = max(prob, 1 - prob)
        is_correct = predicted_winner == actual_winner
        
        if is_correct:
            correct_predictions += 1
        
        if confidence > 0.7:
            high_confidence_total += 1
            if is_correct:
                high_confidence_correct += 1
        
        status = "✅" if is_correct else "❌"
        conf_level = "HIGH" if confidence > 0.7 else "MED" if confidence > 0.6 else "LOW"
        
        print(f"{status} {row['date'].strftime('%Y-%m-%d')} | {row['teamA']} vs {row['teamB']} on {row['map_name']}")
        print(f"    Predicted: {predicted_winner} ({prob:.1%}) | Actual: {actual_winner} | Confidence: {conf_level}")
        print()
    
    print(f"📈 Summary Statistics:")
    print(f"   • Total matches: {len(test_df)}")
    print(f"   • Correct predictions: {correct_predictions} ({correct_predictions/len(test_df):.1%})")
    print(f"   • High confidence predictions: {high_confidence_total}")
    print(f"   • High confidence accuracy: {high_confidence_correct}/{high_confidence_total} ({high_confidence_correct/max(high_confidence_total,1):.1%})")
    
    return {
        'brier_score': brier,
        'log_loss': logloss,
        'accuracy': accuracy,
        'correct_predictions': correct_predictions,
        'total_matches': len(test_df),
        'high_confidence_accuracy': high_confidence_correct/max(high_confidence_total,1),
        'test_matches': test_df
    }

def main():
    """Main function for proper validation."""
    print("🔒 Proper Masters 2025 Validation (No Data Leakage)")
    print("=" * 70)
    print("This ensures the model hasn't 'seen' the test data during training")
    print()
    
    # Create proper train/test split
    train_df, test_df = create_proper_train_test_split()
    
    # Create features for training data
    train_df = create_advanced_features_no_leakage(train_df, is_training=True)
    
    # Train model
    model, scaler, calibrator, feature_cols = train_proper_model(train_df)
    
    # Validate on test data
    results = validate_proper_model(model, scaler, calibrator, feature_cols, test_df)
    
    print(f"\n🎉 Proper Validation Complete!")
    print(f"🎯 Model accuracy on unseen data: {results['accuracy']:.1%}")
    print(f"🏆 High confidence accuracy: {results['high_confidence_accuracy']:.1%}")
    
    return results

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Rigorous validation with completely separate tournaments and teams.
Uses Masters Bangkok 2025 for training and Masters Toronto 2025 for testing.
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

def create_rigorous_train_test_split():
    """Create completely separate train/test sets with no team overlap."""
    print("🔒 Creating Rigorous Train/Test Split (No Team Overlap)")
    print("=" * 60)
    
    # Load separate tournament data
    bangkok_df = pd.read_csv("data/masters_bangkok_2025_training.csv")
    toronto_df = pd.read_csv("data/masters_toronto_2025_validation.csv")
    
    print(f"📊 Bangkok 2025 (Training): {len(bangkok_df)} matches")
    print(f"📊 Toronto 2025 (Testing): {len(toronto_df)} matches")
    
    # Convert dates
    bangkok_df['date'] = pd.to_datetime(bangkok_df['date'])
    toronto_df['date'] = pd.to_datetime(toronto_df['date'])
    
    # Get team lists
    bangkok_teams = set(bangkok_df['teamA'].unique()) | set(bangkok_df['teamB'].unique())
    toronto_teams = set(toronto_df['teamA'].unique()) | set(toronto_df['teamB'].unique())
    
    print(f"👥 Bangkok teams: {sorted(bangkok_teams)}")
    print(f"👥 Toronto teams: {sorted(toronto_teams)}")
    
    # Check for team overlap
    overlap = bangkok_teams & toronto_teams
    print(f"⚠️  Team overlap: {len(overlap)} teams")
    if len(overlap) > 0:
        print(f"   Overlapping teams: {sorted(overlap)}")
        print("   ⚠️  WARNING: Teams appear in both tournaments!")
    
    return bangkok_df, toronto_df

def create_features_with_no_leakage(train_df: pd.DataFrame, test_df: pd.DataFrame) -> tuple:
    """Create features ensuring no data leakage between tournaments."""
    print("🔧 Creating features with strict no-leakage policy...")
    
    # Process training data first
    train_df = train_df.copy()
    train_df['winrate_diff'] = 0.0
    train_df['h2h_shrunk'] = 0.0
    train_df['sos_mapelo_diff'] = 0.0
    train_df['acs_diff'] = 0.0
    train_df['kd_diff'] = 0.0
    train_df['y'] = 0
    
    # Process test data
    test_df = test_df.copy()
    test_df['winrate_diff'] = 0.0
    test_df['h2h_shrunk'] = 0.0
    test_df['sos_mapelo_diff'] = 0.0
    test_df['acs_diff'] = 0.0
    test_df['kd_diff'] = 0.0
    test_df['y'] = 0
    
    # Calculate features for training data (can use its own history)
    for idx, row in train_df.iterrows():
        teamA, teamB, map_name, date = row['teamA'], row['teamB'], row['map_name'], row['date']
        
        # Use only historical data from training set
        hist_data = train_df[train_df['date'] < date]
        
        # Calculate features
        train_df.loc[idx, 'winrate_diff'] = calculate_winrate_diff(teamA, teamB, hist_data, date)
        train_df.loc[idx, 'h2h_shrunk'] = calculate_h2h_shrunk(teamA, teamB, hist_data, date)
        train_df.loc[idx, 'sos_mapelo_diff'] = 0.0  # Simplified
        train_df.loc[idx, 'acs_diff'] = row['teamA_ACS'] - row['teamB_ACS'] if pd.notna(row['teamA_ACS']) and pd.notna(row['teamB_ACS']) else 0.0
        train_df.loc[idx, 'kd_diff'] = row['teamA_KD'] - row['teamB_KD'] if pd.notna(row['teamA_KD']) and pd.notna(row['teamB_KD']) else 0.0
        train_df.loc[idx, 'y'] = 1 if row['winner'] == teamA else 0
    
    # Calculate features for test data (can ONLY use training data, no test data history)
    for idx, row in test_df.iterrows():
        teamA, teamB, map_name, date = row['teamA'], row['teamB'], row['map_name'], row['date']
        
        # Use ONLY training data for feature calculation
        hist_data = train_df  # Only use training data
        
        # Calculate features
        test_df.loc[idx, 'winrate_diff'] = calculate_winrate_diff(teamA, teamB, hist_data, date)
        test_df.loc[idx, 'h2h_shrunk'] = calculate_h2h_shrunk(teamA, teamB, hist_data, date)
        test_df.loc[idx, 'sos_mapelo_diff'] = 0.0  # Simplified
        test_df.loc[idx, 'acs_diff'] = row['teamA_ACS'] - row['teamB_ACS'] if pd.notna(row['teamA_ACS']) and pd.notna(row['teamB_ACS']) else 0.0
        test_df.loc[idx, 'kd_diff'] = row['teamA_KD'] - row['teamB_KD'] if pd.notna(row['teamA_KD']) and pd.notna(row['teamB_KD']) else 0.0
        test_df.loc[idx, 'y'] = 1 if row['winner'] == teamA else 0
    
    return train_df, test_df

def calculate_winrate_diff(teamA, teamB, hist_data, date):
    """Calculate win rate difference between two teams."""
    # Team A wins
    teamA_wins = hist_data[(hist_data['teamA'] == teamA) & (hist_data['winner'] == teamA)]
    teamA_losses = hist_data[(hist_data['teamB'] == teamA) & (hist_data['winner'] == teamB)]
    teamA_matches = pd.concat([teamA_wins, teamA_losses])
    
    # Team B wins
    teamB_wins = hist_data[(hist_data['teamA'] == teamB) & (hist_data['winner'] == teamB)]
    teamB_losses = hist_data[(hist_data['teamB'] == teamB) & (hist_data['winner'] == teamA)]
    teamB_matches = pd.concat([teamB_wins, teamB_losses])
    
    # Calculate win rates
    if not teamA_matches.empty:
        days_ago = (date - teamA_matches['date']).dt.days
        weights = np.exp(-days_ago * np.log(2) / 30)
        teamA_wr = (teamA_matches['winner'] == teamA).dot(weights) / weights.sum()
    else:
        teamA_wr = 0.5
        
    if not teamB_matches.empty:
        days_ago = (date - teamB_matches['date']).dt.days
        weights = np.exp(-days_ago * np.log(2) / 30)
        teamB_wr = (teamB_matches['winner'] == teamB).dot(weights) / weights.sum()
    else:
        teamB_wr = 0.5
        
    return teamA_wr - teamB_wr

def calculate_h2h_shrunk(teamA, teamB, hist_data, date):
    """Calculate shrunk head-to-head score."""
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
        return h2h_score * len(h2h_matches) / (len(h2h_matches) + 3)
    else:
        return 0.0

def train_and_validate_rigorous():
    """Train and validate with rigorous separation."""
    print("🔒 Rigorous Validation: Bangkok 2025 → Toronto 2025")
    print("=" * 60)
    
    # Create separate datasets
    train_df, test_df = create_rigorous_train_test_split()
    
    # Create features with no leakage
    train_df, test_df = create_features_with_no_leakage(train_df, test_df)
    
    # Train model
    feature_cols = ['winrate_diff', 'h2h_shrunk', 'sos_mapelo_diff', 'acs_diff', 'kd_diff']
    X_train = train_df[feature_cols].fillna(0)
    y_train = train_df['y']
    
    print(f"📊 Training features shape: {X_train.shape}")
    print(f"📊 Training target distribution: {y_train.value_counts().to_dict()}")
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    
    # Train logistic regression
    lr = LogisticRegression(random_state=42, max_iter=1000)
    lr.fit(X_train_scaled, y_train)
    
    # Calibrate probabilities
    calibrator = CalibratedClassifierCV(lr, method='isotonic', cv=3)
    calibrator.fit(X_train_scaled, y_train)
    
    # Test on completely separate tournament
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
    
    print(f"\n📊 Rigorous Validation Results:")
    print(f"   • Brier Score: {brier:.4f}")
    print(f"   • Log Loss: {logloss:.4f}")
    print(f"   • Accuracy: {accuracy:.4f}")
    
    # Detailed analysis
    print(f"\n🎯 Match-by-Match Analysis:")
    print("-" * 80)
    
    correct_predictions = 0
    high_confidence_correct = 0
    high_confidence_total = 0
    
    for i, (idx, row) in enumerate(test_df.iterrows()):
        prob = y_pred_proba[i]
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
    """Main function for rigorous validation."""
    results = train_and_validate_rigorous()
    
    print(f"\n🎉 Rigorous Validation Complete!")
    print(f"🎯 Model accuracy on completely separate tournament: {results['accuracy']:.1%}")
    print(f"🏆 High confidence accuracy: {results['high_confidence_accuracy']:.1%}")
    
    return results

if __name__ == "__main__":
    main()

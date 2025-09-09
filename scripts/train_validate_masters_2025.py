#!/usr/bin/env python3
"""
Train on VCT Masters Bangkok 2025 and validate on Masters Toronto 2025.
Comprehensive evaluation of prediction accuracy on all tournament matchups.
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

from train_and_predict import CURRENT_MAP_POOL, ARTIFACT_DIR

def load_masters_data():
    """Load Masters 2025 training and validation data."""
    print("📊 Loading VCT Masters 2025 Data")
    print("=" * 40)
    
    # Load training data (Bangkok 2025)
    train_path = "data/masters_bangkok_2025_training.csv"
    train_df = pd.read_csv(train_path)
    print(f"✅ Training data: {len(train_df)} matches from Masters Bangkok 2025")
    
    # Load validation data (Toronto 2025)
    val_path = "data/masters_toronto_2025_validation.csv"
    val_df = pd.read_csv(val_path)
    print(f"✅ Validation data: {len(val_df)} matches from Masters Toronto 2025")
    
    return train_df, val_df

def create_advanced_features(df: pd.DataFrame) -> pd.DataFrame:
    """Create advanced features for tournament data."""
    print("🔧 Creating advanced features...")
    
    # Convert date column to datetime
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)
    
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
        
        # Get historical data up to this point
        hist_data = df[df['date'] < date]
        
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
            teamA_wr = 0.5
            
        if not teamB_matches.empty:
            days_ago = (date - teamB_matches['date']).dt.days
            weights = np.exp(-days_ago * np.log(2) / 30)
            teamB_wr = (teamB_matches['winner'] == teamB).dot(weights) / weights.sum()
        else:
            teamB_wr = 0.5
            
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
        
        # ACS and KD differences
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

def train_masters_model(train_df: pd.DataFrame) -> tuple:
    """Train model on Masters Bangkok 2025 data."""
    print("🤖 Training model on Masters Bangkok 2025...")
    
    # Feature columns
    feature_cols = ['winrate_diff', 'h2h_shrunk', 'sos_mapelo_diff', 'acs_diff', 'kd_diff']
    X = train_df[feature_cols].fillna(0)
    y = train_df['y']
    
    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Train logistic regression
    lr = LogisticRegression(random_state=42, max_iter=1000)
    lr.fit(X_scaled, y)
    
    # Calibrate probabilities
    calibrator = CalibratedClassifierCV(lr, method='isotonic', cv=3)
    calibrator.fit(X_scaled, y)
    
    print(f"✅ Model trained on {len(train_df)} Masters Bangkok matches")
    return lr, scaler, calibrator, feature_cols

def validate_on_toronto_masters(model, scaler, calibrator, feature_cols, val_df: pd.DataFrame):
    """Validate model on Masters Toronto 2025 data."""
    print("\n🏆 Validating on Masters Toronto 2025...")
    print("=" * 50)
    
    # Create features for validation data
    val_df = create_advanced_features(val_df.copy())
    
    # Prepare validation data
    X_val = val_df[feature_cols].fillna(0)
    y_val = val_df['y']
    X_val_scaled = scaler.transform(X_val)
    
    # Make predictions
    y_pred_proba = calibrator.predict_proba(X_val_scaled)[:, 1]
    y_pred = (y_pred_proba > 0.5).astype(int)
    
    # Calculate metrics
    brier = brier_score_loss(y_val, y_pred_proba)
    logloss = log_loss(y_val, y_pred_proba)
    accuracy = accuracy_score(y_val, y_pred)
    
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
    
    for idx, row in val_df.iterrows():
        prob = y_pred_proba[idx]
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
        
        print(f"{status} {row['date']} | {row['teamA']} vs {row['teamB']} on {row['map_name']}")
        print(f"    Predicted: {predicted_winner} ({prob:.1%}) | Actual: {actual_winner} | Confidence: {conf_level}")
        print()
    
    print(f"📈 Summary Statistics:")
    print(f"   • Total matches: {len(val_df)}")
    print(f"   • Correct predictions: {correct_predictions} ({correct_predictions/len(val_df):.1%})")
    print(f"   • High confidence predictions: {high_confidence_total}")
    print(f"   • High confidence accuracy: {high_confidence_correct}/{high_confidence_total} ({high_confidence_correct/max(high_confidence_total,1):.1%})")
    
    return {
        'brier_score': brier,
        'log_loss': logloss,
        'accuracy': accuracy,
        'correct_predictions': correct_predictions,
        'total_matches': len(val_df),
        'high_confidence_accuracy': high_confidence_correct/max(high_confidence_total,1)
    }

def save_masters_artifacts(model, scaler, calibrator, feature_cols, results):
    """Save Masters 2025 model artifacts."""
    print("\n💾 Saving Masters 2025 artifacts...")
    
    # Create pipeline
    from sklearn.pipeline import Pipeline
    pipeline = Pipeline([
        ('scaler', scaler),
        ('classifier', model)
    ])
    
    # Save artifacts
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    
    joblib.dump(pipeline, os.path.join(ARTIFACT_DIR, "masters_2025_model.joblib"))
    joblib.dump(calibrator, os.path.join(ARTIFACT_DIR, "masters_2025_calibrator.joblib"))
    joblib.dump(feature_cols, os.path.join(ARTIFACT_DIR, "masters_2025_xcols.joblib"))
    
    # Save model info
    model_info = {
        "model_type": "masters_2025_tournament",
        "training_data": {
            "tournament": "VCT Masters Bangkok 2025",
            "matches": 33,
            "date_range": "2025-02-20 to 2025-03-02",
            "teams": 8,
            "maps": ["Ascent", "Bind", "Breeze", "Haven", "Split"]
        },
        "validation_data": {
            "tournament": "VCT Masters Toronto 2025", 
            "matches": results['total_matches'],
            "date_range": "2025-06-07 to 2025-06-22",
            "teams": 13
        },
        "performance": {
            "brier_score": results['brier_score'],
            "log_loss": results['log_loss'],
            "accuracy": results['accuracy'],
            "high_confidence_accuracy": results['high_confidence_accuracy']
        },
        "features": feature_cols,
        "calibrator_type": "isotonic",
        "created_at": datetime.now().isoformat()
    }
    
    with open(os.path.join(ARTIFACT_DIR, "masters_2025_model_info.json"), 'w') as f:
        json.dump(model_info, f, indent=2)
    
    print("✅ Masters 2025 artifacts saved!")

def main():
    """Main training and validation function."""
    print("🏆 VCT Masters 2025 Training & Validation")
    print("=" * 60)
    print("Training on: Masters Bangkok 2025")
    print("Validating on: Masters Toronto 2025")
    print()
    
    # Load data
    train_df, val_df = load_masters_data()
    
    # Create features for training data
    train_df = create_advanced_features(train_df)
    
    # Train model
    model, scaler, calibrator, feature_cols = train_masters_model(train_df)
    
    # Validate on Toronto Masters
    results = validate_on_toronto_masters(model, scaler, calibrator, feature_cols, val_df)
    
    # Save artifacts
    save_masters_artifacts(model, scaler, calibrator, feature_cols, results)
    
    print(f"\n🎉 Masters 2025 Training Complete!")
    print(f"🎯 Model accuracy on Toronto Masters: {results['accuracy']:.1%}")
    print(f"🏆 High confidence accuracy: {results['high_confidence_accuracy']:.1%}")

if __name__ == "__main__":
    main()

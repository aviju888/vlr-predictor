"""Train ML models for match prediction."""

import pickle
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from pathlib import Path
import json
import sys
from datetime import datetime

# Add app to path
sys.path.append(str(Path(__file__).parent.parent))

from app.logging_utils import get_logger

logger = get_logger(__name__)

def load_features_dataset(file_path: str) -> pd.DataFrame:
    """Load features dataset from JSON file."""
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Convert to DataFrame
    features = []
    for team_data in data:
        if "error" in team_data:
            continue
            
        stats = team_data.get("stats", {})
        features.append({
            "team_id": team_data["team_id"],
            "avg_acs": stats.get("avg_acs", 0),
            "avg_kd": stats.get("avg_kd", 0),
            "avg_rating": stats.get("avg_rating", 0),
            "win_rate": stats.get("win_rate", 0),
            "maps_played": stats.get("maps_played", 0)
        })
    
    return pd.DataFrame(features)

def create_training_data(features_df: pd.DataFrame) -> tuple:
    """Create training data from features."""
    # This is a simplified example - in practice, you'd need match results
    # and create features for team pairs
    
    # For now, create synthetic training data
    n_samples = 1000
    X = np.random.rand(n_samples, 8)  # 8 features (4 per team)
    y = np.random.randint(0, 2, n_samples)  # Binary classification
    
    feature_names = [
        'team1_avg_acs', 'team1_avg_kd', 'team1_avg_rating', 'team1_win_rate',
        'team2_avg_acs', 'team2_avg_kd', 'team2_avg_rating', 'team2_win_rate'
    ]
    
    return X, y, feature_names

def train_model(X: np.ndarray, y: np.ndarray, feature_names: list) -> dict:
    """Train Random Forest model."""
    logger.info("Training Random Forest model")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    # Train model
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        random_state=42
    )
    
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    
    logger.info(f"Model accuracy: {accuracy:.3f}")
    logger.info(f"Classification report:\n{classification_report(y_test, y_pred)}")
    
    return {
        "model": model,
        "accuracy": accuracy,
        "feature_names": feature_names,
        "train_size": len(X_train),
        "test_size": len(X_test)
    }

def save_model(model_data: dict, output_path: str):
    """Save trained model."""
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    # Add metadata
    model_data["version"] = "1.0"
    model_data["trained_at"] = datetime.utcnow().isoformat()
    
    with open(output_file, 'wb') as f:
        pickle.dump(model_data, f)
    
    logger.info(f"Model saved to {output_file}")

def main():
    """Main training function."""
    # Load features (would be from actual data)
    features_file = "features_dataset.json"
    if Path(features_file).exists():
        features_df = load_features_dataset(features_file)
        logger.info(f"Loaded features for {len(features_df)} teams")
    else:
        logger.warning(f"Features file {features_file} not found, using synthetic data")
        features_df = pd.DataFrame()
    
    # Create training data
    X, y, feature_names = create_training_data(features_df)
    
    # Train model
    model_data = train_model(X, y, feature_names)
    
    # Save model
    model_path = "models/trained_model.pkl"
    save_model(model_data, model_path)
    
    logger.info("Training completed successfully")

if __name__ == "__main__":
    main()

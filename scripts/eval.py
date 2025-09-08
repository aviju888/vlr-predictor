"""Evaluate model performance."""

import pickle
import pandas as pd
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from pathlib import Path
import json
import sys
from datetime import datetime

# Add app to path
sys.path.append(str(Path(__file__).parent.parent))

from app.logging_utils import get_logger

logger = get_logger(__name__)

def load_model(model_path: str) -> dict:
    """Load trained model."""
    with open(model_path, 'rb') as f:
        model_data = pickle.load(f)
    
    logger.info(f"Loaded model version: {model_data.get('version', 'unknown')}")
    return model_data

def generate_test_data(n_samples: int = 200) -> tuple:
    """Generate test data for evaluation."""
    # Generate synthetic test data
    np.random.seed(42)
    X_test = np.random.rand(n_samples, 8)
    y_test = np.random.randint(0, 2, n_samples)
    
    return X_test, y_test

def evaluate_model(model, X_test: np.ndarray, y_test: np.ndarray) -> dict:
    """Evaluate model performance."""
    # Make predictions
    y_pred = model.predict(X_test)
    y_pred_proba = model.predict_proba(X_test)[:, 1]
    
    # Calculate metrics
    accuracy = model.score(X_test, y_test)
    auc_score = roc_auc_score(y_test, y_pred_proba)
    
    # Classification report
    report = classification_report(y_test, y_pred, output_dict=True)
    
    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    
    metrics = {
        "accuracy": accuracy,
        "auc_score": auc_score,
        "precision": report["1"]["precision"],
        "recall": report["1"]["recall"],
        "f1_score": report["1"]["f1-score"],
        "confusion_matrix": cm.tolist(),
        "classification_report": report
    }
    
    return metrics

def print_evaluation_results(metrics: dict):
    """Print evaluation results."""
    print("\n" + "="*50)
    print("MODEL EVALUATION RESULTS")
    print("="*50)
    
    print(f"Accuracy: {metrics['accuracy']:.3f}")
    print(f"AUC Score: {metrics['auc_score']:.3f}")
    print(f"Precision: {metrics['precision']:.3f}")
    print(f"Recall: {metrics['recall']:.3f}")
    print(f"F1 Score: {metrics['f1_score']:.3f}")
    
    print("\nConfusion Matrix:")
    print(metrics['confusion_matrix'])
    
    print("\nDetailed Classification Report:")
    report = metrics['classification_report']
    for class_name, metrics_dict in report.items():
        if isinstance(metrics_dict, dict):
            print(f"\n{class_name}:")
            for metric, value in metrics_dict.items():
                print(f"  {metric}: {value:.3f}")

def save_evaluation_results(metrics: dict, output_file: str):
    """Save evaluation results to file."""
    results = {
        "evaluation_timestamp": datetime.utcnow().isoformat(),
        "metrics": metrics
    }
    
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    logger.info(f"Evaluation results saved to {output_file}")

def main():
    """Main evaluation function."""
    model_path = "models/trained_model.pkl"
    
    if not Path(model_path).exists():
        logger.error(f"Model file not found: {model_path}")
        logger.info("Please run train.py first to create a model")
        return
    
    # Load model
    model_data = load_model(model_path)
    model = model_data["model"]
    
    # Generate test data
    X_test, y_test = generate_test_data()
    
    # Evaluate model
    logger.info("Evaluating model performance")
    metrics = evaluate_model(model, X_test, y_test)
    
    # Print results
    print_evaluation_results(metrics)
    
    # Save results
    results_file = "evaluation_results.json"
    save_evaluation_results(metrics, results_file)
    
    logger.info("Evaluation completed successfully")

if __name__ == "__main__":
    main()

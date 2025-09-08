"""Test predictor functionality."""

import pytest
from app.predictor import BaselinePredictor, TrainedPredictor
from app.logging_utils import get_logger

logger = get_logger(__name__)

@pytest.fixture
def baseline_predictor():
    """Create baseline predictor for testing."""
    return BaselinePredictor()

@pytest.fixture
def sample_team_stats():
    """Sample team statistics for testing."""
    return {
        "team_id": "team1",
        "team_name": "Team 1",
        "avg_acs": 200.0,
        "avg_kd": 1.2,
        "avg_rating": 1.1,
        "win_rate": 0.6,
        "maps_played": 10,
        "last_updated": "2024-01-01T00:00:00Z"
    }

def test_baseline_predictor_initialization(baseline_predictor):
    """Test baseline predictor initialization."""
    assert baseline_predictor.model is None
    assert baseline_predictor.feature_names is not None
    assert len(baseline_predictor.feature_names) == 12
    assert baseline_predictor.model_version == "baseline_v1.0"

def test_baseline_predictor_extract_features(baseline_predictor, sample_team_stats):
    """Test feature extraction."""
    team1_stats = sample_team_stats
    team2_stats = {
        "team_id": "team2",
        "team_name": "Team 2",
        "avg_acs": 180.0,
        "avg_kd": 1.0,
        "avg_rating": 0.9,
        "win_rate": 0.4,
        "maps_played": 8,
        "last_updated": "2024-01-01T00:00:00Z"
    }
    
    features = baseline_predictor._extract_features(team1_stats, team2_stats)
    
    assert features.shape == (1, 12)
    assert features[0][0] == 200.0  # team1_avg_acs
    assert features[0][4] == 180.0  # team2_avg_acs
    assert features[0][8] == 20.0   # acs_diff (200 - 180)

def test_baseline_predictor_simple_heuristic(baseline_predictor, sample_team_stats):
    """Test simple heuristic prediction."""
    team1_stats = sample_team_stats
    team2_stats = {
        "team_id": "team2",
        "team_name": "Team 2",
        "avg_acs": 150.0,
        "avg_kd": 0.8,
        "avg_rating": 0.7,
        "win_rate": 0.3,
        "maps_played": 5,
        "last_updated": "2024-01-01T00:00:00Z"
    }
    
    winner, confidence = baseline_predictor._simple_heuristic(team1_stats, team2_stats)
    
    assert winner in ["team1", "team2"]
    assert 0.0 <= confidence <= 1.0
    # Team 1 should win based on better stats
    assert winner == "team1"
    assert confidence > 0.5

def test_baseline_predictor_predict(baseline_predictor, sample_team_stats):
    """Test full prediction pipeline."""
    team1_stats = sample_team_stats
    team2_stats = {
        "team_id": "team2",
        "team_name": "Team 2",
        "avg_acs": 150.0,
        "avg_kd": 0.8,
        "avg_rating": 0.7,
        "win_rate": 0.3,
        "maps_played": 5,
        "last_updated": "2024-01-01T00:00:00Z"
    }
    
    prediction = baseline_predictor.predict(team1_stats, team2_stats)
    
    assert "predicted_winner" in prediction
    assert "confidence" in prediction
    assert "team1_win_probability" in prediction
    assert "team2_win_probability" in prediction
    assert "model_version" in prediction
    assert "prediction_timestamp" in prediction
    
    assert prediction["predicted_winner"] in ["team1", "team2"]
    assert 0.0 <= prediction["confidence"] <= 1.0
    assert 0.0 <= prediction["team1_win_probability"] <= 1.0
    assert 0.0 <= prediction["team2_win_probability"] <= 1.0
    assert abs(prediction["team1_win_probability"] + prediction["team2_win_probability"] - 1.0) < 0.001

def test_baseline_predictor_error_handling(baseline_predictor):
    """Test error handling in prediction."""
    # Test with invalid data
    invalid_stats = {"invalid": "data"}
    
    prediction = baseline_predictor.predict(invalid_stats, invalid_stats)
    
    # Should return default prediction
    assert "predicted_winner" in prediction
    assert "confidence" in prediction
    assert prediction["confidence"] == 0.5

def test_trained_predictor_initialization():
    """Test trained predictor initialization."""
    predictor = TrainedPredictor()
    
    assert predictor.model_version == "trained_v1.0"
    assert predictor.model_path is not None
    # Model might be None if no trained model exists
    assert predictor.model is None or hasattr(predictor.model, 'predict')

def test_trained_predictor_without_model():
    """Test trained predictor behavior without trained model."""
    predictor = TrainedPredictor()
    
    # Should fall back to baseline predictor
    team1_stats = {"avg_acs": 200, "avg_kd": 1.2, "avg_rating": 1.1, "win_rate": 0.6}
    team2_stats = {"avg_acs": 180, "avg_kd": 1.0, "avg_rating": 0.9, "win_rate": 0.4}
    
    prediction = predictor.predict(team1_stats, team2_stats)
    
    assert "predicted_winner" in prediction
    assert "confidence" in prediction
    assert prediction["model_version"] == "baseline_v1.0"  # Should fall back to baseline

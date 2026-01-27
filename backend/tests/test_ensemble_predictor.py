"""Test ensemble predictor functionality."""

import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

from app.ensemble_predictor import EnsemblePredictor


@pytest.fixture
def sample_historical_data():
    """Create sample historical match data."""
    now = datetime.now()
    data = []

    teams = ["Team Alpha", "Team Beta", "Team Gamma", "Team Delta"]
    maps = ["Ascent", "Bind", "Haven", "Split"]

    for i in range(50):
        team_a = teams[i % len(teams)]
        team_b = teams[(i + 1) % len(teams)]
        winner = team_a if i % 3 != 0 else team_b

        data.append({
            "date": now - timedelta(days=i * 2),
            "teamA": team_a,
            "teamB": team_b,
            "winner": winner,
            "map_name": maps[i % len(maps)],
            "tier": 1 if i < 25 else 2,
        })

    return pd.DataFrame(data)


@pytest.fixture
def predictor(sample_historical_data, tmp_path):
    """Create ensemble predictor with sample data."""
    pred = EnsemblePredictor(artifacts_dir=str(tmp_path))
    pred.df_hist = sample_historical_data
    return pred


class TestEnsemblePredictor:
    """Tests for EnsemblePredictor class."""

    def test_initialization(self, tmp_path):
        """Test predictor initializes correctly."""
        pred = EnsemblePredictor(artifacts_dir=str(tmp_path))
        assert pred.FEATURE_NAMES is not None
        assert len(pred.FEATURE_NAMES) == 10
        assert not pred.is_trained

    def test_feature_names(self, predictor):
        """Test feature names are correct."""
        expected = [
            'overall_winrate_diff',
            'map_winrate_diff',
            'h2h_advantage',
            'recent_form_diff_5',
            'recent_form_diff_10',
            'experience_diff',
            'rest_advantage',
            'momentum_diff',
            'tier_advantage',
            'region_strength_diff',
        ]
        assert predictor.FEATURE_NAMES == expected

    def test_create_features(self, predictor):
        """Test feature creation."""
        features = predictor._create_features(
            "Team Alpha",
            "Team Beta",
            "Ascent"
        )

        assert isinstance(features, np.ndarray)
        assert features.shape == (10,)
        assert not np.isnan(features).any()

    def test_create_features_unknown_teams(self, predictor):
        """Test feature creation with unknown teams."""
        features = predictor._create_features(
            "Unknown Team 1",
            "Unknown Team 2",
            "Ascent"
        )

        assert isinstance(features, np.ndarray)
        assert features.shape == (10,)
        # Should return zeros for unknown teams
        assert np.allclose(features, 0.0)

    def test_recency_weight(self, predictor):
        """Test recency weight calculation."""
        now = datetime.now()

        # Recent match should have high weight
        recent = predictor._compute_recency_weight(now - timedelta(days=1), now)
        assert 0.9 < recent <= 1.0

        # Old match should have low weight
        old = predictor._compute_recency_weight(now - timedelta(days=60), now)
        assert 0.4 < old < 0.6  # ~0.5 at half-life

        # Very old match should have very low weight
        very_old = predictor._compute_recency_weight(now - timedelta(days=120), now)
        assert very_old < 0.3

    def test_tier_weight(self, predictor):
        """Test tier weight calculation."""
        assert predictor._compute_tier_weight(1) == 2.0
        assert predictor._compute_tier_weight(2) == 1.0
        assert predictor._compute_tier_weight(3) == 0.5
        assert predictor._compute_tier_weight(99) == 1.0  # Unknown tier

    def test_predict_untrained(self, predictor):
        """Test prediction with untrained model."""
        result = predictor.predict("Team Alpha", "Team Beta", "Ascent")

        assert "prob_teamA" in result
        assert "prob_teamB" in result
        assert "winner" in result
        assert "confidence" in result
        assert "model_version" in result
        assert "uncertainty" in result

        # Untrained model returns 0.5
        assert result["prob_teamA"] == 0.5
        assert result["prob_teamB"] == 0.5
        assert result["uncertainty"] == "High"

    @pytest.mark.slow
    def test_train(self, predictor):
        """Test model training."""
        metrics = predictor.train()

        assert "accuracy" in metrics
        assert "train_samples" in metrics
        assert "val_samples" in metrics
        assert "n_base_models" in metrics

        assert predictor.is_trained
        assert len(predictor.base_models) >= 2  # At least logreg + rf

    @pytest.mark.slow
    def test_predict_trained(self, predictor):
        """Test prediction with trained model."""
        predictor.train()

        result = predictor.predict("Team Alpha", "Team Beta", "Ascent")

        assert 0.0 <= result["prob_teamA"] <= 1.0
        assert 0.0 <= result["prob_teamB"] <= 1.0
        assert abs(result["prob_teamA"] + result["prob_teamB"] - 1.0) < 0.001
        assert result["winner"] in ["Team Alpha", "Team Beta"]
        assert result["uncertainty"] in ["Low", "Medium", "High"]

    @pytest.mark.slow
    def test_model_persistence(self, predictor, tmp_path):
        """Test model save and load."""
        predictor.train()

        # Create new predictor loading saved model
        new_predictor = EnsemblePredictor(artifacts_dir=str(tmp_path))
        new_predictor.df_hist = predictor.df_hist

        # Should load the trained model
        assert new_predictor.is_trained

        # Predictions should be consistent
        result1 = predictor.predict("Team Alpha", "Team Beta", "Ascent")
        result2 = new_predictor.predict("Team Alpha", "Team Beta", "Ascent")

        assert abs(result1["prob_teamA"] - result2["prob_teamA"]) < 0.01

    def test_symmetry(self, predictor):
        """Test prediction symmetry (A vs B should equal inverse of B vs A)."""
        predictor.train()

        result_ab = predictor.predict("Team Alpha", "Team Beta", "Ascent")
        result_ba = predictor.predict("Team Beta", "Team Alpha", "Ascent")

        # Probabilities should be swapped
        assert abs(result_ab["prob_teamA"] - result_ba["prob_teamB"]) < 0.1
        assert abs(result_ab["prob_teamB"] - result_ba["prob_teamA"]) < 0.1

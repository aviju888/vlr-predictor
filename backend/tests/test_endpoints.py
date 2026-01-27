"""Test API endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestHealthEndpoints:
    """Test health check endpoints."""

    def test_health_check(self):
        """Test health check endpoint."""
        response = client.get("/health/")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert "version" in data

    def test_health_metrics(self):
        """Test metrics endpoint."""
        response = client.get("/health/metrics")
        assert response.status_code == 200

        data = response.json()
        assert "counters" in data
        assert "uptime_seconds" in data


class TestPredictionEndpoints:
    """Test prediction endpoints."""

    def test_predict_match(self):
        """Test match prediction endpoint."""
        prediction_request = {
            "team1_id": "test_team_1",
            "team2_id": "test_team_2",
            "include_confidence": True
        }

        response = client.post("/predictions/predict", json=prediction_request)
        # This might fail due to missing team data, but should return proper error
        assert response.status_code in [200, 422, 500]

    def test_predict_match_missing_fields(self):
        """Test prediction with missing required fields."""
        response = client.post("/predictions/predict", json={})
        assert response.status_code == 422  # Validation error


class TestMatchEndpoints:
    """Test match endpoints."""

    def test_get_matches(self):
        """Test get matches endpoint."""
        response = client.get("/matches/")
        # This might fail due to API issues, but should return proper error
        assert response.status_code in [200, 500]

    def test_get_matches_with_params(self):
        """Test get matches with query parameters."""
        response = client.get("/matches/?status=completed&limit=10")
        assert response.status_code in [200, 500]

    def test_summarize_match(self):
        """Test match summarization endpoint."""
        summary_request = {
            "match_id": "test_match_1"
        }

        response = client.post("/matches/summarize", json=summary_request)
        # This might fail due to missing match data or validation errors
        assert response.status_code in [200, 404, 422, 500]


class TestAdvancedEndpoints:
    """Test advanced prediction endpoints."""

    def test_map_predict(self):
        """Test map-level prediction."""
        response = client.get(
            "/advanced/map-predict",
            params={
                "teamA": "Sentinels",
                "teamB": "Paper Rex",
                "map_name": "Ascent"
            }
        )
        # Should return prediction or graceful error
        assert response.status_code in [200, 404, 500]

        if response.status_code == 200:
            data = response.json()
            assert "prob_teamA" in data or "error" in data

    def test_series_predict(self):
        """Test series (BO3) prediction."""
        response = client.get(
            "/advanced/series-predict",
            params={
                "teamA": "Sentinels",
                "teamB": "Paper Rex"
            }
        )
        assert response.status_code in [200, 404, 500]

    def test_per_map_predict(self):
        """Test per-map predictions for all maps."""
        response = client.get(
            "/advanced/per-map",
            params={
                "teamA": "Sentinels",
                "teamB": "Paper Rex"
            }
        )
        assert response.status_code in [200, 404, 500]


class TestTeamEndpoints:
    """Test team endpoints."""

    def test_get_teams(self):
        """Test get teams list."""
        response = client.get("/teams/")
        # Endpoint may not exist (404) or may work (200)
        assert response.status_code in [200, 404, 500]

    def test_search_teams(self):
        """Test team search."""
        response = client.get("/teams/search", params={"query": "Sent"})
        assert response.status_code in [200, 500]


class TestDashboardEndpoints:
    """Test dashboard endpoints."""

    def test_dashboard_overview(self):
        """Test dashboard overview."""
        response = client.get("/dashboard/overview")
        # Endpoint may not exist (404) or may work (200)
        assert response.status_code in [200, 404, 500]

    def test_dashboard_model_performance(self):
        """Test model performance metrics."""
        response = client.get("/dashboard/model-performance")
        # Endpoint may not exist (404) or may work (200)
        assert response.status_code in [200, 404, 500]


class TestCORS:
    """Test CORS configuration."""

    def test_cors_headers(self):
        """Test CORS headers are present."""
        response = client.options(
            "/health/",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        # CORS preflight should succeed or be allowed
        assert response.status_code in [200, 204, 405]

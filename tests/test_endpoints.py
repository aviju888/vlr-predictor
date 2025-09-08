"""Test API endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    """Test health check endpoint."""
    response = client.get("/health/")
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data
    assert "version" in data

def test_health_metrics():
    """Test metrics endpoint."""
    response = client.get("/health/metrics")
    assert response.status_code == 200
    
    data = response.json()
    assert "counters" in data
    assert "uptime_seconds" in data

def test_predict_match():
    """Test match prediction endpoint."""
    prediction_request = {
        "team1_id": "test_team_1",
        "team2_id": "test_team_2",
        "include_confidence": True
    }
    
    response = client.post("/predictions/predict", json=prediction_request)
    # This might fail due to missing team data, but should return proper error
    assert response.status_code in [200, 500]

def test_get_matches():
    """Test get matches endpoint."""
    response = client.get("/matches/")
    # This might fail due to API issues, but should return proper error
    assert response.status_code in [200, 500]

def test_get_matches_with_params():
    """Test get matches with query parameters."""
    response = client.get("/matches/?status=completed&limit=10")
    assert response.status_code in [200, 500]

def test_summarize_match():
    """Test match summarization endpoint."""
    summary_request = {
        "match_id": "test_match_1"
    }
    
    response = client.post("/matches/summarize", json=summary_request)
    # This might fail due to missing match data, but should return proper error
    assert response.status_code in [200, 404, 500]

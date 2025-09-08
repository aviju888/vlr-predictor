"""Test feature store functionality."""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch
from app.features import FeatureStore
from app.logging_utils import get_logger

logger = get_logger(__name__)

@pytest.fixture
def feature_store():
    """Create feature store instance for testing."""
    return FeatureStore()

@pytest.mark.asyncio
async def test_get_team_stats_cache_hit(feature_store):
    """Test team stats retrieval with cache hit."""
    # Mock team stats
    mock_stats = {
        "team_id": "test_team",
        "team_name": "Test Team",
        "avg_acs": 200.0,
        "avg_kd": 1.2,
        "avg_rating": 1.1,
        "win_rate": 0.6,
        "maps_played": 10,
        "last_updated": "2024-01-01T00:00:00Z"
    }
    
    # Add to cache
    cache_key = feature_store._get_cache_key("team_stats", "test_team")
    feature_store.cache[cache_key] = mock_stats
    
    # Test retrieval
    result = await feature_store.get_team_stats("test_team")
    assert result == mock_stats

@pytest.mark.asyncio
async def test_get_team_stats_cache_miss(feature_store):
    """Test team stats retrieval with cache miss."""
    with patch('app.features.vlr_client.get_team_stats') as mock_get_stats:
        # Mock API response
        mock_get_stats.return_value = {
            "team": {"name": "Test Team"},
            "matches": [
                {"team_performance": {"avg_acs": 200, "avg_kd": 1.2, "avg_rating": 1.1, "won": True}}
            ]
        }
        
        result = await feature_store.get_team_stats("test_team")
        
        # Verify API was called
        mock_get_stats.assert_called_once()
        
        # Verify result structure
        assert "team_id" in result
        assert "team_name" in result
        assert "avg_acs" in result
        assert "avg_kd" in result
        assert "avg_rating" in result
        assert "win_rate" in result

@pytest.mark.asyncio
async def test_get_team_stats_api_error(feature_store):
    """Test team stats retrieval when API fails."""
    with patch('app.features.vlr_client.get_team_stats') as mock_get_stats:
        # Mock API error
        mock_get_stats.side_effect = Exception("API Error")
        
        result = await feature_store.get_team_stats("test_team")
        
        # Should return default stats
        assert result["team_id"] == "test_team"
        assert result["team_name"] == "Unknown"
        assert result["avg_acs"] == 0.0

def test_cache_key_generation(feature_store):
    """Test cache key generation."""
    key = feature_store._get_cache_key("team_stats", "test_team")
    assert key == "team_stats:test_team"

def test_clear_cache(feature_store):
    """Test cache clearing."""
    # Add some data to cache
    feature_store.cache["test_key"] = "test_value"
    assert len(feature_store.cache) == 1
    
    # Clear cache
    feature_store.clear_cache()
    assert len(feature_store.cache) == 0

def test_get_cache_stats(feature_store):
    """Test cache statistics."""
    stats = feature_store.get_cache_stats()
    assert "cache_size" in stats
    assert "max_size" in stats
    assert "ttl" in stats

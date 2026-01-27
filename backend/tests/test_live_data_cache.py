"""Tests for live data cache functionality."""

import pytest
import asyncio
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
import sqlite3
import tempfile

from app.live_data_cache import LiveDataCache


@pytest.fixture
def temp_db():
    """Create a temporary database for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_cache.db"
        yield str(db_path)


@pytest.fixture
def cache(temp_db):
    """Create a LiveDataCache instance with temp database."""
    return LiveDataCache(db_path=temp_db)


class TestLiveDataCache:
    """Tests for LiveDataCache class."""

    def test_initialization(self, cache, temp_db):
        """Test cache initializes with correct database schema."""
        assert cache.db_path.exists()

        with sqlite3.connect(temp_db) as conn:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
            tables = [row[0] for row in cursor.fetchall()]
            assert "team_matches" in tables

    def test_store_and_retrieve_data(self, cache):
        """Test storing and retrieving team data."""
        test_data = pd.DataFrame([
            {
                "team_name": "TestTeam",
                "match_date": datetime.now().isoformat(),
                "opponent": "OtherTeam",
                "map_name": "Ascent",
                "result": "win",
                "tournament": "Test Tournament",
                "region": "NA",
                "raw_data": "{}",
            }
        ])

        cache._store_team_data("TestTeam", test_data)

        # Retrieve the data
        retrieved = cache._get_cached_data("TestTeam", days=365)

        assert len(retrieved) == 1
        assert retrieved.iloc[0]["team_name"] == "TestTeam"
        assert retrieved.iloc[0]["opponent"] == "OtherTeam"

    def test_cache_age_calculation(self, cache):
        """Test cache age calculation."""
        # No data should return very high age
        age = cache._get_cache_age_hours("NonexistentTeam")
        assert age >= 999.0

        # Add some data
        test_data = pd.DataFrame([
            {
                "team_name": "TestTeam",
                "match_date": datetime.now().isoformat(),
                "opponent": "OtherTeam",
                "map_name": "Ascent",
                "result": "win",
                "tournament": "Test",
                "region": "NA",
                "raw_data": "{}",
            }
        ])
        cache._store_team_data("TestTeam", test_data)

        # Should be very recent (< 1 hour)
        age = cache._get_cache_age_hours("TestTeam")
        assert age < 1.0

    def test_cleanup_old_data(self, cache):
        """Test cleanup of old cached data."""
        # Add old data manually
        old_date = (datetime.now() - timedelta(days=60)).isoformat()

        with sqlite3.connect(cache.db_path) as conn:
            conn.execute(
                """
                INSERT INTO team_matches
                (team_name, match_date, opponent, map_name, result,
                 tournament, region, cached_at, raw_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "OldTeam", old_date, "Opponent", "Ascent",
                    "win", "Tournament", "NA", old_date, "{}"
                )
            )

        # Run cleanup
        deleted = cache.cleanup_old_data(days_to_keep=30)

        assert deleted == 1

        # Verify data was deleted
        with sqlite3.connect(cache.db_path) as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM team_matches WHERE team_name = ?",
                ("OldTeam",)
            ).fetchone()[0]
            assert count == 0

    def test_cache_stats(self, cache):
        """Test cache statistics."""
        stats = cache.get_cache_stats()

        assert "total_records" in stats
        assert "unique_teams" in stats
        assert "recent_records_24h" in stats
        assert "database_size_mb" in stats

        # Empty cache should have 0 records
        assert stats["total_records"] == 0

    def test_get_cached_data_date_filter(self, cache):
        """Test date filtering when retrieving cached data."""
        now = datetime.now()

        # Add recent and old data
        recent_data = pd.DataFrame([
            {
                "team_name": "TestTeam",
                "match_date": now.isoformat(),
                "opponent": "Recent",
                "map_name": "Ascent",
                "result": "win",
                "tournament": "Test",
                "region": "NA",
                "raw_data": "{}",
            }
        ])
        cache._store_team_data("TestTeam", recent_data)

        # Insert old data directly
        old_date = (now - timedelta(days=400)).isoformat()
        with sqlite3.connect(cache.db_path) as conn:
            conn.execute(
                """
                INSERT INTO team_matches
                (team_name, match_date, opponent, map_name, result,
                 tournament, region, cached_at, raw_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "TestTeam", old_date, "OldOpponent", "Bind",
                    "loss", "Tournament", "NA", now.isoformat(), "{}"
                )
            )

        # 365-day filter should only get recent data
        filtered = cache._get_cached_data("TestTeam", days=365)
        assert len(filtered) == 1
        assert filtered.iloc[0]["opponent"] == "Recent"

    def test_empty_dataframe_handling(self, cache):
        """Test handling of empty dataframes."""
        empty_df = pd.DataFrame()
        cache._store_team_data("TestTeam", empty_df)

        # Should not create any records
        stats = cache.get_cache_stats()
        assert stats["total_records"] == 0


@pytest.mark.asyncio
class TestLiveDataCacheAsync:
    """Async tests for LiveDataCache."""

    async def test_get_team_data_empty_cache(self, cache):
        """Test getting team data with empty cache (will try to fetch)."""
        # This will attempt to fetch from API which may fail
        # but should not raise an exception
        result = await cache.get_team_data("NonexistentTeam", days=30)

        # Should return empty or fetched data
        assert isinstance(result, pd.DataFrame)

    async def test_get_prediction_data(self, cache):
        """Test getting prediction data for two teams."""
        # Add some mock data for both teams
        for team in ["TeamA", "TeamB"]:
            test_data = pd.DataFrame([
                {
                    "team_name": team,
                    "match_date": datetime.now().isoformat(),
                    "opponent": "Other",
                    "map_name": "Ascent",
                    "result": "win",
                    "tournament": "Test",
                    "region": "NA",
                    "raw_data": "{}",
                }
            ])
            cache._store_team_data(team, test_data)

        # Should fetch data for both teams
        teamA_data, teamB_data = await cache.get_prediction_data("TeamA", "TeamB")

        assert isinstance(teamA_data, pd.DataFrame)
        assert isinstance(teamB_data, pd.DataFrame)


@pytest.fixture
def cache(temp_db):
    """Create a LiveDataCache instance with temp database."""
    return LiveDataCache(db_path=temp_db)

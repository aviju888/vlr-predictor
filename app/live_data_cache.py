"""
Live Data Cache System
======================

Dynamic team data collection with intelligent caching:
- Live API calls when user requests predictions
- 100-day lookback for comprehensive team history  
- Local SQLite database for fast subsequent queries
- TTL cleanup to manage storage space
- Hybrid approach: cached + fresh data
"""

import sqlite3
import asyncio
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from pathlib import Path
import json
from app.vlrgg_integration import fetch_map_matches_vlrgg
from app.logging_utils import get_logger

logger = get_logger(__name__)

class LiveDataCache:
    """Intelligent cache for live team data with 100-day lookbacks."""
    
    def __init__(self, db_path: str = "./data/live_cache.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(exist_ok=True)
        self._init_database()
        
    def _init_database(self):
        """Initialize SQLite database for caching."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS team_matches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    team_name TEXT NOT NULL,
                    match_date TEXT NOT NULL,
                    opponent TEXT NOT NULL,
                    map_name TEXT NOT NULL,
                    result TEXT NOT NULL,  -- 'win' or 'loss'
                    tournament TEXT,
                    region TEXT,
                    cached_at TEXT NOT NULL,
                    raw_data TEXT,  -- JSON of full match data
                    UNIQUE(team_name, match_date, opponent, map_name)
                )
            """)
            
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_team_date 
                ON team_matches(team_name, match_date)
            """)
            
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_cached_at 
                ON team_matches(cached_at)
            """)
            
        logger.info(f"✅ Initialized live data cache: {self.db_path}")
    
    async def get_team_data(self, team_name: str, days: int = 100) -> pd.DataFrame:
        """Get comprehensive team data with live API calls if needed."""
        
        # Check cache first
        cached_data = self._get_cached_data(team_name, days)
        cache_age_hours = self._get_cache_age_hours(team_name)
        
        # Determine if we need fresh data
        needs_refresh = (
            cached_data.empty or 
            cache_age_hours > 24 or  # Refresh daily
            len(cached_data) < 5     # Too little data
        )
        
        if needs_refresh:
            logger.info(f"🔄 Fetching fresh data for {team_name} (cache age: {cache_age_hours:.1f}h)")
            
            try:
                # Fetch fresh data from VLR.gg
                fresh_data = await self._fetch_team_matches(team_name, days)
                
                if not fresh_data.empty:
                    # Store in cache
                    self._store_team_data(team_name, fresh_data)
                    logger.info(f"✅ Cached {len(fresh_data)} matches for {team_name}")
                    
                    # Combine with existing cache
                    all_data = pd.concat([cached_data, fresh_data]).drop_duplicates(
                        subset=['team_name', 'match_date', 'opponent', 'map_name']
                    )
                    return all_data.sort_values('match_date', ascending=False)
                else:
                    logger.warning(f"⚠️ No fresh data found for {team_name}")
                    
            except Exception as e:
                logger.error(f"❌ Failed to fetch fresh data for {team_name}: {e}")
        
        # Return cached data (or empty if no cache and API failed)
        return cached_data
    
    def _get_cached_data(self, team_name: str, days: int) -> pd.DataFrame:
        """Get cached data for a team."""
        
        cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()
        
        with sqlite3.connect(self.db_path) as conn:
            query = """
                SELECT team_name, match_date, opponent, map_name, result, 
                       tournament, region, raw_data
                FROM team_matches 
                WHERE team_name = ? AND match_date >= ?
                ORDER BY match_date DESC
            """
            
            df = pd.read_sql_query(query, conn, params=(team_name, cutoff_date))
            
            if not df.empty:
                df['match_date'] = pd.to_datetime(df['match_date'])
                logger.info(f"📋 Found {len(df)} cached matches for {team_name}")
            
            return df
    
    def _get_cache_age_hours(self, team_name: str) -> float:
        """Get age of cached data in hours."""
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT MAX(cached_at) FROM team_matches WHERE team_name = ?
            """, (team_name,))
            
            result = cursor.fetchone()[0]
            
            if result:
                cached_time = datetime.fromisoformat(result)
                age_hours = (datetime.now() - cached_time).total_seconds() / 3600
                return age_hours
            else:
                return 999.0  # No cache
    
    async def _fetch_team_matches(self, team_name: str, days: int) -> pd.DataFrame:
        """Fetch team matches from VLR.gg API."""
        
        try:
            # Use our existing VLR.gg integration
            all_matches = await fetch_map_matches_vlrgg(days=days, limit=500)
            
            if all_matches.empty:
                return pd.DataFrame()
            
            # Filter for this team
            team_matches = all_matches[
                (all_matches['teamA'] == team_name) | 
                (all_matches['teamB'] == team_name)
            ].copy()
            
            if team_matches.empty:
                logger.warning(f"⚠️ No matches found for {team_name} in VLR.gg data")
                return pd.DataFrame()
            
            # Transform to our cache format
            cache_rows = []
            for _, match in team_matches.iterrows():
                # Determine if this team won
                team_won = match['winner'] == team_name
                opponent = match['teamB'] if match['teamA'] == team_name else match['teamA']
                
                cache_rows.append({
                    'team_name': team_name,
                    'match_date': match['date'],
                    'opponent': opponent,
                    'map_name': match['map_name'],
                    'result': 'win' if team_won else 'loss',
                    'tournament': match.get('tournament', 'Unknown'),
                    'region': match.get('region', 'Unknown'),
                    'raw_data': json.dumps(match.to_dict())
                })
            
            return pd.DataFrame(cache_rows)
            
        except Exception as e:
            logger.error(f"❌ Error fetching matches for {team_name}: {e}")
            return pd.DataFrame()
    
    def _store_team_data(self, team_name: str, data: pd.DataFrame):
        """Store team data in cache."""
        
        if data.empty:
            return
        
        cache_time = datetime.now().isoformat()
        
        with sqlite3.connect(self.db_path) as conn:
            for _, row in data.iterrows():
                conn.execute("""
                    INSERT OR REPLACE INTO team_matches 
                    (team_name, match_date, opponent, map_name, result, 
                     tournament, region, cached_at, raw_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    row['team_name'],
                    row['match_date'].isoformat() if hasattr(row['match_date'], 'isoformat') else str(row['match_date']),
                    row['opponent'],
                    row['map_name'],
                    row['result'],
                    row.get('tournament', 'Unknown'),
                    row.get('region', 'Unknown'),
                    cache_time,
                    row.get('raw_data', '{}')
                ))
    
    def cleanup_old_data(self, days_to_keep: int = 30):
        """Clean up data older than specified days."""
        
        cutoff_date = (datetime.now() - timedelta(days=days_to_keep)).isoformat()
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                DELETE FROM team_matches WHERE cached_at < ?
            """, (cutoff_date,))
            
            deleted_count = cursor.rowcount
            
        if deleted_count > 0:
            logger.info(f"🧹 Cleaned up {deleted_count} old cached records")
        
        return deleted_count
    
    async def get_prediction_data(self, teamA: str, teamB: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Get comprehensive data for both teams for prediction."""
        
        logger.info(f"📡 Getting live data for {teamA} vs {teamB} (100-day lookback)")
        
        # Fetch data for both teams concurrently
        teamA_task = self.get_team_data(teamA, days=100)
        teamB_task = self.get_team_data(teamB, days=100)
        
        teamA_data, teamB_data = await asyncio.gather(teamA_task, teamB_task)
        
        # Clean up old data periodically (every 10th request)
        import random
        if random.randint(1, 10) == 1:
            self.cleanup_old_data(days_to_keep=30)
        
        logger.info(f"📊 Data summary: {teamA}={len(teamA_data)} matches, {teamB}={len(teamB_data)} matches")
        
        return teamA_data, teamB_data
    
    def get_cache_stats(self) -> Dict:
        """Get cache statistics."""
        
        with sqlite3.connect(self.db_path) as conn:
            # Total records
            total_records = conn.execute("SELECT COUNT(*) FROM team_matches").fetchone()[0]
            
            # Unique teams
            unique_teams = conn.execute("SELECT COUNT(DISTINCT team_name) FROM team_matches").fetchone()[0]
            
            # Recent records (last 24 hours)
            recent_cutoff = (datetime.now() - timedelta(hours=24)).isoformat()
            recent_records = conn.execute("""
                SELECT COUNT(*) FROM team_matches WHERE cached_at >= ?
            """, (recent_cutoff,)).fetchone()[0]
            
            # Oldest record
            oldest = conn.execute("SELECT MIN(cached_at) FROM team_matches").fetchone()[0]
            
        return {
            "total_records": total_records,
            "unique_teams": unique_teams,
            "recent_records_24h": recent_records,
            "oldest_cache": oldest,
            "database_size_mb": self.db_path.stat().st_size / (1024 * 1024) if self.db_path.exists() else 0
        }

# Global cache instance
live_cache = LiveDataCache()

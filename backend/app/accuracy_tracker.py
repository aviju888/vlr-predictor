"""Prediction accuracy tracking system.

Stores predictions and compares them against actual match outcomes
to calculate and display historical accuracy.
"""

import sqlite3
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional
from app.logging_utils import get_logger

logger = get_logger(__name__)


class AccuracyTracker:
    """Tracks prediction accuracy by storing predictions and outcomes."""

    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            data_dir = Path(__file__).parent.parent / "data"
            data_dir.mkdir(exist_ok=True)
            db_path = str(data_dir / "accuracy_tracker.db")
        self.db_path = db_path
        self._init_database()

    def _init_database(self):
        """Initialize the SQLite database with required tables."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS predictions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        team_a TEXT NOT NULL,
                        team_b TEXT NOT NULL,
                        map_name TEXT NOT NULL,
                        predicted_winner TEXT NOT NULL,
                        confidence REAL NOT NULL,
                        prob_team_a REAL NOT NULL,
                        prob_team_b REAL NOT NULL,
                        model_version TEXT,
                        prediction_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        actual_winner TEXT,
                        outcome_recorded_time TIMESTAMP,
                        is_correct INTEGER,
                        UNIQUE(team_a, team_b, map_name, prediction_time)
                    )
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_predictions_teams
                    ON predictions(team_a, team_b)
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_predictions_time
                    ON predictions(prediction_time)
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_predictions_outcome
                    ON predictions(is_correct)
                """)
            logger.info(f"✅ Initialized accuracy tracker: {self.db_path}")
        except Exception as e:
            logger.error(f"Failed to initialize accuracy tracker: {e}")

    def log_prediction(
        self,
        team_a: str,
        team_b: str,
        map_name: str,
        predicted_winner: str,
        confidence: float,
        prob_team_a: float,
        prob_team_b: float,
        model_version: str = "unknown"
    ) -> int:
        """Log a new prediction to the database.

        Returns the prediction ID for later outcome recording.
        """
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    INSERT INTO predictions
                    (team_a, team_b, map_name, predicted_winner, confidence,
                     prob_team_a, prob_team_b, model_version)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    team_a, team_b, map_name, predicted_winner, confidence,
                    prob_team_a, prob_team_b, model_version
                ))
                prediction_id = cursor.lastrowid
                logger.info(f"Logged prediction {prediction_id}: {team_a} vs {team_b} on {map_name}")
                return prediction_id
        except sqlite3.IntegrityError:
            logger.warning(f"Duplicate prediction for {team_a} vs {team_b} on {map_name}")
            return -1
        except Exception as e:
            logger.error(f"Failed to log prediction: {e}")
            return -1

    def record_outcome(
        self,
        prediction_id: int = None,
        team_a: str = None,
        team_b: str = None,
        map_name: str = None,
        actual_winner: str = None
    ) -> bool:
        """Record the actual outcome of a match.

        Can look up by prediction_id or by team_a, team_b, map_name.
        """
        try:
            with sqlite3.connect(self.db_path) as conn:
                if prediction_id:
                    # Look up by ID
                    row = conn.execute(
                        "SELECT team_a, team_b, predicted_winner FROM predictions WHERE id = ?",
                        (prediction_id,)
                    ).fetchone()
                    if not row:
                        logger.warning(f"Prediction {prediction_id} not found")
                        return False
                    team_a, team_b, predicted_winner = row
                else:
                    # Look up by match details (most recent prediction)
                    row = conn.execute("""
                        SELECT id, predicted_winner FROM predictions
                        WHERE team_a = ? AND team_b = ? AND map_name = ?
                        AND actual_winner IS NULL
                        ORDER BY prediction_time DESC LIMIT 1
                    """, (team_a, team_b, map_name)).fetchone()
                    if not row:
                        logger.warning(f"No unresolved prediction found for {team_a} vs {team_b} on {map_name}")
                        return False
                    prediction_id, predicted_winner = row

                # Determine if prediction was correct
                is_correct = 1 if predicted_winner == actual_winner else 0

                conn.execute("""
                    UPDATE predictions
                    SET actual_winner = ?,
                        outcome_recorded_time = CURRENT_TIMESTAMP,
                        is_correct = ?
                    WHERE id = ?
                """, (actual_winner, is_correct, prediction_id))

                logger.info(
                    f"Recorded outcome for prediction {prediction_id}: "
                    f"predicted {predicted_winner}, actual {actual_winner} "
                    f"({'CORRECT' if is_correct else 'WRONG'})"
                )
                return True

        except Exception as e:
            logger.error(f"Failed to record outcome: {e}")
            return False

    def get_accuracy_stats(self, days: int = 30, model_version: str = None) -> Dict:
        """Get accuracy statistics for the specified period."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cutoff = datetime.now() - timedelta(days=days)
                cutoff_str = cutoff.strftime("%Y-%m-%d %H:%M:%S")

                # Base query
                where_clause = "WHERE is_correct IS NOT NULL AND prediction_time >= ?"
                params = [cutoff_str]

                if model_version:
                    where_clause += " AND model_version = ?"
                    params.append(model_version)

                # Overall stats
                row = conn.execute(f"""
                    SELECT
                        COUNT(*) as total,
                        SUM(is_correct) as correct,
                        AVG(confidence) as avg_confidence
                    FROM predictions {where_clause}
                """, params).fetchone()

                total = row[0] or 0
                correct = row[1] or 0
                avg_confidence = row[2] or 0

                accuracy = correct / total if total > 0 else 0

                # Accuracy by confidence bucket
                confidence_buckets = []
                for low, high in [(0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 0.9), (0.9, 1.0)]:
                    bucket_row = conn.execute(f"""
                        SELECT
                            COUNT(*) as total,
                            SUM(is_correct) as correct
                        FROM predictions
                        {where_clause} AND confidence >= ? AND confidence < ?
                    """, params + [low, high]).fetchone()
                    bucket_total = bucket_row[0] or 0
                    bucket_correct = bucket_row[1] or 0
                    confidence_buckets.append({
                        "range": f"{int(low*100)}-{int(high*100)}%",
                        "total": bucket_total,
                        "correct": bucket_correct,
                        "accuracy": bucket_correct / bucket_total if bucket_total > 0 else 0
                    })

                # Accuracy by map
                map_stats = []
                map_rows = conn.execute(f"""
                    SELECT
                        map_name,
                        COUNT(*) as total,
                        SUM(is_correct) as correct
                    FROM predictions {where_clause}
                    GROUP BY map_name
                    ORDER BY total DESC
                """, params).fetchall()
                for map_row in map_rows:
                    map_name, map_total, map_correct = map_row
                    map_stats.append({
                        "map": map_name,
                        "total": map_total,
                        "correct": map_correct or 0,
                        "accuracy": (map_correct or 0) / map_total if map_total > 0 else 0
                    })

                # Recent predictions
                recent = []
                recent_rows = conn.execute(f"""
                    SELECT team_a, team_b, map_name, predicted_winner,
                           actual_winner, confidence, is_correct, prediction_time
                    FROM predictions
                    {where_clause}
                    ORDER BY prediction_time DESC
                    LIMIT 20
                """, params).fetchall()
                for r in recent_rows:
                    recent.append({
                        "team_a": r[0],
                        "team_b": r[1],
                        "map": r[2],
                        "predicted": r[3],
                        "actual": r[4],
                        "confidence": r[5],
                        "correct": bool(r[6]),
                        "time": r[7]
                    })

                return {
                    "period_days": days,
                    "total_predictions": total,
                    "correct_predictions": correct,
                    "accuracy": accuracy,
                    "accuracy_percentage": f"{accuracy * 100:.1f}%",
                    "avg_confidence": avg_confidence,
                    "calibration_error": abs(accuracy - avg_confidence),
                    "by_confidence": confidence_buckets,
                    "by_map": map_stats,
                    "recent_predictions": recent,
                    "generated_at": datetime.now().isoformat()
                }

        except Exception as e:
            logger.error(f"Failed to get accuracy stats: {e}")
            return {"error": str(e)}

    def get_pending_predictions(self, limit: int = 50) -> List[Dict]:
        """Get predictions that don't have outcomes recorded yet."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute("""
                    SELECT id, team_a, team_b, map_name, predicted_winner,
                           confidence, prediction_time
                    FROM predictions
                    WHERE actual_winner IS NULL
                    ORDER BY prediction_time DESC
                    LIMIT ?
                """, (limit,)).fetchall()

                return [
                    {
                        "id": r[0],
                        "team_a": r[1],
                        "team_b": r[2],
                        "map": r[3],
                        "predicted_winner": r[4],
                        "confidence": r[5],
                        "prediction_time": r[6]
                    }
                    for r in rows
                ]
        except Exception as e:
            logger.error(f"Failed to get pending predictions: {e}")
            return []


# Global instance
accuracy_tracker = AccuracyTracker()

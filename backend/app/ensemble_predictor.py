"""Ensemble predictor using XGBoost, LightGBM, and LogisticRegression with stacking."""

import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Optional, List, Tuple
from datetime import datetime, timedelta
from pathlib import Path

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV

try:
    import xgboost as xgb
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False

try:
    import lightgbm as lgb
    HAS_LIGHTGBM = True
except ImportError:
    HAS_LIGHTGBM = False


class EnsemblePredictor:
    """
    Stacking ensemble predictor combining:
    - XGBoost (primary)
    - LightGBM (secondary)
    - LogisticRegression (baseline)

    Uses a meta-learner (LogisticRegression) on base model outputs.
    """

    FEATURE_NAMES = [
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

    # Weights for recency (exponential decay with 30-day half-life)
    RECENCY_HALF_LIFE = 30.0

    def __init__(self, artifacts_dir: Optional[str] = None):
        if artifacts_dir is None:
            artifacts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "artifacts")
        self.artifacts_dir = Path(artifacts_dir)
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)

        self.base_models: Dict[str, any] = {}
        self.meta_learner = None
        self.scaler = StandardScaler()
        self.calibrator = None
        self.df_hist = None
        self.is_trained = False

        self._load_model()
        self._load_historical_data()

    def _load_model(self) -> None:
        """Load trained ensemble model if exists."""
        model_path = self.artifacts_dir / "ensemble_model.joblib"
        if model_path.exists():
            try:
                saved = joblib.load(model_path)
                self.base_models = saved.get('base_models', {})
                self.meta_learner = saved.get('meta_learner')
                self.scaler = saved.get('scaler', StandardScaler())
                self.calibrator = saved.get('calibrator')
                self.is_trained = True
                print("Ensemble model loaded successfully")
            except Exception as e:
                print(f"Failed to load ensemble model: {e}")

    def _load_historical_data(self) -> None:
        """Load historical match data for feature computation."""
        data_dir = Path(__file__).parent.parent / "data"
        csv_path = data_dir / "map_matches_365d.csv"

        if csv_path.exists():
            self.df_hist = pd.read_csv(csv_path)
            self.df_hist["date"] = pd.to_datetime(self.df_hist["date"])
            print(f"Loaded {len(self.df_hist)} historical matches")
        else:
            self.df_hist = pd.DataFrame()
            print("No historical data found")

    def _compute_recency_weight(self, match_date: datetime, ref_date: datetime) -> float:
        """Exponential decay weight based on match age."""
        days_ago = (ref_date - match_date).days
        return 0.5 ** (days_ago / self.RECENCY_HALF_LIFE)

    def _compute_tier_weight(self, tier: int) -> float:
        """Weight by tournament tier (T1 = 2.0, T2 = 1.0, T3 = 0.5)."""
        return {1: 2.0, 2: 1.0, 3: 0.5}.get(tier, 1.0)

    def _create_features(
        self,
        team_a: str,
        team_b: str,
        map_name: str,
        match_date: Optional[datetime] = None
    ) -> np.ndarray:
        """Create feature vector for a prediction."""
        if match_date is None:
            match_date = datetime.now()

        if self.df_hist is None or self.df_hist.empty:
            return np.zeros(len(self.FEATURE_NAMES))

        # Only use historical data before the match
        hist = self.df_hist[self.df_hist['date'] < match_date].copy()

        # Team histories
        team_a_hist = hist[(hist['teamA'] == team_a) | (hist['teamB'] == team_a)]
        team_b_hist = hist[(hist['teamA'] == team_b) | (hist['teamB'] == team_b)]

        # 1. Overall winrate difference (weighted by recency + tier)
        def weighted_winrate(team_hist: pd.DataFrame, team: str) -> float:
            if team_hist.empty:
                return 0.5
            weights = []
            wins = []
            for _, row in team_hist.iterrows():
                w = self._compute_recency_weight(row['date'], match_date)
                w *= self._compute_tier_weight(row.get('tier', 2))
                weights.append(w)
                wins.append(1.0 if row['winner'] == team else 0.0)
            if sum(weights) == 0:
                return 0.5
            return sum(w * win for w, win in zip(weights, wins)) / sum(weights)

        winrate_a = weighted_winrate(team_a_hist, team_a)
        winrate_b = weighted_winrate(team_b_hist, team_b)
        overall_winrate_diff = winrate_a - winrate_b

        # 2. Map-specific winrate difference
        team_a_map = team_a_hist[team_a_hist['map_name'] == map_name]
        team_b_map = team_b_hist[team_b_hist['map_name'] == map_name]
        map_winrate_a = weighted_winrate(team_a_map, team_a)
        map_winrate_b = weighted_winrate(team_b_map, team_b)
        map_winrate_diff = map_winrate_a - map_winrate_b

        # 3. Head-to-head advantage (on this specific map)
        h2h = hist[
            ((hist['teamA'] == team_a) & (hist['teamB'] == team_b)) |
            ((hist['teamA'] == team_b) & (hist['teamB'] == team_a))
        ]
        h2h_map = h2h[h2h['map_name'] == map_name]
        if len(h2h_map) > 0:
            h2h_wins_a = len(h2h_map[h2h_map['winner'] == team_a])
            h2h_advantage = (h2h_wins_a / len(h2h_map)) - 0.5
        else:
            # Fall back to overall H2H
            if len(h2h) > 0:
                h2h_wins_a = len(h2h[h2h['winner'] == team_a])
                h2h_advantage = (h2h_wins_a / len(h2h)) - 0.5
            else:
                h2h_advantage = 0.0

        # 4-5. Recent form (last 5 and 10 matches)
        def recent_form(team_hist: pd.DataFrame, team: str, n: int) -> float:
            recent = team_hist.tail(n)
            if recent.empty:
                return 0.5
            wins = len(recent[recent['winner'] == team])
            return wins / len(recent)

        form_a_5 = recent_form(team_a_hist, team_a, 5)
        form_b_5 = recent_form(team_b_hist, team_b, 5)
        recent_form_diff_5 = form_a_5 - form_b_5

        form_a_10 = recent_form(team_a_hist, team_a, 10)
        form_b_10 = recent_form(team_b_hist, team_b, 10)
        recent_form_diff_10 = form_a_10 - form_b_10

        # 6. Experience difference (total matches played)
        experience_diff = len(team_a_hist) - len(team_b_hist)
        # Normalize to reasonable range
        experience_diff = np.clip(experience_diff / 50, -1, 1)

        # 7. Rest advantage (days since last match)
        def days_since_last(team_hist: pd.DataFrame) -> int:
            if team_hist.empty:
                return 14  # Default
            last_date = team_hist['date'].max()
            return (match_date - last_date).days

        rest_a = days_since_last(team_a_hist)
        rest_b = days_since_last(team_b_hist)
        # Optimal rest is ~3-7 days; too much or too little is bad
        rest_advantage = np.clip((rest_b - rest_a) / 14, -1, 1)

        # 8. Momentum (current win streak)
        def win_streak(team_hist: pd.DataFrame, team: str) -> int:
            if team_hist.empty:
                return 0
            streak = 0
            for _, row in team_hist.iloc[::-1].iterrows():
                if row['winner'] == team:
                    streak += 1
                else:
                    break
            return streak

        streak_a = win_streak(team_a_hist, team_a)
        streak_b = win_streak(team_b_hist, team_b)
        momentum_diff = np.clip((streak_a - streak_b) / 5, -1, 1)

        # 9. Tier advantage (average tier of recent matches)
        def avg_tier(team_hist: pd.DataFrame) -> float:
            recent = team_hist.tail(10)
            if 'tier' not in recent.columns or recent.empty:
                return 2.0
            return recent['tier'].mean()

        tier_a = avg_tier(team_a_hist)
        tier_b = avg_tier(team_b_hist)
        tier_advantage = tier_b - tier_a  # Lower tier = better

        # 10. Region strength difference (placeholder - would need region Elo)
        region_strength_diff = 0.0  # TODO: implement region Elo

        return np.array([
            overall_winrate_diff,
            map_winrate_diff,
            h2h_advantage,
            recent_form_diff_5,
            recent_form_diff_10,
            experience_diff,
            rest_advantage,
            momentum_diff,
            tier_advantage,
            region_strength_diff,
        ])

    def train(self, df: Optional[pd.DataFrame] = None) -> Dict[str, float]:
        """Train the ensemble model."""
        if df is None:
            df = self.df_hist

        if df is None or df.empty:
            raise ValueError("No training data available")

        # Build feature matrix
        X_list = []
        y_list = []
        weights = []

        for idx, row in df.iterrows():
            features = self._create_features(
                row['teamA'],
                row['teamB'],
                row['map_name'],
                row['date']
            )
            X_list.append(features)
            y_list.append(1 if row['winner'] == row['teamA'] else 0)

            # Sample weight = recency * tier
            w = self._compute_recency_weight(row['date'], df['date'].max())
            w *= self._compute_tier_weight(row.get('tier', 2))
            weights.append(w)

        X = np.array(X_list)
        y = np.array(y_list)
        weights = np.array(weights)

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Time-based split (last 25% for validation)
        split_idx = int(len(X) * 0.75)
        X_train, X_val = X_scaled[:split_idx], X_scaled[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]
        w_train = weights[:split_idx]

        # Train base models
        self.base_models = {}

        # 1. XGBoost
        if HAS_XGBOOST:
            xgb_model = xgb.XGBClassifier(
                n_estimators=100,
                max_depth=5,
                learning_rate=0.1,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                use_label_encoder=False,
                eval_metric='logloss'
            )
            xgb_model.fit(X_train, y_train, sample_weight=w_train)
            self.base_models['xgboost'] = xgb_model
            print(f"XGBoost trained - Val acc: {xgb_model.score(X_val, y_val):.3f}")

        # 2. LightGBM
        if HAS_LIGHTGBM:
            lgb_model = lgb.LGBMClassifier(
                n_estimators=100,
                max_depth=5,
                learning_rate=0.1,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                verbose=-1
            )
            lgb_model.fit(X_train, y_train, sample_weight=w_train)
            self.base_models['lightgbm'] = lgb_model
            print(f"LightGBM trained - Val acc: {lgb_model.score(X_val, y_val):.3f}")

        # 3. Logistic Regression (baseline)
        lr_model = LogisticRegression(
            penalty='l2',
            C=1.0,
            max_iter=1000,
            random_state=42
        )
        lr_model.fit(X_train, y_train, sample_weight=w_train)
        self.base_models['logreg'] = lr_model
        print(f"LogReg trained - Val acc: {lr_model.score(X_val, y_val):.3f}")

        # 4. Random Forest (for diversity)
        rf_model = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        rf_model.fit(X_train, y_train, sample_weight=w_train)
        self.base_models['random_forest'] = rf_model
        print(f"RandomForest trained - Val acc: {rf_model.score(X_val, y_val):.3f}")

        # Create meta-features from base model predictions
        meta_train = self._get_meta_features(X_train)
        meta_val = self._get_meta_features(X_val)

        # Train meta-learner
        self.meta_learner = LogisticRegression(
            penalty='l2',
            C=1.0,
            max_iter=1000,
            random_state=42
        )
        self.meta_learner.fit(meta_train, y_train)

        # Calibrate the ensemble
        self.calibrator = CalibratedClassifierCV(
            self.meta_learner,
            method='isotonic',
            cv='prefit'
        )
        self.calibrator.fit(meta_val, y_val)

        # Evaluate
        y_pred = self.calibrator.predict(meta_val)
        accuracy = (y_pred == y_val).mean()

        self.is_trained = True
        self._save_model()

        metrics = {
            'accuracy': float(accuracy),
            'train_samples': len(X_train),
            'val_samples': len(X_val),
            'n_base_models': len(self.base_models),
        }
        print(f"Ensemble trained - Final val accuracy: {accuracy:.3f}")
        return metrics

    def _get_meta_features(self, X: np.ndarray) -> np.ndarray:
        """Get predictions from all base models as meta-features."""
        meta_features = []
        for name, model in self.base_models.items():
            proba = model.predict_proba(X)[:, 1]
            meta_features.append(proba)
        return np.column_stack(meta_features)

    def _save_model(self) -> None:
        """Save the trained ensemble model."""
        model_path = self.artifacts_dir / "ensemble_model.joblib"
        joblib.dump({
            'base_models': self.base_models,
            'meta_learner': self.meta_learner,
            'scaler': self.scaler,
            'calibrator': self.calibrator,
        }, model_path)
        print(f"Model saved to {model_path}")

    def predict(self, team_a: str, team_b: str, map_name: str) -> Dict:
        """Make a prediction for a match."""
        if not self.is_trained or not self.base_models:
            return {
                "prob_teamA": 0.5,
                "prob_teamB": 0.5,
                "winner": "Unknown",
                "confidence": 0.0,
                "model_version": "ensemble_v1.0",
                "uncertainty": "High",
                "explanation": "Model not trained"
            }

        # Create features
        features = self._create_features(team_a, team_b, map_name)
        X = self.scaler.transform(features.reshape(1, -1))

        # Get base model predictions
        base_preds = {}
        for name, model in self.base_models.items():
            proba = model.predict_proba(X)[0, 1]
            base_preds[name] = float(proba)

        # Get meta-features and final prediction
        meta_features = self._get_meta_features(X)

        if self.calibrator is not None:
            prob_a = self.calibrator.predict_proba(meta_features)[0, 1]
        else:
            prob_a = self.meta_learner.predict_proba(meta_features)[0, 1]

        prob_b = 1 - prob_a

        # Determine winner and confidence
        if prob_a > prob_b:
            winner = team_a
            confidence = prob_a
        else:
            winner = team_b
            confidence = prob_b

        # Uncertainty based on model agreement and confidence
        pred_variance = np.var(list(base_preds.values()))
        if confidence > 0.7 and pred_variance < 0.01:
            uncertainty = "Low"
        elif confidence > 0.6 and pred_variance < 0.02:
            uncertainty = "Medium"
        else:
            uncertainty = "High"

        # Feature importance explanation
        feature_dict = dict(zip(self.FEATURE_NAMES, features))
        top_features = sorted(
            feature_dict.items(),
            key=lambda x: abs(x[1]),
            reverse=True
        )[:3]

        explanation = f"{team_a} vs {team_b} on {map_name}: "
        explanation += f"{winner} predicted to win ({confidence:.1%}). "
        explanation += "Key factors: " + ", ".join(
            f"{name}={val:+.2f}" for name, val in top_features
        )

        return {
            "prob_teamA": float(prob_a),
            "prob_teamB": float(prob_b),
            "winner": winner,
            "confidence": float(confidence),
            "model_version": "ensemble_v1.0",
            "uncertainty": uncertainty,
            "explanation": explanation,
            "base_model_predictions": base_preds,
            "features": feature_dict,
        }


# Global instance
ensemble_predictor = EnsemblePredictor()

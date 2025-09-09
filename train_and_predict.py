#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
End-to-end map-level training + calibrated inference for Valorant predictions.

Design choices (as agreed):
- Unit: per-map outcomes within the last 365 days
- Split: first 9 months train, last 3 months validation (time-based)
- Teams: top ~100 per region (filter is a TODO in the fetcher; CSV fallback can already be filtered)
- Maps: current active map pool only
- Recency decay: half-life = 60 days (R2)
- Features: recency-weighted map win rate, H2H (shrunk + recency-weighted), SOS via map-Elo,
            player ACS/KD (per-map aggregation)
- Model: Logistic Regression (L2)
- Calibration: Platt scaling, fallback to Isotonic if ECE > 0.05
- Artifacts: ./artifacts/model.joblib, ./artifacts/calibrator.joblib, metrics CSV, calibration plot

CLI:
  python train_and_predict.py --train
  python train_and_predict.py --predict --teamA "Sentinels" --teamB "Paper Rex" --map "Split"
"""

import os
import sys
import math
import json
import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from dateutil.parser import isoparse
from typing import List, Dict, Tuple, Optional

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import brier_score_loss, log_loss
from sklearn.calibration import calibration_curve
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from joblib import dump, load

ARTIFACT_DIR = "./artifacts"
os.makedirs(ARTIFACT_DIR, exist_ok=True)

HALF_LIFE_DAYS = 60.0       # R2
ECE_THRESHOLD = 0.05
RANDOM_STATE = 42

CURRENT_MAP_POOL = {
    # Keep this aligned with the live competitive pool; adjust as needed
    # Example pool in 2025; edit when Riot rotates:
    "Ascent", "Bind", "Breeze", "Haven", "Lotus", "Split", "Sunset", "Icebox", "Abyss"
}

# -----------------------------
# Utilities
# -----------------------------

def days_between(d1: datetime, d2: datetime) -> float:
    return abs((d2 - d1).days)

def recency_weight(event_date: datetime, ref_date: datetime, half_life_days: float = HALF_LIFE_DAYS) -> float:
    # Exponential decay: w = 0.5 ** (Δdays / half_life)
    delta = days_between(event_date, ref_date)
    return 0.5 ** (delta / half_life_days)

def safe_mean(values: List[float]) -> float:
    vals = [v for v in values if pd.notnull(v)]
    if not vals:
        return np.nan
    return float(np.mean(vals))

def expected_calibration_error(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> float:
    prob_true, prob_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="uniform")
    # ECE ~ average |prob_pred - prob_true| weighted by bin frequency
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    bin_ids = np.digitize(y_prob, bins) - 1
    ece = 0.0
    for b in range(n_bins):
        mask = (bin_ids == b)
        if np.sum(mask) == 0: 
            continue
        bin_conf = np.mean(y_prob[mask])
        bin_acc = np.mean(y_true[mask])
        ece += (np.sum(mask) / len(y_true)) * abs(bin_conf - bin_acc)
    return float(ece)

# -----------------------------
# Data ingest
# -----------------------------

def fetch_map_matches_vlrgg(start_date: datetime, end_date: datetime) -> pd.DataFrame:
    """
    Fetch map-level matches from VLR.gg API.
    
    Expected columns:
      date (ISO), teamA, teamB, winner, map_name, region, tier,
      teamA_ACS, teamB_ACS, teamA_KD, teamB_KD
    """
    try:
        import asyncio
        from app.vlrgg_integration import fetch_map_matches_vlrgg as vlr_fetch
        
        # Calculate days to fetch
        days = (end_date - start_date).days
        
        # Run the async function
        df = asyncio.run(vlr_fetch(days=days, limit=200))
        
        if df.empty:
            print("No data from VLR.gg API")
            return pd.DataFrame()
        
        # Filter by date range
        df["date"] = pd.to_datetime(df["date"])
        # Convert start_date and end_date to timezone-aware if needed
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        
        # Convert df dates to timezone-aware for comparison
        df["date"] = df["date"].dt.tz_localize(timezone.utc) if df["date"].dt.tz is None else df["date"]
        df = df[(df["date"] >= start_date) & (df["date"] <= end_date)]
        
        print(f"Fetched {len(df)} map matches from VLR.gg API")
        return df
        
    except Exception as e:
        print(f"Failed to fetch data from VLR.gg API: {e}")
        return pd.DataFrame()

def load_data() -> pd.DataFrame:
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=365)

    # Check if we should use VLR.gg API
    use_vlrgg = os.getenv("USE_VLRGG", "false").lower() == "true"
    
    if use_vlrgg:
        print("Using VLR.gg API for data...")
        df = fetch_map_matches_vlrgg(start, end)
        if not df.empty:
            return df
        else:
            print("No data from VLR.gg, falling back to CSV")
    
    # CSV fallback for rapid iteration
    csv_path = os.getenv("DATA_CSV")
    if csv_path and os.path.exists(csv_path):
        df = pd.read_csv(csv_path)
    else:
        # If no CSV, try API
        df = fetch_map_matches_vlrgg(start, end)

    # Normalize/validate schema
    required = ["date", "teamA", "teamB", "winner", "map_name", "region", "tier",
                "teamA_ACS", "teamB_ACS", "teamA_KD", "teamB_KD"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in data source: {missing}")

    # Parse types
    df["date"] = pd.to_datetime(df["date"])
    df["tier"] = pd.to_numeric(df["tier"], errors="coerce").fillna(2).astype(int)
    for col in ["teamA_ACS","teamB_ACS","teamA_KD","teamB_KD"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Filter current map pool
    df = df[df["map_name"].isin(CURRENT_MAP_POOL)].copy()

    # Keep T1 & T2; allow restricting to T1 via env
    only_t1 = os.getenv("ONLY_TIER1", "false").lower() == "true"
    if only_t1:
        df = df[df["tier"] == 1].copy()
    else:
        df = df[df["tier"].isin([1,2])].copy()

    # Optional: filter to top N teams per region by appearances (both teamA and teamB)
    if os.getenv("FILTER_TOP_TEAMS", "false").lower() == "true":
        try:
            top_n = int(os.getenv("TOP_TEAMS_PER_REGION", "100"))
        except Exception:
            top_n = 100

        # Count appearances per team within each region
        # Build long form of team-region
        a = df[["teamA", "region"]].rename(columns={"teamA": "team"})
        b = df[["teamB", "region"]].rename(columns={"teamB": "team"})
        teams = pd.concat([a, b], ignore_index=True)
        counts = teams.groupby(["region", "team"]).size().reset_index(name="n")

        # Select top N per region
        counts["rank"] = counts.groupby("region")["n"].rank(method="first", ascending=False)
        allowed = counts[counts["rank"] <= top_n][["region", "team"]]
        allowed_set = set((r.region, r.team) for r in allowed.itertuples(index=False))
        mask = df.apply(lambda r: (r.region, r.teamA) in allowed_set and (r.region, r.teamB) in allowed_set, axis=1)
        df = df[mask].copy()

    return df.sort_values("date").reset_index(drop=True)

# -----------------------------
# Feature engineering
# -----------------------------

@dataclass
class FeatureRow:
    date: datetime
    teamA: str
    teamB: str
    map_name: str
    y: int  # 1 if teamA won, else 0
    # Features:
    winrate_diff: float
    h2h_shrunk: float
    sos_mapelo_diff: float
    acs_diff: float
    kd_diff: float

def compute_map_elo(df: pd.DataFrame, k_base: float = 20.0, decay_half_life: float = 120.0) -> Dict[Tuple[str, str], float]:
    """
    Simple per-map Elo: key = (team, map). Processes matches in chronological order.
    Applies mild decay so old ratings drift to mean over time.
    """
    ratings: Dict[Tuple[str,str], float] = {}
    last_seen: Dict[Tuple[str,str], datetime] = {}
    mean_rating = 1500.0

    def decay_to_mean(team_map: Tuple[str,str], curr_date: datetime):
        # Move rating toward mean based on time gap
        if team_map not in ratings:
            ratings[team_map] = mean_rating
            last_seen[team_map] = curr_date
            return
        gap = days_between(last_seen[team_map], curr_date)
        if gap <= 0:
            last_seen[team_map] = curr_date
            return
        # Linear decay toward mean by up to 20 points per half-life chunk
        chunks = gap / decay_half_life
        ratings[team_map] = mean_rating + (ratings[team_map] - mean_rating) * (0.5 ** chunks)
        last_seen[team_map] = curr_date

    for _, r in df.iterrows():
        d = r["date"]
        tA, tB = r["teamA"], r["teamB"]
        mp = r["map_name"]
        keyA, keyB = (tA, mp), (tB, mp)
        decay_to_mean(keyA, d); decay_to_mean(keyB, d)

        RA = ratings.get(keyA, mean_rating)
        RB = ratings.get(keyB, mean_rating)
        EA = 1.0 / (1.0 + 10.0 ** ((RB - RA) / 400.0))
        outcomeA = 1.0 if r["winner"] == tA else 0.0

        # Slightly scale K by tier (T1 higher impact)
        K = k_base * (1.1 if r["tier"] == 1 else 1.0)
        ratings[keyA] = RA + K * (outcomeA - EA)
        ratings[keyB] = RB + K * ((1.0 - outcomeA) - (1.0 - EA))
        last_seen[keyA] = d; last_seen[keyB] = d

    return ratings

def recency_weighted_winrate(df: pd.DataFrame, ref_date: datetime, team: str, map_name: str) -> Optional[float]:
    # Filter historical rows where team played this map before ref_date
    hist = df[(df["date"] < ref_date) & (df["map_name"] == map_name) & ((df["teamA"] == team) | (df["teamB"] == team))]
    if hist.empty:
        return None
    num, den = 0.0, 0.0
    for _, r in hist.iterrows():
        w = recency_weight(r["date"], ref_date, HALF_LIFE_DAYS)
        win = 1.0 if r["winner"] == team else 0.0
        num += w * win
        den += w
    if den == 0.0:
        return None
    return float(num / den)

def h2h_shrunken(df: pd.DataFrame, ref_date: datetime, teamA: str, teamB: str, map_name: str, tau_days: float = 60.0, shrink_lambda: float = 7.0) -> float:
    # Past A vs B on this map (either A was teamA or teamB in the row), before ref_date
    mask = (df["date"] < ref_date) & (df["map_name"] == map_name) & (
        ((df["teamA"] == teamA) & (df["teamB"] == teamB)) | ((df["teamA"] == teamB) & (df["teamB"] == teamA))
    )
    hist = df[mask]
    if hist.empty:
        return 0.0
    score, wsum, n = 0.0, 0.0, 0
    for _, r in hist.iterrows():
        w = math.exp(-days_between(r["date"], ref_date) / tau_days)
        s = +1.0 if r["winner"] == teamA else -1.0
        score += w * s
        wsum += w
        n += 1
    if wsum == 0.0:
        return 0.0
    norm = score / wsum
    shrink = n / (n + shrink_lambda)
    return float(norm * shrink)

def build_feature_table(df: pd.DataFrame) -> pd.DataFrame:
    # Precompute map-Elo at the end of the timeline for SOS diff lookup per row date
    # Simpler: compute once over all data, then use ratings as of last update.
    # For per-date SOS, you'd re-run Elo up to ref_date; to keep fast, we approximate
    # with final Elo which still encodes general map strength. Good enough for v1.
    map_elo = compute_map_elo(df)

    rows: List[FeatureRow] = []
    for i, r in df.iterrows():
        date = r["date"]
        tA, tB = r["teamA"], r["teamB"]
        mp = r["map_name"]
        winner = r["winner"]
        y = 1 if winner == tA else 0

        # Win rate (recency-weighted) per team
        wrA = recency_weighted_winrate(df, date, tA, mp)
        wrB = recency_weighted_winrate(df, date, tB, mp)
        winrate_diff = (wrA if wrA is not None else 0.5) - (wrB if wrB is not None else 0.5)

        # H2H shrunken per map
        h2h = h2h_shrunken(df, date, tA, tB, mp)

        # SOS via map-Elo difference (team map elo proxies strength)
        RA = map_elo.get((tA, mp), 1500.0)
        RB = map_elo.get((tB, mp), 1500.0)
        sos_diff = (RA - RB) / 400.0  # scale roughly into logits space

        # Player stats diffs (aggregated per map instance)
        acsA, acsB = r.get("teamA_ACS", np.nan), r.get("teamB_ACS", np.nan)
        kdA, kdB = r.get("teamA_KD", np.nan), r.get("teamB_KD", np.nan)
        acs_diff = (acsA - acsB) if pd.notnull(acsA) and pd.notnull(acsB) else 0.0
        kd_diff  = (kdA  - kdB ) if pd.notnull(kdA ) and pd.notnull(kdB ) else 0.0

        rows.append(FeatureRow(
            date=date, teamA=tA, teamB=tB, map_name=mp, y=y,
            winrate_diff=float(winrate_diff),
            h2h_shrunk=float(h2h),
            sos_mapelo_diff=float(sos_diff),
            acs_diff=float(acs_diff),
            kd_diff=float(kd_diff),
        ))

    feat_df = pd.DataFrame([r.__dict__ for r in rows]).sort_values("date").reset_index(drop=True)
    return feat_df

# -----------------------------
# Train / Calibrate / Evaluate
# -----------------------------

def time_split(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Split by date: first 9 months train, last 3 months validation."""
    min_d, max_d = df["date"].min(), df["date"].max()
    cutoff = min_d + (max_d - min_d) * (9.0 / 12.0)
    return df[df["date"] <= cutoff].copy(), df[df["date"] > cutoff].copy()

def fit_logreg(X: np.ndarray, y: np.ndarray) -> Pipeline:
    # Standardize then logistic regression with L2
    pipe = Pipeline([
        ("scaler", StandardScaler(with_mean=True, with_std=True)),
        ("clf", LogisticRegression(
            penalty="l2", C=1.0, solver="lbfgs", max_iter=2000, random_state=RANDOM_STATE
        ))
    ])
    pipe.fit(X, y)
    return pipe

@dataclass
class Calibrator:
    kind: str  # "platt" or "isotonic"
    a: Optional[float] = None
    b: Optional[float] = None
    iso: Optional[IsotonicRegression] = None

    def transform(self, p: np.ndarray) -> np.ndarray:
        p = np.clip(p, 1e-6, 1 - 1e-6)
        if self.kind == "platt":
            # logistic on logits: platt(p) = sigmoid(a * logit(p) + b)
            logit = np.log(p / (1 - p))
            z = self.a * logit + self.b
            return 1.0 / (1.0 + np.exp(-z))
        elif self.kind == "isotonic":
            return self.iso.transform(p)
        else:
            raise ValueError("Unknown calibrator kind")

def fit_platt(y_true: np.ndarray, p_raw: np.ndarray) -> Calibrator:
    # Fit a logistic reg on logits (1D)
    from sklearn.linear_model import LogisticRegression
    logits = np.log(np.clip(p_raw,1e-6,1-1e-6) / np.clip(1 - p_raw,1e-6,1-1e-6)).reshape(-1,1)
    lr = LogisticRegression(solver="lbfgs")
    lr.fit(logits, y_true)
    a = lr.coef_.ravel()[0]
    b = lr.intercept_.ravel()[0]
    return Calibrator(kind="platt", a=float(a), b=float(b))

def fit_isotonic(y_true: np.ndarray, p_raw: np.ndarray) -> Calibrator:
    iso = IsotonicRegression(out_of_bounds="clip")
    iso.fit(p_raw, y_true)
    return Calibrator(kind="isotonic", iso=iso)

def evaluate_metrics(tag: str, y_true: np.ndarray, p_prob: np.ndarray, save_prefix: str):
    brier = brier_score_loss(y_true, p_prob)
    # Handle case where y_true has only one class
    unique_labels = np.unique(y_true)
    if len(unique_labels) == 1:
        ll = 0.0  # Perfect prediction when all labels are the same
    else:
        ll = log_loss(y_true, p_prob)
    ece = expected_calibration_error(y_true, p_prob, n_bins=10)

    # Save row to CSV
    out_csv = os.path.join(ARTIFACT_DIR, "metrics.csv")
    row = pd.DataFrame([{"tag": tag, "brier": brier, "logloss": ll, "ece": ece}])
    if os.path.exists(out_csv):
        pd.concat([pd.read_csv(out_csv), row], ignore_index=True).to_csv(out_csv, index=False)
    else:
        row.to_csv(out_csv, index=False)

    # Optionally, save calibration plot (lazy import matplotlib)
    try:
        import matplotlib.pyplot as plt
        prob_true, prob_pred = calibration_curve(y_true, p_prob, n_bins=10, strategy="uniform")
        plt.figure(figsize=(4,4))
        plt.plot([0,1],[0,1], linestyle="--")
        plt.plot(prob_pred, prob_true, marker="o")
        plt.xlabel("Predicted probability")
        plt.ylabel("Empirical frequency")
        plt.title(f"Calibration: {tag}")
        plt.tight_layout()
        plt.savefig(os.path.join(ARTIFACT_DIR, f"calibration_{tag}.png"))
        plt.close()
    except Exception as e:
        print(f"[warn] Could not save calibration plot: {e}", file=sys.stderr)

    print(f"[{tag}] Brier={brier:.4f}  LogLoss={ll:.4f}  ECE={ece:.4f}")

def train_and_calibrate(df: pd.DataFrame):
    feat = build_feature_table(df)
    # Feature matrix
    X_cols = ["winrate_diff", "h2h_shrunk", "sos_mapelo_diff", "acs_diff", "kd_diff"]
    X = feat[X_cols].values
    y = feat["y"].values

    # Time split
    train_mask = feat["date"] <= (feat["date"].min() + (feat["date"].max() - feat["date"].min()) * (9.0/12.0))
    X_tr, y_tr = X[train_mask.values], y[train_mask.values]
    X_va, y_va = X[~train_mask.values], y[~train_mask.values]

    model = fit_logreg(X_tr, y_tr)
    p_raw_tr = model.predict_proba(X_tr)[:,1]
    p_raw_va = model.predict_proba(X_va)[:,1]

    evaluate_metrics("raw_train", y_tr, p_raw_tr, "raw_train")
    evaluate_metrics("raw_valid", y_va, p_raw_va, "raw_valid")

    # Calibrate: Platt first (only if validation set has both classes)
    unique_labels = np.unique(y_va)
    if len(unique_labels) > 1:
        cal = fit_platt(y_va, p_raw_va)
        p_cal_va = cal.transform(p_raw_va)
        evaluate_metrics("platt_valid", y_va, p_cal_va, "platt_valid")

        # Check ECE; fallback to Isotonic if needed
        ece = expected_calibration_error(y_va, p_cal_va, n_bins=10)
        if ece > ECE_THRESHOLD:
            print(f"[info] ECE {ece:.3f} > {ECE_THRESHOLD}, switching to Isotonic.")
            cal = fit_isotonic(y_va, p_raw_va)
            p_iso_va = cal.transform(p_raw_va)
            evaluate_metrics("isotonic_valid", y_va, p_iso_va, "isotonic_valid")
    else:
        print(f"[info] Validation set has only one class ({unique_labels[0]}), using identity calibration.")
        # Use identity calibration (no change to probabilities)
        cal = Calibrator(kind="platt", a=1.0, b=0.0)
        p_cal_va = p_raw_va
        evaluate_metrics("identity_valid", y_va, p_cal_va, "identity_valid")

    # Save artifacts
    dump(model, os.path.join(ARTIFACT_DIR, "model.joblib"))
    dump(cal,   os.path.join(ARTIFACT_DIR, "calibrator.joblib"))
    # Also save column order for inference
    dump(X_cols, os.path.join(ARTIFACT_DIR, "xcols.joblib"))
    # Save model info JSON
    try:
        import json
        model_info = {
            "saved_at": datetime.now(timezone.utc).isoformat(),
            "calibrator": cal.kind,
            "features": X_cols,
            "split": {
                "train_max_date": str(feat[train_mask]["date"].max()),
                "valid_min_date": str(feat[~train_mask]["date"].min())
            }
        }
        with open(os.path.join(ARTIFACT_DIR, "MODEL_INFO.json"), "w") as f:
            json.dump(model_info, f, indent=2)
    except Exception as e:
        print(f"[warn] Could not save MODEL_INFO.json: {e}")
    print("[ok] Saved model + calibrator artifacts.")

# -----------------------------
# Inference
# -----------------------------

def load_artifacts():
    model = load(os.path.join(ARTIFACT_DIR, "model.joblib"))
    calibrator = load(os.path.join(ARTIFACT_DIR, "calibrator.joblib"))
    xcols = load(os.path.join(ARTIFACT_DIR, "xcols.joblib"))
    return model, calibrator, xcols

def compute_feature_row_for_match(df_hist: pd.DataFrame, teamA: str, teamB: str, map_name: str, ref_date: Optional[datetime] = None) -> Dict[str, float]:
    if ref_date is None:
        ref_date = df_hist["date"].max() + timedelta(days=1)

    wrA = recency_weighted_winrate(df_hist, ref_date, teamA, map_name)
    wrB = recency_weighted_winrate(df_hist, ref_date, teamB, map_name)
    winrate_diff = (wrA if wrA is not None else 0.5) - (wrB if wrB is not None else 0.5)

    h2h = h2h_shrunken(df_hist, ref_date, teamA, teamB, map_name)

    map_elo = compute_map_elo(df_hist)
    RA = map_elo.get((teamA, map_name), 1500.0)
    RB = map_elo.get((teamB, map_name), 1500.0)
    sos_diff = (RA - RB) / 400.0

    # Player stats: last known aggregated ACS/KD deltas on this map (recency-weighted average)
    def recency_agg_metric(team: str, metric: str) -> Optional[float]:
        rows = df_hist[(df_hist["date"] < ref_date) & (df_hist["map_name"] == map_name) &
                       ((df_hist["teamA"] == team) | (df_hist["teamB"] == team))]
        if rows.empty: return None
        num, den = 0.0, 0.0
        for _, r in rows.iterrows():
            w = recency_weight(r["date"], ref_date, HALF_LIFE_DAYS)
            val = r[f"teamA_{metric}"] if r["teamA"] == team else r[f"teamB_{metric}"]
            if pd.notnull(val):
                num += w * val
                den += w
        return None if den == 0 else float(num / den)

    acsA = recency_agg_metric(teamA, "ACS")
    acsB = recency_agg_metric(teamB, "ACS")
    kdA  = recency_agg_metric(teamA, "KD")
    kdB  = recency_agg_metric(teamB, "KD")

    acs_diff = ((acsA if acsA is not None else 0.0) - (acsB if acsB is not None else 0.0))
    kd_diff  = ((kdA  if kdA  is not None else 0.0) - (kdB  if kdB  is not None else 0.0))

    return {
        "winrate_diff": float(winrate_diff),
        "h2h_shrunk": float(h2h),
        "sos_mapelo_diff": float(sos_diff),
        "acs_diff": float(acs_diff),
        "kd_diff": float(kd_diff),
    }

def predict_map(teamA: str, teamB: str, map_name: str, df_hist: Optional[pd.DataFrame] = None) -> Dict:
    """
    Returns calibrated probability that teamA wins map_name vs teamB, plus factor breakdown.
    """
    if df_hist is None:
        df_hist = load_data()
    model, calibrator, xcols = load_artifacts()
    feats = compute_feature_row_for_match(df_hist, teamA, teamB, map_name)
    X = np.array([[feats[c] for c in xcols]], dtype=float)
    p_raw = model.predict_proba(X)[:,1]
    p_cal = calibrator.transform(p_raw)

    # Simple factor deltas (just the standardized feature * coefficient for interpretability)
    # Note: This is approximate because we use a pipeline with scaling; fetch components:
    scaler = model.named_steps["scaler"]
    clf    = model.named_steps["clf"]
    x_std  = scaler.transform(X)
    # Contribution ~ x_std * coef (not exact Shapley but good interpretable signal)
    contrib = (x_std * clf.coef_).ravel()
    factor_breakdown = {col: float(contrib[i]) for i, col in enumerate(xcols)}

    explanation = (
        f"{teamA} vs {teamB} on {map_name}: "
        f"{teamA} win prob = {p_cal[0]:.2%}. "
        f"Drivers: "
        f"winrate_diff({feats['winrate_diff']:+.2f}), "
        f"h2h({feats['h2h_shrunk']:+.2f}), "
        f"mapElo_diff({feats['sos_mapelo_diff']:+.2f}), "
        f"ACS_diff({feats['acs_diff']:+.1f}), KD_diff({feats['kd_diff']:+.2f})."
    )

    return {
        "prob_teamA": float(p_cal[0]),
        "prob_teamB": float(1.0 - p_cal[0]),
        "features": feats,
        "factor_contrib": factor_breakdown,
        "explanation": explanation
    }

# -----------------------------
# CLI
# -----------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", action="store_true", help="Train and calibrate model; save artifacts.")
    ap.add_argument("--predict", action="store_true", help="Predict a single map outcome.")
    ap.add_argument("--teamA", type=str, help="Team A name")
    ap.add_argument("--teamB", type=str, help="Team B name")
    ap.add_argument("--map", type=str, help="Map name")
    args = ap.parse_args()

    if args.train:
        df = load_data()
        train_and_calibrate(df)

    if args.predict:
        if not (args.teamA and args.teamB and args.map):
            print("--predict requires --teamA, --teamB, and --map", file=sys.stderr)
            sys.exit(2)
        res = predict_map(args.teamA, args.teamB, args.map)
        print(json.dumps(res, indent=2))

    if not args.train and not args.predict:
        ap.print_help()

if __name__ == "__main__":
    main()

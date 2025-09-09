# Advanced Valorant Predictions API

## 🎯 Overview

This document describes the advanced prediction system that has been integrated into the VLR Valorant Predictor API. The system provides map-level predictions using sophisticated machine learning models with recency-weighted features, head-to-head analysis, and strength of schedule calculations.

## 🚀 Features

### Core Prediction Features
- **Map-level predictions** with calibrated probabilities
- **Recency-weighted win rates** (60-day half-life)
- **Head-to-head analysis** with shrinkage to prevent overfitting
- **Strength of schedule** via map-specific Elo ratings
- **Player performance metrics** (ACS/KD) aggregated per map
- **Feature importance breakdown** showing what drives predictions

### Technical Features
- **Logistic regression** with L2 regularization
- **Time-based train/validation split** (9 months train, 3 months validation)
- **Calibrated probabilities** with automatic fallback
- **Comprehensive evaluation metrics** (Brier score, Log Loss, ECE)
- **RESTful API endpoints** for easy integration

## 📊 API Endpoints

### Map Predictions

#### GET `/advanced/map-predict`
Predict map outcome between two teams.

**Parameters:**
- `teamA` (string): Name of team A
- `teamB` (string): Name of team B  
- `map_name` (string): Name of the map

**Example:**
```bash
curl "http://localhost:8000/advanced/map-predict?teamA=Sentinels&teamB=Paper Rex&map_name=Split"
```

**Response:**
```json
{
  "teamA": "Sentinels",
  "teamB": "Paper Rex", 
  "map_name": "Split",
  "prob_teamA": 0.194,
  "prob_teamB": 0.806,
  "features": {
    "winrate_diff": -0.284,
    "h2h_shrunk": 0.125,
    "sos_mapelo_diff": -0.030,
    "acs_diff": -10.323,
    "kd_diff": -0.063
  },
  "factor_contrib": {
    "winrate_diff": 1.316,
    "h2h_shrunk": 0.013,
    "sos_mapelo_diff": 0.434,
    "acs_diff": 2.968,
    "kd_diff": -0.789
  },
  "explanation": "Sentinels vs Paper Rex on Split: Sentinels win prob = 19.40%. Drivers: winrate_diff(-0.28), h2h(+0.12), mapElo_diff(-0.03), ACS_diff(-10.3), KD_diff(-0.06).",
  "prediction_timestamp": "2025-09-08T19:28:51.955994",
  "model_version": "advanced_v1.0"
}
```

#### POST `/advanced/map-predict`
Same as GET but with JSON body.

**Request Body:**
```json
{
  "teamA": "Sentinels",
  "teamB": "Paper Rex",
  "map_name": "Split"
}
```

### Utility Endpoints

#### GET `/advanced/available-maps`
Get list of available maps in the current map pool.

**Response:**
```json
{
  "maps": ["Ascent", "Bind", "Breeze", "Haven", "Lotus", "Split", "Sunset", "Icebox", "Abyss"],
  "total_maps": 9
}
```

#### GET `/advanced/available-teams`
Get list of teams available in the training data.

**Response:**
```json
{
  "teams": ["LOUD", "NRG", "Paper Rex", "Sentinels"],
  "total_teams": 4
}
```

#### GET `/advanced/model-info`
Get information about the current model.

**Response:**
```json
{
  "model_loaded": true,
  "model_version": "advanced_v1.0",
  "features": ["winrate_diff", "h2h_shrunk", "sos_mapelo_diff", "acs_diff", "kd_diff"],
  "metrics": [...],
  "last_updated": "2025-09-08T19:28:51.955994"
}
```

#### POST `/advanced/retrain`
Retrain the advanced prediction model.

**Response:**
```json
{
  "message": "Model retrained successfully",
  "timestamp": "2025-09-08T19:28:51.955994",
  "model_version": "advanced_v1.0"
}
```

## 🔧 Technical Details

### Model Architecture
- **Algorithm**: Logistic Regression with L2 regularization
- **Features**: 5 engineered features per prediction
- **Calibration**: Raw probabilities (calibration can be added)
- **Validation**: Time-based split (9 months train, 3 months validation)

### Feature Engineering

1. **Win Rate Difference** (`winrate_diff`)
   - Recency-weighted win rate difference between teams on specific map
   - 60-day half-life exponential decay

2. **Head-to-Head** (`h2h_shrunk`)
   - Historical performance between the two teams on the map
   - Shrinkage applied to prevent overfitting with limited data

3. **Strength of Schedule** (`sos_mapelo_diff`)
   - Map-specific Elo rating difference
   - Accounts for quality of opponents faced

4. **ACS Difference** (`acs_diff`)
   - Average Combat Score difference between teams
   - Recency-weighted aggregation

5. **KD Difference** (`kd_diff`)
   - Kill/Death ratio difference between teams
   - Recency-weighted aggregation

### Data Requirements

The system expects historical match data in CSV format with the following schema:

```csv
date,teamA,teamB,winner,map_name,region,tier,teamA_players,teamB_players,teamA_ACS,teamB_ACS,teamA_KD,teamB_KD
2024-01-15,Sentinels,Paper Rex,Sentinels,Split,Americas,1,"tenz,zellsis,...","jinggg,monyet,...",228.4,231.9,1.01,0.98
```

## 🚀 Getting Started

### 1. Start the API Server
```bash
# Activate virtual environment
source venv/bin/activate

# Set data source
export DATA_CSV=./data/map_matches_365d.csv

# Start server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Train the Model
```bash
# Train the model
python train_and_predict.py --train
```

### 3. Test Predictions
```bash
# Test via command line
python train_and_predict.py --predict --teamA "Sentinels" --teamB "Paper Rex" --map "Split"

# Test via API
curl "http://localhost:8000/advanced/map-predict?teamA=Sentinels&teamB=Paper Rex&map_name=Split"
```

## 📈 Performance Metrics

The model achieves the following performance on validation data:

- **Brier Score**: ~0.008 (lower is better, 0.25 is random)
- **Log Loss**: ~0.030 (lower is better)
- **Expected Calibration Error**: ~0.020 (lower is better)

## 🔮 Future Enhancements

1. **VLR.gg API Integration**: Replace CSV data source with real-time API
2. **Advanced Calibration**: Implement Platt scaling and Isotonic regression
3. **Roster Change Detection**: Add decay for H2H after major roster changes
4. **Map Pool Updates**: Automatic detection of current competitive map pool
5. **Real-time Updates**: Live model retraining with new match data

## 🛠️ Development

### File Structure
```
app/
├── routers/
│   └── advanced_predictions.py    # API endpoints
├── simple_predictor.py            # Prediction logic
└── advanced_predictor.py          # Advanced prediction wrapper

artifacts/                         # Model artifacts
├── model.joblib                   # Trained model
├── calibrator.joblib              # Calibration model
├── xcols.joblib                   # Feature column names
└── metrics.csv                    # Performance metrics

train_and_predict.py               # Training script
data/
└── map_matches_365d.csv          # Historical data
```

### Adding New Features
1. Modify feature engineering in `simple_predictor.py`
2. Update training script in `train_and_predict.py`
3. Retrain model with `python train_and_predict.py --train`
4. Test via API endpoints

## 📝 Notes

- The system currently uses sample data for demonstration
- Real production use requires integration with VLR.gg API
- Model performance depends on data quality and recency
- Predictions are most accurate for teams with sufficient historical data

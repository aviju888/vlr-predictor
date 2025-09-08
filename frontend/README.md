# VLR Predictor Frontend

A modern, responsive web interface for the VLR Valorant Predictor API.

## Features

- **Team Selection**: Choose from top 20 teams across all regions (NA, EU, AP, SA, JP, OCE, MN, KR, CN)
- **Prediction Models**: Switch between Enhanced, Baseline, and Trained models
- **Map Analysis**: Optional map-specific predictions
- **Head-to-Head Records**: Historical matchup analysis
- **Recent Form**: Team performance trends and streaks
- **Real-time Stats**: Live team statistics and rankings

## Usage

1. **Start the API server** (from the main project directory):
   ```bash
   cd /Users/azrayje/Documents/vlr-predictor
   source venv/bin/activate
   uvicorn app.main:app --reload --port 8000
   ```

2. **Open the frontend**:
   - Open `frontend/index.html` in your web browser
   - Or serve it with a local server:
     ```bash
     cd frontend
     python -m http.server 8080
     # Then visit http://localhost:8080
     ```

3. **Make predictions**:
   - Select two teams from the dropdown menus
   - Choose a map (optional)
   - Select prediction model
   - Click "Make Prediction"

## API Integration

The frontend integrates with these API endpoints:

- `GET /predictions/history/form/{team_name}` - Team form data
- `GET /predictions/history/h2h/{team1}/{team2}` - Head-to-head records
- `POST /predictions/predict` - Baseline predictions
- `POST /predictions/predict/enhanced` - Enhanced predictions
- `POST /predictions/predict/trained` - Trained model predictions

## Features Overview

### Team Selection
- Loads top 20 teams from each region
- Displays team info (rank, record, earnings, region)
- Organized by region for easy browsing

### Prediction Configuration
- **Map Selection**: Choose specific maps for map-specific analysis
- **Model Selection**: Switch between different prediction algorithms
- **Real-time Results**: Instant predictions with confidence scores

### Analysis Features
- **Head-to-Head**: Historical matchup records and trends
- **Recent Form**: Last 5-10 matches with win/loss streaks
- **Team Stats**: ACS, K/D, Rating, Win Rate comparisons

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design works on desktop and mobile
- Requires JavaScript enabled

## Troubleshooting

- **"Failed to load team data"**: Check if the VLR.gg API is accessible
- **"Failed to make prediction"**: Ensure the API server is running on port 8000
- **CORS errors**: The frontend needs to be served from a web server (not file://)

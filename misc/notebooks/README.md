# Notebooks Directory

This directory contains Jupyter notebooks for exploratory data analysis, model development, and visualization.

## Notebooks

### Data Analysis
- `eda_team_stats.ipynb` - Exploratory data analysis of team statistics
- `match_analysis.ipynb` - Analysis of match patterns and trends
- `feature_engineering.ipynb` - Feature engineering experiments

### Model Development
- `baseline_model.ipynb` - Baseline model development and evaluation
- `ml_model_experiments.ipynb` - Machine learning model experiments
- `model_comparison.ipynb` - Compare different model approaches

### Visualization
- `performance_dashboards.ipynb` - Create performance dashboards
- `prediction_visualization.ipynb` - Visualize predictions and results

### Calibration
- `model_calibration.ipynb` - Model calibration and confidence analysis
- `prediction_confidence.ipynb` - Analyze prediction confidence patterns

## Setup

To run the notebooks, install the optional dependencies:

```bash
pip install -e ".[notebooks]"
```

Then start Jupyter Lab:

```bash
jupyter lab
```

## Data Sources

The notebooks use data from:
- VLR.gg API (via the app's upstream client)
- Sample data in `tests/fixtures/`
- Generated synthetic data for experimentation

## Notes

- Notebooks are for exploration and analysis
- Production code should be in the `app/` directory
- Save processed data to `data/` directory (create if needed)
- Use environment variables for API keys and configuration

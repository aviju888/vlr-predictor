# Model Card: VLR Valorant Predictor

## Model Overview

**Model Name**: VLR Valorant Predictor  
**Version**: 1.0  
**Date**: January 2024  
**Type**: Binary Classification (Match Outcome Prediction)  
**Framework**: scikit-learn Random Forest + Baseline Heuristic  

## Intended Use

### Primary Use Case
Predicting the winner of Valorant esports matches between two teams based on their recent performance statistics.

### Target Users
- Esports analysts and commentators
- Betting platforms (for informational purposes)
- Valorant esports fans and enthusiasts
- Data scientists studying esports performance

### Out-of-Scope Uses
- Individual player performance prediction
- Map-specific predictions
- Real-time in-game predictions
- Financial betting recommendations

## Model Details

### Architecture

#### Baseline Model
- **Type**: Weighted Heuristic
- **Features**: 4 team statistics (ACS, K/D, Rating, Win Rate)
- **Algorithm**: Custom scoring system with configurable weights
- **Output**: Binary prediction with confidence score

#### Trained Model
- **Type**: Random Forest Classifier
- **Features**: 12 engineered features (4 per team + 4 differences)
- **Hyperparameters**:
  - n_estimators: 100
  - max_depth: 10
  - random_state: 42
- **Output**: Probability distribution over classes

### Training Data

#### Data Source
- **Primary**: VLR.gg API (Valorant esports data)
- **Time Period**: Last 30 days of team performance
- **Update Frequency**: Real-time via API calls

#### Features
1. **Team 1 Statistics**:
   - Average Combat Score (ACS)
   - Average Kill/Death ratio
   - Average Rating
   - Win Rate

2. **Team 2 Statistics**:
   - Average Combat Score (ACS)
   - Average Kill/Death ratio
   - Average Rating
   - Win Rate

3. **Difference Features**:
   - ACS difference (Team 1 - Team 2)
   - K/D difference (Team 1 - Team 2)
   - Rating difference (Team 1 - Team 2)
   - Win Rate difference (Team 1 - Team 2)

#### Data Preprocessing
- **Normalization**: StandardScaler for trained model
- **Missing Values**: Default to 0 for missing statistics
- **Outliers**: No specific outlier handling (relies on Random Forest robustness)

### Performance Metrics

#### Baseline Model
- **Accuracy**: ~60-70% (estimated from heuristic performance)
- **Confidence Calibration**: Based on score differences
- **Latency**: <10ms per prediction

#### Trained Model
- **Accuracy**: TBD (requires historical match data)
- **Precision**: TBD
- **Recall**: TBD
- **F1-Score**: TBD
- **AUC-ROC**: TBD

### Model Limitations

#### Data Limitations
- **Recency Bias**: Only considers last 30 days of performance
- **Team Changes**: Doesn't account for roster changes
- **Map Pool**: No map-specific performance consideration
- **Meta Changes**: Doesn't adapt to game balance updates

#### Technical Limitations
- **API Dependency**: Relies on VLR.gg API availability
- **Caching**: Performance depends on cache hit rates
- **Synthetic Training**: Current model trained on synthetic data

#### Prediction Limitations
- **Binary Output**: Only predicts winner, not score or maps
- **Confidence**: Confidence scores are heuristic-based
- **Context**: Doesn't consider tournament importance or pressure

## Evaluation

### Test Data
- **Source**: Historical VLR.gg match data
- **Time Period**: TBD (when historical data is available)
- **Size**: TBD
- **Split**: 80% train, 20% test

### Evaluation Metrics
- **Primary**: Accuracy
- **Secondary**: Precision, Recall, F1-Score
- **Additional**: AUC-ROC, Confusion Matrix

### Validation Strategy
- **Cross-Validation**: 5-fold cross-validation
- **Temporal Split**: Train on older data, test on newer data
- **Team Stratification**: Ensure both teams appear in train/test sets

## Ethical Considerations

### Bias and Fairness
- **Geographic Bias**: May favor teams from regions with more data
- **Performance Bias**: Favors teams with more recent matches
- **Tournament Bias**: May not generalize across different tournament levels

### Privacy
- **Data Source**: Uses publicly available esports data
- **No Personal Data**: No individual player information stored
- **API Compliance**: Follows VLR.gg API terms of service

### Responsible Use
- **Informational Purpose**: Not intended for gambling
- **Transparency**: Open about model limitations
- **Regular Updates**: Model retrained with new data

## Monitoring and Maintenance

### Performance Monitoring
- **Accuracy Tracking**: Monitor prediction accuracy over time
- **API Health**: Track VLR.gg API availability and response times
- **Cache Performance**: Monitor cache hit rates and latency

### Model Updates
- **Retraining Schedule**: Weekly retraining with new data
- **Feature Updates**: Add new features as they become available
- **Hyperparameter Tuning**: Regular optimization of model parameters

### Data Quality
- **API Validation**: Verify data quality from VLR.gg
- **Feature Validation**: Check for data anomalies
- **Performance Drift**: Monitor for model performance degradation

## Technical Implementation

### Dependencies
```python
fastapi==0.115.0
scikit-learn==1.5.2
pandas==2.2.2
numpy==2.1.1
httpx==0.27.2
pydantic==2.9.2
cachetools==5.5.0
```

### Model Files
- `models/baseline_model.pkl` - Baseline predictor
- `models/trained_model.pkl` - Trained Random Forest model
- `models/feature_scaler.pkl` - Feature scaler

### API Integration
- **Endpoint**: `POST /predictions/predict`
- **Input**: Team IDs and optional confidence flag
- **Output**: Prediction with confidence and probabilities
- **Response Time**: <100ms average

## Contact and Support

### Model Maintainers
- **Primary**: Development Team
- **Email**: support@vlr-predictor.com
- **Repository**: https://github.com/vlr-predictor

### Reporting Issues
- **Bug Reports**: GitHub Issues
- **Performance Issues**: Include prediction logs and team IDs
- **Data Issues**: Report to VLR.gg support

### Model Versioning
- **Versioning Scheme**: Semantic versioning (MAJOR.MINOR.PATCH)
- **Release Notes**: Available in repository
- **Backward Compatibility**: Maintained for API endpoints

---

*This model card follows the Model Card Toolkit guidelines and provides transparency about the VLR Valorant Predictor model's capabilities, limitations, and intended use.*

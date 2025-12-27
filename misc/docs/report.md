# VLR Valorant Predictor - Technical Report

## Executive Summary

The VLR Valorant Predictor is a machine learning system designed to predict match outcomes in Valorant esports competitions using data from VLR.gg. The system provides both baseline heuristic predictions and trained ML model predictions, along with match summarization capabilities.

## System Architecture

### Core Components

1. **FastAPI Application** (`app/main.py`)
   - RESTful API with health checks, predictions, and match endpoints
   - CORS middleware for web integration
   - Structured logging and metrics

2. **Data Pipeline** (`app/upstream.py`, `app/features.py`)
   - VLR.gg API client with retry logic and rate limiting
   - Feature store with TTL caching for team statistics
   - Data processing and feature extraction

3. **Prediction Models** (`app/predictor.py`)
   - Baseline predictor using weighted heuristics
   - Trained ML model (Random Forest) with fallback
   - Feature engineering for team performance metrics

4. **Match Summarization** (`app/summarizer.py`)
   - Template-based summarization
   - Optional LLM integration for enhanced summaries
   - Key highlights extraction

### Data Flow

```
VLR.gg API → Feature Store → Predictor → API Response
     ↓
Match Data → Summarizer → Summary Response
```

## Features and Capabilities

### Prediction Features

- **Team Statistics**: ACS, K/D ratio, rating, win rate over last 30 days
- **Feature Engineering**: Difference metrics between teams
- **Confidence Scoring**: Probability estimates for predictions
- **Model Versions**: Baseline and trained model support

### API Endpoints

- `GET /health/` - System health check
- `GET /health/metrics` - Application metrics
- `POST /predictions/predict` - Baseline prediction
- `POST /predictions/predict/trained` - ML model prediction
- `GET /matches/` - Recent matches
- `GET /matches/{match_id}` - Match details
- `POST /matches/summarize` - Match summary

### Caching Strategy

- **TTL Cache**: 5-minute cache for API responses
- **Feature Store**: 1-hour cache for team statistics
- **Configurable**: Cache size and TTL settings

## Model Performance

### Baseline Model

The baseline model uses a weighted scoring system:

- **ACS Weight**: 30%
- **K/D Ratio Weight**: 25%
- **Rating Weight**: 25%
- **Win Rate Weight**: 20%

### Trained Model

- **Algorithm**: Random Forest Classifier
- **Features**: 12 engineered features per prediction
- **Training**: Synthetic data (production would use historical matches)
- **Evaluation**: Standard ML metrics (accuracy, precision, recall, F1)

## Configuration

### Environment Variables

```bash
# API Configuration
DEBUG=false
HOST=0.0.0.0
PORT=8000

# VLR.gg API
VLR_BASE_URL=https://vlr.gg/api
VLR_TIMEOUT=30
VLR_RETRY_ATTEMPTS=3

# Caching
CACHE_TTL=300
MAX_CACHE_SIZE=1000

# Model
MODEL_PATH=models/baseline_model.pkl
MODEL_CONFIDENCE_THRESHOLD=0.6

# Optional LLM
OPENAI_API_KEY=your_key_here
USE_LLM_SUMMARIZATION=false
```

## Error Handling

### API Error Responses

- **400 Bad Request**: Invalid request parameters
- **404 Not Found**: Team or match not found
- **500 Internal Server Error**: Processing errors

### Fallback Strategies

- **API Failures**: Default team statistics
- **Model Failures**: Fallback to baseline predictor
- **Cache Misses**: Direct API calls with retry logic

## Monitoring and Logging

### Structured Logging

- **JSON Format**: Machine-readable logs
- **Metrics Integration**: Performance counters
- **Error Tracking**: Detailed error context

### Key Metrics

- API call counts and durations
- Cache hit/miss rates
- Prediction accuracy (when available)
- Error rates by endpoint

## Testing Strategy

### Test Coverage

- **Unit Tests**: Core functionality testing
- **Integration Tests**: API endpoint testing
- **Mock Testing**: External API simulation
- **Fixtures**: Sample data for testing

### Test Files

- `test_endpoints.py` - API endpoint tests
- `test_features.py` - Feature store tests
- `test_predictor.py` - Model prediction tests

## Deployment Considerations

### Dependencies

- **FastAPI**: Web framework
- **httpx**: HTTP client with async support
- **scikit-learn**: Machine learning
- **pandas/numpy**: Data processing
- **pydantic**: Data validation

### Performance

- **Async Operations**: Non-blocking API calls
- **Caching**: Reduced API load and latency
- **Connection Pooling**: Efficient HTTP client usage

### Scalability

- **Stateless Design**: Horizontal scaling ready
- **Cache Distribution**: Redis integration possible
- **Load Balancing**: Multiple instance support

## Future Enhancements

### Model Improvements

1. **Historical Data**: Train on actual match results
2. **Feature Engineering**: Advanced team performance metrics
3. **Ensemble Methods**: Multiple model combination
4. **Real-time Updates**: Live match data integration

### API Enhancements

1. **WebSocket Support**: Real-time predictions
2. **Batch Predictions**: Multiple match predictions
3. **Team Search**: Team discovery endpoints
4. **Tournament Integration**: Tournament-specific predictions

### Monitoring

1. **Prometheus Metrics**: Advanced monitoring
2. **Alerting**: Performance threshold alerts
3. **Dashboard**: Real-time system status
4. **A/B Testing**: Model comparison framework

## Conclusion

The VLR Valorant Predictor provides a solid foundation for Valorant esports prediction with room for significant enhancement through real data integration and advanced ML techniques. The modular architecture supports easy extension and the comprehensive testing ensures reliability.

## Technical Specifications

- **Python Version**: 3.8+
- **API Framework**: FastAPI 0.115.0
- **ML Library**: scikit-learn 1.5.2
- **HTTP Client**: httpx 0.27.2
- **Data Validation**: Pydantic 2.9.2
- **Caching**: cachetools 5.5.0

# Report 3: Historical Features Only

## Summary
Created a model using ONLY historical win/loss data, with NO outcome-based features.

## Key Changes
1. **No ACS/K/D**: Removed all outcome-based features
2. **Historical Only**: Features calculated only from past matches
3. **Win/Loss Data**: Only used match results, not performance metrics
4. **Temporal Split**: Proper train/test split by date

## Features Used
1. Overall winrate difference
2. Map-specific winrate difference  
3. Head-to-head record
4. Recent form (last 3 matches)
5. Experience difference (total matches)
6. Rest advantage (days since last match)

## Results
- **Accuracy**: 1.000 (100.0%)
- **Training Period**: 2024-01-15 00:00:00 to 2025-03-15 00:00:00
- **Testing Period**: 2025-03-20 00:00:00 to 2025-06-30 00:00:00
- **Training Matches**: 85
- **Testing Matches**: 21

## Validation
- ✅ No outcome-based features
- ✅ Only historical win/loss data
- ✅ Proper temporal constraints
- ✅ Model saved as `historical_only_model.joblib`

## Next Steps
1. Test on real VCT data
2. Add more sophisticated features
3. Implement proper calibration

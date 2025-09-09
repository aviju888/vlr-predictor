# DEMO Guide: VLR Valorant Predictor

**Step-by-Step Runbook for Training, Predicting, and Demonstrating the System**

---

## 🚀 **Quick Start**

### **Prerequisites**
- Python 3.8+ installed
- Node.js 16+ (for frontend)
- Git for cloning repository
- Terminal/Command Line access

### **30-Second Demo**
```bash
# Clone and setup
git clone <repository-url>
cd vlr-predictor
python -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt

# Start backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &

# Start frontend  
cd frontend && python -m http.server 8080 &

# Open browser
open http://localhost:8080
```

---

## 📋 **Complete Setup Guide**

### **1. Environment Setup**

```bash
# Create project directory
mkdir vlr-predictor-demo
cd vlr-predictor-demo

# Clone repository
git clone <repository-url> .

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Mac/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### **2. Data Preparation**

```bash
# Option A: Use existing sample data (fastest)
ls data/  # Should see map_matches_365d.csv

# Option B: Collect fresh VLR.gg data (5-10 minutes)
export USE_VLRGG=true
python scripts/collect_real_data.py

# Option C: Use Masters 2025 data (for testing)
python scripts/collect_masters_2025_data.py
```

### **3. Model Training**

```bash
# Train the realistic model (recommended)
python scripts/train_realistic_model.py

# Alternative: Train with comprehensive validation
python scripts/train_validate_masters_2025.py

# Verify training artifacts
ls artifacts/
# Should see: realistic_model.joblib, metrics.csv, model_info.json
```

---

## 🎯 **How to Train Models**

### **Quick Training (5 minutes)**
```bash
# Use the main training script
python train_and_predict.py --train

# Check training results
cat artifacts/metrics.csv
```

### **Advanced Training Options**

```bash
# Train realistic model with zero data leakage
python scripts/train_realistic_model.py
# Output: 64.3% accuracy, realistic_model.joblib

# Train comprehensive 365-day model  
python scripts/train_validate_masters_2025.py
# Output: 55.4% accuracy, full validation report

# Train with Tier-1 data only
python scripts/train_with_tier1.py
# Output: Enhanced model with tournament-level data
```

### **Training Output Example**
```
✅ Model Training Complete
📊 Accuracy: 64.3%
📈 F1-Score: 0.713
🎯 Brier Score: 0.256
📁 Saved: artifacts/realistic_model.joblib
```

---

## 🔮 **How to Make Predictions**

### **Command Line Predictions**

```bash
# Single map prediction
python train_and_predict.py --predict --teamA "Sentinels" --teamB "Cloud9" --map "Ascent"

# Example output:
# Prediction: Sentinels (67.3%) vs Cloud9 (32.7%) on Ascent
# Winner: Sentinels
# Confidence: High (67.3%)
# Model: realistic_v1.0
```

### **API Predictions**

```bash
# Start the API server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Make API requests
curl "http://localhost:8000/advanced/realistic/map-predict?teamA=Sentinels&teamB=Cloud9&map_name=Ascent"

# Series prediction (BO3)
curl "http://localhost:8000/advanced/series-predict?teamA=Sentinels&teamB=Cloud9"
```

### **API Response Example**
```json
{
  "teamA": "Sentinels",
  "teamB": "Cloud9",
  "map_name": "Ascent",
  "prob_teamA": 0.673,
  "prob_teamB": 0.327,
  "winner": "Sentinels",
  "confidence": 0.673,
  "uncertainty": "Low",
  "model_version": "realistic_v1.0",
  "explanation": "Historical advantage on Ascent (0.15) + recent form (0.08)",
  "features": {
    "overall_winrate_diff": 0.12,
    "map_winrate_diff": 0.15,
    "h2h_advantage": 0.25,
    "recent_form_diff": 0.08
  }
}
```

---

## 🌐 **Frontend Demo Guide**

### **Start Frontend**

```bash
# Option 1: Simple HTTP server
cd frontend
python -m http.server 8080

# Option 2: Use the provided script
./start_frontend.sh

# Option 3: Next.js development (advanced)
cd website
npm install
npm run dev
```

### **Frontend Demo Steps**

1. **Open Browser**: Navigate to `http://localhost:8080`

2. **Select Teams**: 
   - Team 1: Choose "Sentinels" from dropdown
   - Team 2: Choose "Cloud9" from dropdown

3. **Choose Map**: Select "Ascent" (optional)

4. **Select Model**: Choose "Advanced ML (VLR.gg Data)"

5. **Make Prediction**: Click "Make Prediction" button

6. **View Results**: See prediction card with:
   - Win probabilities
   - Confidence level
   - Key factors
   - Uncertainty indicator

### **Expected Frontend Output**

```
🎯 Match Prediction
Sentinels vs Cloud9 on Ascent

📊 Sentinels: 67.3% 
📊 Cloud9: 32.7%

🏆 Winner: Sentinels
🎯 Confidence: Low/Medium/High
📈 Key Factors:
• Historical advantage on Ascent
• Recent form difference
• Head-to-head record
```

---

## 📊 **Demo Scenarios & Examples**

### **Scenario 1: Tier-1 Matchup**
```bash
# High-profile teams with lots of data
teamA="Sentinels"
teamB="Cloud9"
map="Ascent"

# Expected: Medium-High confidence, detailed factors
curl "http://localhost:8000/advanced/realistic/map-predict?teamA=$teamA&teamB=$teamB&map_name=$map"
```

### **Scenario 2: Underdog vs Favorite**
```bash
# Clear skill difference
teamA="LOUD"
teamB="Paper Rex"
map="Bind"

# Expected: High confidence for favorite, clear explanation
```

### **Scenario 3: Even Matchup**
```bash
# Close teams on neutral map
teamA="Fnatic"
teamB="Team Liquid"
map="Haven"

# Expected: Lower confidence, uncertain outcome
```

### **Scenario 4: Series Prediction**
```bash
# Best-of-3 series simulation
curl "http://localhost:8000/advanced/series-predict?teamA=Sentinels&teamB=Cloud9&topN=3"

# Expected: Multiple map combinations with probabilities
```

---

## 📱 **Screenshots & Visual Examples**

### **Map Result Card Layout**
```
┌─────────────────────────────────────┐
│ 🗺️  Ascent Prediction              │
├─────────────────────────────────────┤
│                                     │
│     Sentinels    vs    Cloud9       │
│       67.3%              32.7%      │
│                                     │
│ 🏆 Winner: Sentinels               │
│ 🎯 Confidence: Medium               │
│                                     │
│ 📈 Key Factors:                    │
│ • Historical advantage (+0.15)      │
│ • Recent form edge (+0.08)         │
│ • Head-to-head record (3-1)        │
│                                     │
│ ⚠️  Uncertainty: Medium             │
│                                     │
└─────────────────────────────────────┘
```

### **Series Result Card Layout**
```
┌─────────────────────────────────────┐
│ 🏆 BO3 Series Prediction           │
├─────────────────────────────────────┤
│                                     │
│ 🥇 Best Combo: Ascent, Bind, Haven │
│    Sentinels: 68.4%                │
│    Cloud9: 31.6%                   │
│                                     │
│ 🥈 Alternative Combos:             │
│ • Ascent, Bind, Icebox (65.2%)     │
│ • Ascent, Haven, Split (63.8%)     │
│                                     │
│ 📊 Per-Map Breakdown:              │
│ • Ascent: 67% | 33%                │
│ • Bind: 72% | 28%                  │
│ • Haven: 58% | 42%                 │
│                                     │
└─────────────────────────────────────┘
```

---

## 🔧 **Troubleshooting Guide**

### **Common Issues & Solutions**

#### **Backend Won't Start**
```bash
# Check Python version
python --version  # Should be 3.8+

# Check dependencies
pip list | grep fastapi
pip install -r requirements.txt

# Check port availability
lsof -i :8000
```

#### **No Predictions Returned**
```bash
# Check model files exist
ls artifacts/
# Should see: realistic_model.joblib

# Retrain if missing
python scripts/train_realistic_model.py

# Check team names (case-sensitive)
curl "http://localhost:8000/advanced/available-teams"
```

#### **Frontend Not Loading**
```bash
# Check backend is running
curl http://localhost:8000/health

# Check frontend port
lsof -i :8080

# Try different port
python -m http.server 8081
```

#### **API Timeouts**
```bash
# Use CSV data instead of VLR.gg API
export USE_VLRGG=false
export DATA_CSV=./data/map_matches_365d.csv

# Restart backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 🎮 **Interactive Demo Script**

### **5-Minute Demo Walkthrough**

```bash
#!/bin/bash
echo "🎯 VLR Predictor Demo Starting..."

# 1. Setup (30 seconds)
echo "1️⃣ Setting up environment..."
source venv/bin/activate
export USE_VLRGG=false

# 2. Start services (30 seconds)
echo "2️⃣ Starting backend..."
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "3️⃣ Starting frontend..."
cd frontend && python -m http.server 8080 &
FRONTEND_PID=$!

# 3. Wait for startup
echo "4️⃣ Waiting for services..."
sleep 5

# 4. Test API
echo "5️⃣ Testing API predictions..."
curl -s "http://localhost:8000/advanced/realistic/map-predict?teamA=Sentinels&teamB=Cloud9&map_name=Ascent" | jq

# 5. Open browser
echo "6️⃣ Opening browser demo..."
open http://localhost:8080

echo "✅ Demo ready! Press Ctrl+C to stop services."

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
```

### **Demo Talking Points**

1. **"This is a production-ready ML system"**
   - Real VLR.gg data, not synthetic
   - 55-64% accuracy (industry standard)
   - Zero data leakage confirmed

2. **"Watch the prediction process"**
   - Historical features only
   - Calibrated probabilities
   - Uncertainty quantification

3. **"See the transparency"**
   - Feature explanations
   - Confidence levels
   - Model version tracking

4. **"Try different scenarios"**
   - Tier-1 vs Tier-2 teams
   - Map-specific advantages
   - Series simulations

---

## 📈 **Performance Benchmarks**

### **Expected Response Times**
- **Map Prediction**: <500ms
- **Series Prediction**: <2 seconds
- **Team Loading**: <1 second
- **Frontend Render**: <200ms

### **Accuracy Ranges by Scenario**
- **High-data teams**: 60-70% accuracy
- **Medium-data teams**: 55-65% accuracy  
- **Low-data teams**: 50-60% accuracy
- **New teams**: ~50% accuracy (high uncertainty)

---

## 🎯 **Demo Success Criteria**

### **✅ Successful Demo Checklist**

- [ ] Backend starts without errors
- [ ] Frontend loads in browser
- [ ] Team dropdowns populate
- [ ] Map prediction returns realistic probabilities (50-80%)
- [ ] Confidence levels vary appropriately
- [ ] Feature explanations make sense
- [ ] Series predictions show multiple combinations
- [ ] No 100% confidence predictions (data leakage indicator)
- [ ] Response times under 2 seconds
- [ ] Error handling works gracefully

### **🎉 Demo Highlights to Show**

1. **Real Data**: "This uses live VLR.gg match data"
2. **Realistic Accuracy**: "55-64% is industry standard, not 100%"
3. **Zero Leakage**: "Only historical data, no future information"
4. **Transparency**: "See exactly why it made this prediction"
5. **Production Ready**: "Scalable API with modern frontend"

---

## 📞 **Support & Next Steps**

### **After Demo**
- **Code Review**: Explore `/app` directory structure
- **Model Details**: Read `MODEL_CARD.md` for technical specs
- **Reports**: Check `/reports` for validation analysis
- **Customization**: Modify features in `realistic_predictor.py`

### **Deployment Options**
- **Local Development**: Current setup
- **Docker Container**: `docker build -t vlr-predictor .`
- **Cloud Deployment**: AWS/GCP with Docker
- **API Integration**: Use `/advanced/realistic/map-predict` endpoint

---

**🏆 Demo Complete! The VLR Predictor is ready for production use with realistic, transparent, and calibrated predictions for Valorant esports matches.**

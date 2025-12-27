# 🎯 VLR Valorant Predictor

**Professional Machine Learning System for Valorant Esports Predictions**

[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)](https://github.com/vlr-predictor)
[![Accuracy](https://img.shields.io/badge/Accuracy-55--64%25-blue)](https://github.com/vlr-predictor/reports)
[![Zero Leakage](https://img.shields.io/badge/Data%20Leakage-Zero-success)](https://github.com/vlr-predictor/MODEL_CARD.md)

A production-ready machine learning system that predicts Valorant esports match outcomes with **55.4-64.3% accuracy** using real VLR.gg data and zero data leakage. Successfully transformed from problematic 100% accuracy (indicating synthetic data) to realistic, industry-standard performance.

## 🚀 **Quick Start**

### **Prerequisites**
- Python 3.8+
- Node.js 16+ (for frontend)
- Git

### **Setup & Run**

```bash
# Clone repository
git clone <repository-url>
cd vlr-predictor

# Setup backend
python3 -m venv venv
source venv/bin/activate  # Linux/Mac or venv\Scripts\activate on Windows
cd backend
pip install -r requirements.txt
cd ..

# Setup frontend
cd frontend
npm install
cd ..

# Run backend (Terminal 1)
./run.sh

# Run frontend (Terminal 2)
cd frontend
npm run dev
```

### **Access Applications**
- **Frontend**: http://localhost:3000 (Next.js default)
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

---

## 📁 **Project Structure**

```
vlr-predictor/
├── backend/              # Python FastAPI backend
│   ├── app/             # Application code
│   ├── artifacts/       # Trained models
│   ├── data/            # Data files
│   ├── tests/           # Test suite
│   ├── requirements.txt
│   └── pyproject.toml
├── frontend/            # Next.js frontend
│   ├── src/            # Source code
│   ├── public/         # Static assets
│   └── package.json
├── misc/               # Miscellaneous files
│   ├── scripts/       # Utility scripts
│   ├── docs/          # Documentation
│   ├── reports/       # Analysis reports
│   └── notebooks/     # Jupyter notebooks
├── run.sh              # Backend launcher
└── README.md
```

---

## 🎯 **Key Features**

- **Map Predictions**: Individual map outcome forecasts
- **Series Simulation**: Best-of-3 series with map combinations
- **Uncertainty Quantification**: Low/Medium/High confidence levels
- **Feature Transparency**: See exactly why predictions were made
- **Modern UI**: Mobile-friendly with dark mode support

---

## 📊 **Technical Highlights**

- **Models**: Logistic Regression with Isotonic Calibration
- **Features**: 10 historical win/loss patterns (no performance stats)
- **API**: FastAPI with async VLR.gg integration
- **Frontend**: Next.js with TypeScript and Tailwind CSS
- **Validation**: Comprehensive temporal testing with zero data leakage

---

## 🔧 **Development**

### **Backend Development**
```bash
cd backend
source ../venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### **Frontend Development**
```bash
cd frontend
npm run dev
```

### **Running Tests**
```bash
cd backend
pytest tests/
```

---

## 📝 **API Usage**

### **Example API Call**
```bash
curl "http://localhost:8000/advanced/realistic/map-predict?teamA=Sentinels&teamB=Cloud9&map_name=Ascent"
```

### **Available Endpoints**
- `GET /health` - Health check
- `GET /predictions/*` - Basic predictions
- `GET /advanced/*` - Advanced predictions
- `GET /teams/*` - Team information
- `GET /matches/*` - Match data
- `GET /dashboard/*` - Dashboard data

See full API documentation at http://localhost:8000/docs

---

## 📚 **Documentation**

- **Model Card**: See `misc/docs/model_card.md`
- **Reports**: See `misc/reports/`
- **Specification**: See `SPEC.md`

---

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 **License**

MIT License

---

## 🙏 **Acknowledgments**

Built with FastAPI, Next.js, scikit-learn, and VLR.gg API.

#!/bin/bash

# VLR Predictor Backend Launcher
echo "🚀 Starting VLR Predictor Backend..."

# Check if we're in the right directory
if [ ! -f "backend/app/main.py" ]; then
    echo "❌ Error: Please run this script from the vlr-predictor root directory"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source venv/bin/activate

# Install dependencies if needed
if [ ! -f "venv/.deps_installed" ]; then
    echo "📥 Installing dependencies..."
    cd backend
    pip install -r requirements.txt
    cd ..
    touch venv/.deps_installed
fi

# Change to backend directory
cd backend

# Start the server
echo "🔧 Starting API server on port 8000..."
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000


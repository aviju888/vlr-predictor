#!/bin/bash

# VLR Predictor Frontend Launcher
echo "🚀 Starting VLR Predictor Frontend..."

# Check if we're in the right directory
if [ ! -f "app/main.py" ]; then
    echo "❌ Error: Please run this script from the vlr-predictor root directory"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Error: Virtual environment not found. Please run 'python -m venv venv' first"
    exit 1
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source venv/bin/activate

# Check if API server is already running
if curl -s http://127.0.0.1:8000/health/ > /dev/null 2>&1; then
    echo "✅ API server is already running on port 8000"
else
    echo "🔧 Starting API server..."
    uvicorn app.main:app --reload --port 8000 &
    API_PID=$!
    echo "📡 API server started with PID: $API_PID"
    
    # Wait for API to be ready
    echo "⏳ Waiting for API to be ready..."
    for i in {1..30}; do
        if curl -s http://127.0.0.1:8000/health/ > /dev/null 2>&1; then
            echo "✅ API server is ready!"
            break
        fi
        sleep 1
    done
fi

# Start frontend server
echo "🌐 Starting frontend server..."
cd frontend
python -m http.server 8080 &
FRONTEND_PID=$!
echo "🎨 Frontend server started with PID: $FRONTEND_PID"

echo ""
echo "🎉 VLR Predictor is now running!"
echo ""
echo "📱 Frontend: http://localhost:8080"
echo "🔧 API: http://127.0.0.1:8000"
echo "📊 API Docs: http://127.0.0.1:8000/docs"
echo "🧪 Demo: http://localhost:8080/demo.html"
echo ""
echo "Press Ctrl+C to stop all servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $API_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Servers stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait

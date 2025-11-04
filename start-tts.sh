#!/bin/bash

# Quick start script for Coqui TTS server

echo "🎤 Starting Coqui AI TTS Server..."
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.9+"
    exit 1
fi

echo "✓ Python version: $(python3 --version)"

# Check if requirements are installed
if ! python3 -c "import TTS" &> /dev/null; then
    echo ""
    echo "📦 Installing dependencies..."
    pip install -r requirements.txt
fi

echo ""
echo "🚀 Starting server on http://localhost:8000"
echo "   Press Ctrl+C to stop"
echo ""

# Start the server
python3 tts_server.py

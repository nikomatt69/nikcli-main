#!/bin/bash

# nikCLI Background Agents Web Interface Startup Script

echo "🤖 Starting nikCLI Background Agents Web Interface..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    echo "Please install Python 3 and try again."
    exit 1
fi

# Check if the API server is running
echo "🔍 Checking API server connection..."
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ API server is running on http://localhost:3000"
else
    echo "⚠️  API server not detected on http://localhost:3000"
    echo "Please start the nikCLI API server first:"
    echo "  cd /workspace && yarn start:daemon"
    echo ""
    echo "Continuing anyway - you can start the API server later..."
fi

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Start the web server
echo "🚀 Starting web server on http://localhost:8080"
echo "📁 Serving files from: $SCRIPT_DIR"
echo ""
echo "🌐 Open your browser and go to: http://localhost:8080"
echo "🛑 Press Ctrl+C to stop the server"
echo ""

cd "$SCRIPT_DIR"
python3 -m http.server 8080
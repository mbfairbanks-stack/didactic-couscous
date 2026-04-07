#!/usr/bin/env bash
# Start Wetbanks Sous Chef (backend + frontend dev server)
set -e

# Check for ANTHROPIC_API_KEY
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Warning: ANTHROPIC_API_KEY is not set. AI features will not work."
  echo "  Set it with: export ANTHROPIC_API_KEY=your-key-here"
  echo ""
fi

echo "Starting backend on http://localhost:8000"
cd "$(dirname "$0")/backend"

# Install Python dependencies if needed
if ! python3 -c "import fastapi" 2>/dev/null; then
  echo "Installing Python dependencies..."
  pip install -r requirements.txt -q
fi

uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:5173"
cd "$(dirname "$0")/frontend"

# Install Node dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing Node dependencies..."
  npm install -q
fi

npm run dev &
FRONTEND_PID=$!

echo ""
echo "App running at  http://localhost:5173"
echo "API docs at     http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait

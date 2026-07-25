#!/usr/bin/env bash
# Start the budget app (backend + frontend dev server)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting backend on http://localhost:8000"
cd "$ROOT/backend"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:5173"
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "App running at http://localhost:5173"
echo "API docs at  http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait

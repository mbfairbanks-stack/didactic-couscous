#!/usr/bin/env bash
# Start the budget app (backend + frontend dev server)
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$REPO/backend"
FRONTEND="$REPO/frontend"

# ── Locate uvicorn ──────────────────────────────────────────────────────────
# Try common locations: venv, pip user install on Mac, system PATH
UVICORN=""
for candidate in \
    "uvicorn" \
    "$BACKEND/.venv/bin/uvicorn" \
    "$HOME/Library/Python/3.9/bin/uvicorn" \
    "$HOME/Library/Python/3.10/bin/uvicorn" \
    "$HOME/Library/Python/3.11/bin/uvicorn" \
    "$HOME/.local/bin/uvicorn"; do
  if command -v "$candidate" &>/dev/null 2>&1 || [ -x "$candidate" ]; then
    UVICORN="$candidate"
    break
  fi
done

if [ -z "$UVICORN" ]; then
  echo "ERROR: uvicorn not found. Install it with: pip install uvicorn"
  echo "  or: pip install --user uvicorn"
  exit 1
fi

# ── Start backend ────────────────────────────────────────────────────────────
echo "Starting backend  → http://localhost:8000"
(cd "$BACKEND" && "$UVICORN" main:app --reload --port 8000) &
BACKEND_PID=$!

# ── Start frontend ───────────────────────────────────────────────────────────
echo "Starting frontend → http://localhost:5173"
(cd "$FRONTEND" && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "  App running at  http://localhost:5173"
echo "  API docs at     http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

trap "echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait; exit 0" INT TERM
wait

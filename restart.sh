#!/usr/bin/env bash
# Kill any running instances and restart
echo "Stopping existing servers..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1
exec "$(dirname "$0")/start.sh"

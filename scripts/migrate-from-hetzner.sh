#!/usr/bin/env bash
# Migrate the budget app's data off the Hetzner server to this machine.
#
# What it does, in order:
#   1. Shows what's running on the remote server (sanity check before touching anything)
#   2. Locates the app directory on the server
#   3. Stops the remote app container so the SQLite files are quiesced
#   4. Copies the data/ directory (auth.db + all user databases) and .env here
#   5. Leaves the remote app STOPPED so the two copies can't diverge
#
# Usage:
#   ./scripts/migrate-from-hetzner.sh                     # defaults to root@77.42.64.184
#   SERVER=root@1.2.3.4 ./scripts/migrate-from-hetzner.sh
#   REMOTE_DIR=/opt/budget ./scripts/migrate-from-hetzner.sh   # skip auto-detection
#
# Afterwards, start the app locally:
#   docker compose -f docker-compose.local.yml up -d --build
set -euo pipefail

SERVER="${SERVER:-root@77.42.64.184}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "── Step 1: What is running on $SERVER ──────────────────────────"
ssh "$SERVER" "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'"
echo
read -r -p "Does this look like the BUDGET app server (not the gym tracker)? [y/N] " answer
[[ "$answer" =~ ^[Yy]$ ]] || { echo "Aborting — nothing was changed."; exit 1; }

echo
echo "── Step 2: Locating the app directory on the server ────────────"
if [[ -z "${REMOTE_DIR:-}" ]]; then
  REMOTE_DIR="$(ssh "$SERVER" \
    "find /root /home /opt /srv -maxdepth 4 -name docker-compose.prod.yml 2>/dev/null | head -1 | xargs -r dirname")"
fi
if [[ -z "$REMOTE_DIR" ]]; then
  echo "Could not find docker-compose.prod.yml on the server."
  echo "Re-run with REMOTE_DIR=/path/to/app ./scripts/migrate-from-hetzner.sh"
  exit 1
fi
echo "Found: $REMOTE_DIR"

echo
echo "── Step 3: Stopping the remote app (databases must be idle) ────"
ssh "$SERVER" "cd '$REMOTE_DIR' && docker compose -f docker-compose.prod.yml stop app demo"

echo
echo "── Step 4: Copying data to $REPO_ROOT/data ─────────────────────"
if command -v rsync >/dev/null 2>&1; then
  rsync -av "$SERVER:$REMOTE_DIR/data/" "$REPO_ROOT/data/"
else
  scp -r "$SERVER:$REMOTE_DIR/data/." "$REPO_ROOT/data/"
fi
# .env holds ANTHROPIC_API_KEY / passwords; copy it if present and we don't have one
if [[ ! -f "$REPO_ROOT/.env" ]]; then
  scp "$SERVER:$REMOTE_DIR/.env" "$REPO_ROOT/.env" 2>/dev/null \
    && echo "Copied .env" || echo "No .env on server (or already have one) — skipping"
fi

echo
echo "── Step 5: Archiving meal-planner data (if present) ────────────"
# The meal-planner backend keeps its SQLite db in a named Docker volume,
# not in this repo's data/ dir. Archive it so deleting the server loses nothing.
if ssh "$SERVER" "docker inspect meal-planner-backend-1 >/dev/null 2>&1"; then
  ssh "$SERVER" "rm -rf /tmp/mp-data && docker cp meal-planner-backend-1:/app/data /tmp/mp-data && tar czf /tmp/meal-planner-data.tar.gz -C /tmp mp-data"
  scp "$SERVER:/tmp/meal-planner-data.tar.gz" "$REPO_ROOT/meal-planner-data.tar.gz"
  echo "Saved to $REPO_ROOT/meal-planner-data.tar.gz"
else
  echo "No meal-planner container on this server — skipping"
fi

echo
echo "── Done ────────────────────────────────────────────────────────"
echo "Remote app is STOPPED (data can't diverge). To roll back instead:"
echo "  ssh $SERVER \"cd '$REMOTE_DIR' && docker compose -f docker-compose.prod.yml start app demo\""
echo
echo "Start the app on this machine:"
echo "  docker compose -f docker-compose.local.yml up -d --build"
echo
echo "Once you've verified your data in the browser, delete the server in the"
echo "Hetzner console. See docs/HOME_MIGRATION.md for the full checklist."

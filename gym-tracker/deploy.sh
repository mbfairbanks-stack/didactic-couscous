#!/usr/bin/env bash
# Build the app and sync it to the Hetzner server.
set -euo pipefail
cd "$(dirname "$0")"

SERVER="${GYM_SERVER:-root@49.12.212.50}"

echo "Building…"
npm run build

echo "Uploading to $SERVER…"
rsync -avz --delete dist/ "$SERVER":/var/www/gym-tracker/

echo "Done → https://49.12.212.50.sslip.io"

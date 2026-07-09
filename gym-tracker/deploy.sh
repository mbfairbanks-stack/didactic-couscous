#!/usr/bin/env bash
# Deploy the gym tracker to the Hetzner server.
#
#   ./deploy.sh                 build the app and sync it (the everyday command)
#   ./deploy.sh --server-setup  install/refresh the backup API + Caddy config,
#                               then also build and sync the app
#
# Override the target with GYM_SERVER=user@host ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

SERVER="${GYM_SERVER:-root@49.12.212.50}"
SITE="https://49.12.212.50.sslip.io"

server_setup() {
  echo "==> Uploading backup API + Caddy config to $SERVER…"
  ssh "$SERVER" 'mkdir -p /opt/gym-tracker /etc/gym-tracker'
  rsync -avz server/backup_server.py server/gym-backup.service "$SERVER":/opt/gym-tracker/
  rsync -avz server/Caddyfile "$SERVER":/etc/caddy/Caddyfile

  echo "==> Configuring the service (idempotent; existing token is kept)…"
  ssh "$SERVER" 'bash -s' <<'REMOTE'
set -euo pipefail
if [ ! -f /etc/gym-tracker/backup.env ]; then
  printf 'GYM_BACKUP_TOKEN=%s\n' "$(openssl rand -hex 16)" > /etc/gym-tracker/backup.env
  echo "Generated a new backup token."
else
  echo "Existing backup token kept."
fi
chmod 600 /etc/gym-tracker/backup.env
cp /opt/gym-tracker/gym-backup.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable gym-backup
systemctl restart gym-backup
systemctl reload caddy
sleep 1
echo "gym-backup service is: $(systemctl is-active gym-backup)"
echo
echo "Your backup token (paste into the app's Backup tab):"
cat /etc/gym-tracker/backup.env
REMOTE
  echo "==> Server setup done."
}

if [ "${1:-}" = "--server-setup" ]; then
  server_setup
fi

echo "==> Building…"
npm run build

echo "==> Syncing app to $SERVER…"
rsync -avz --delete dist/ "$SERVER":/var/www/gym-tracker/

echo "==> Done → $SITE"

# Gym Tracker — server backup API

A tiny, single-user backup endpoint so the app can back up / restore your
workout JSON to your own Hetzner box. Stdlib Python only (no pip), token-auth,
runs as an isolated systemd service behind Caddy at `/api/backup`.

## One-time setup on the server

SSH in as root, then:

```bash
# 1. Put the server script in place
mkdir -p /opt/gym-tracker
# (upload backup_server.py to /opt/gym-tracker/ — e.g. from your Mac:
#   rsync -avz gym-tracker/server/backup_server.py root@49.12.212.50:/opt/gym-tracker/ )

# 2. Create a secret token and an env file for it
mkdir -p /etc/gym-tracker
printf 'GYM_BACKUP_TOKEN=%s\n' "$(openssl rand -hex 16)" > /etc/gym-tracker/backup.env
chmod 600 /etc/gym-tracker/backup.env
cat /etc/gym-tracker/backup.env      # copy the token — you'll paste it into the app

# 3. Install and start the service
cp /opt/gym-tracker/gym-backup.service /etc/systemd/system/    # or upload it there
systemctl daemon-reload
systemctl enable --now gym-backup
systemctl status gym-backup --no-pager | head -5               # should be active (running)

# 4. Point Caddy at the API (adds the /api reverse-proxy). Replace the
#    Caddyfile with server/Caddyfile from this repo, then:
systemctl reload caddy
```

## In the app

Open the **Backup** tab → **Cloud backup** → paste the token → **Back up now**.
On a new device, paste the same token and tap **Restore**.

## Notes

- The API listens only on `127.0.0.1:8787`; the outside world reaches it solely
  through Caddy (HTTPS) at `https://<host>/api/backup`.
- Data is stored at `/var/lib/gym-tracker/backup.json`, written atomically.
- It keeps the **latest** backup only (each "Back up now" overwrites). Your
  JSON export/import still works as a point-in-time archive.

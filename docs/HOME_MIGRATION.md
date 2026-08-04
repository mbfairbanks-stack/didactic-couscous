# Moving the budget app home (and shrinking the Hetzner bill)

The goal: run the budget app on a machine at home instead of on Hetzner,
keep only the gym-tracker server, and delete everything else. End state is
one small server + one IPv4 address — roughly half the current bill.

The app is fully self-contained: SQLite databases in the `data/` directory,
no external services. Moving it is a data copy, nothing more.

## 0. Confirm which server is which

Before deleting anything, verify what each server runs:

```bash
ssh root@77.42.64.184 docker ps    # expected: budget app (caddy, app, demo)
ssh root@49.12.212.50 docker ps    # expected: gym tracker
```

If the budget app is *not* on 77.42.64.184, pass the right IP to the
migration script with `SERVER=root@<ip>`.

## 1. Set up the home machine

Any always-on box works (old laptop, Raspberry Pi, mini PC). It needs
Docker and this repository:

```bash
git clone <this-repo> && cd didactic-couscous
```

## 2. Pull the data off the server

```bash
./scripts/migrate-from-hetzner.sh
```

The script shows you what's running on the server and asks for confirmation,
stops the remote app so the SQLite files are consistent, copies `data/`
(auth.db + every user database) and `.env` here, and leaves the remote app
stopped so the two copies can't diverge. It prints a one-line rollback
command in case you change your mind.

## 3. Run it

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Open `http://<home-machine-LAN-IP>/` from another device, log in, and check
that your accounts, transactions, and history are all there. This local
setup drops Caddy, TLS, and the public demo instance — none of them are
needed inside your own network.

## 4. Delete the budget server in the Hetzner console

Only after step 3 checks out:

1. Console → Servers → `ubuntu-4gb-hel1-1` (77.42.64.184) → Delete.
2. When prompted about its Primary IPs, delete them too. An *unattached*
   IPv4 bills more (~€1.70/mo) than an attached one, so don't orphan it.
3. Check the **Snapshots** tab — snapshots bill ~€0.011/GB/mo forever.
   Delete any you don't need.
4. Check the **Backups** tab for the remaining gym-tracker server. The
   backup option adds 20% to the server price; a nightly copy of its data
   to the home machine does the same job for free.

Servers bill until *deleted* — powering off changes nothing.

## Optional extras

- **Access from outside the house:** install [Tailscale](https://tailscale.com)
  on the home machine and your phone. The app stays private but reachable
  anywhere, free, with no ports opened.
- **Backups of the home instance:** the entire state is the `data/`
  directory. A cron line like
  `0 3 * * * tar czf /backups/budget-$(date +\%u).tar.gz -C /path/to/repo data`
  keeps a rolling week of backups.
- **Shrink the gym-tracker server:** a CX23 (4 GB) is likely oversized for
  it. An ARM CAX11 is €1–2/mo cheaper, but x86 snapshots don't restore onto
  ARM — you'd redeploy fresh and copy data over. Only worth it if CAX
  instances are orderable in your region (check the availability banner).

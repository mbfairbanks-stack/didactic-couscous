# Gym Tracker

A personal, single-user gym workout tracker. No login, no backend — everything
is stored in your browser's `localStorage`. Built for fast, thumb-friendly
logging on a phone at the gym.

## Your program

- **Workout A** (Tue): goblet squats, DB bench press, lat pulldown, DB Romanian
  deadlift, seated shoulder press, plank
- **Workout B** (Thu): leg press, seated cable row, incline DB press, walking
  lunges, cable face pulls, dead bugs
- **Workout C** (Sat): Smith machine squats, assisted pull-ups / lat pulldown,
  machine chest press, DB Romanian deadlift, DB bicep curls, rope triceps
  pushdowns, plank

The home screen highlights today's workout automatically based on the day of
the week.

## Features

- Preloaded sets x reps targets per exercise, with an input row per set
- "Last time" shown under every exercise (weight x reps, or seconds, or reps
  — pulled from your most recent session that logged it) plus a live "new
  best" badge when your top set beats it
- Editable, backdatable session date (no future dates) — sessions are always
  kept sorted by date internally so "last time" and trends stay correct even
  when you fill in a missed day out of order
- Progress view with a per-exercise sparkline of top-set weight/seconds/reps
  over time
- Tap any recent session to edit or delete it
- Rest timer with 30/60/90/120s presets (beep + vibration when it ends)
- JSON export (backup) and import (merge or full replace) — use this to move
  data between devices
- Dark theme by default, large tap targets, mobile-first layout

## Running locally

Requires Node 18+.

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`). On your phone,
you can also open `http://<your-computer's-LAN-IP>:5173` if you run
`npm run dev -- --host`.

Your data lives in your browser's localStorage for whatever origin (host +
port) you load the app from, so keep using the same URL to see your history.

## Building

```bash
npm run build
```

Outputs a static site to `dist/`. `npm run preview` serves that build locally
to sanity-check it before deploying.

## Deploying

This is a static site — any static host works.

**Netlify**: drag-and-drop the `dist/` folder onto https://app.netlify.com/drop,
or connect the repo and set build command `npm run build`, publish directory
`dist`.

**Vercel**: `vercel --cwd gym-tracker` (or connect the repo in the dashboard)
with build command `npm run build` and output directory `dist`.

**GitHub Pages**: build locally and push `dist/` to a `gh-pages` branch (e.g.
with the `gh-pages` npm package), or use a GitHub Actions workflow that runs
`npm run build` and deploys `dist/`. The Vite config already sets
`base: './'` so the built assets use relative paths and work from a repo
subpath like `https://<user>.github.io/<repo>/`.

## Backing up / moving devices

Open the **Backup** tab:

- **Export JSON** downloads a timestamped file with all your sessions.
- **Import (merge)** adds sessions from a file into what's already on the
  device (sessions with the same ID are overwritten by the file — handy for
  re-importing an updated backup).
- **Import (replace all)** wipes local data first, then loads the file — use
  this when setting up a new device from a backup.

Because everything is localStorage, clearing your browser's site data (or a
private/incognito window) will erase your history — export a backup
periodically.

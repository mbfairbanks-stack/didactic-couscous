// Optional one-tap backup/restore to your own server (the tiny token-protected
// API in /server). Single-user: auth is just a shared secret token you set on
// the server and paste in here once. Config is kept in localStorage.
const CFG_KEY = 'gym-tracker:backup-cfg:v1'

export function loadBackupConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY)) || {}
  } catch {
    return {}
  }
}

export function saveBackupConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
}

// Default to a relative /api path so the app just talks to whatever host it's
// served from. A custom base URL is only needed if the API lives elsewhere.
function apiUrl(cfg) {
  const base = (cfg.baseUrl || '').replace(/\/+$/, '')
  return `${base}/api/backup`
}

function authHeaders(cfg) {
  return { Authorization: `Bearer ${cfg.token || ''}` }
}

function friendlyError(res) {
  if (res.status === 401) return 'Wrong or missing token (401).'
  if (res.status === 404) return 'No backup found on the server yet.'
  return `Server error (${res.status}).`
}

export async function pushBackup(cfg, payloadJson) {
  const res = await fetch(apiUrl(cfg), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(cfg) },
    body: payloadJson,
  })
  if (!res.ok) throw new Error(friendlyError(res))
}

export async function pullBackup(cfg) {
  const res = await fetch(apiUrl(cfg), { headers: authHeaders(cfg) })
  if (!res.ok) throw new Error(friendlyError(res))
  return res.text()
}

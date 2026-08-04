import { loadMeals, saveMeals, loadLogs, saveLogs, loadTargets, saveTargets, mergeById } from './nutrition'

const SESSIONS_KEY = 'gym-tracker:sessions:v1'

export function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveSessions(sessions) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

// Sessions are always kept sorted by (date asc, createdAt asc) so "last
// time" and progress trends stay correct regardless of the order entries
// were saved in (important for backdating a missed day).
export function sortSessions(sessions) {
  return [...sessions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return (a.createdAt || 0) - (b.createdAt || 0)
  })
}

export function upsertSession(session) {
  const sessions = loadSessions()
  const idx = sessions.findIndex((s) => s.id === session.id)
  if (idx === -1) {
    sessions.push(session)
  } else {
    sessions[idx] = session
  }
  const sorted = sortSessions(sessions)
  saveSessions(sorted)
  return sorted
}

export function deleteSession(sessionId) {
  const sessions = loadSessions().filter((s) => s.id !== sessionId)
  saveSessions(sessions)
  return sessions
}

export function exportData() {
  return JSON.stringify(
    {
      app: 'gym-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: loadSessions(),
      meals: loadMeals(),
      nutritionLogs: loadLogs(),
      nutritionTargets: loadTargets(),
    },
    null,
    2,
  )
}

// Restores nutrition data from an export payload. `mode` is 'merge' (dedupe
// by id, keep existing) or 'replace' (overwrite). No-ops on old files that
// predate nutrition, so importing them never wipes current nutrition data.
function restoreNutrition(parsed, mode) {
  if (Array.isArray(parsed?.meals)) {
    saveMeals(mode === 'replace' ? parsed.meals : mergeById(loadMeals(), parsed.meals))
  }
  if (Array.isArray(parsed?.nutritionLogs)) {
    saveLogs(mode === 'replace' ? parsed.nutritionLogs : mergeById(loadLogs(), parsed.nutritionLogs))
  }
  if (parsed?.nutritionTargets) saveTargets(parsed.nutritionTargets)
}

// Merges imported sessions with existing ones, deduping by id (imported
// wins on id collision). Returns the merged, sorted list.
export function importData(jsonText) {
  const parsed = JSON.parse(jsonText)
  const incoming = Array.isArray(parsed) ? parsed : parsed.sessions
  if (!Array.isArray(incoming)) {
    throw new Error('File does not look like a gym-tracker export (no sessions array found).')
  }
  for (const s of incoming) {
    if (!s || typeof s.id !== 'string' || typeof s.date !== 'string' || typeof s.workout !== 'string') {
      throw new Error('File does not look like a gym-tracker export (malformed session).')
    }
  }

  const existing = loadSessions()
  const byId = new Map(existing.map((s) => [s.id, s]))
  for (const s of incoming) byId.set(s.id, s)

  const merged = sortSessions(Array.from(byId.values()))
  saveSessions(merged)
  restoreNutrition(parsed, 'merge')
  return merged
}

export function replaceAllData(jsonText) {
  const parsed = JSON.parse(jsonText)
  const incoming = Array.isArray(parsed) ? parsed : parsed.sessions
  if (!Array.isArray(incoming)) {
    throw new Error('File does not look like a gym-tracker export (no sessions array found).')
  }
  const sorted = sortSessions(incoming)
  saveSessions(sorted)
  restoreNutrition(parsed, 'replace')
  return sorted
}

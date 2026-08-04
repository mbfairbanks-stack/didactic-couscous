// Nutrition data lives alongside workout sessions in localStorage and is
// folded into the same JSON export/import (see lib/storage.js).
//
//   meals   -> reusable library: { id, name, calories, protein }
//   logs    -> per-item day log:  { id, date, name, calories, protein }
//              (denormalized snapshots so editing/deleting a saved meal
//               never rewrites history)
//   targets -> daily goals:       { calories, protein }

const MEALS_KEY = 'gym-tracker:meals:v1'
const LOGS_KEY = 'gym-tracker:nutrition-logs:v1'
const TARGETS_KEY = 'gym-tracker:nutrition-targets:v1'

export const DEFAULT_TARGETS = { calories: 2400, protein: 165 }

function loadArray(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function loadMeals() {
  return loadArray(MEALS_KEY)
}

export function saveMeals(meals) {
  localStorage.setItem(MEALS_KEY, JSON.stringify(meals))
  return meals
}

export function loadLogs() {
  return loadArray(LOGS_KEY)
}

export function saveLogs(logs) {
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs))
  return logs
}

export function loadTargets() {
  try {
    const raw = localStorage.getItem(TARGETS_KEY)
    if (!raw) return { ...DEFAULT_TARGETS }
    const t = JSON.parse(raw)
    return {
      calories: Number(t.calories) || DEFAULT_TARGETS.calories,
      protein: Number(t.protein) || DEFAULT_TARGETS.protein,
    }
  } catch {
    return { ...DEFAULT_TARGETS }
  }
}

export function saveTargets(targets) {
  localStorage.setItem(TARGETS_KEY, JSON.stringify(targets))
  return targets
}

// ---- helpers ----

export function itemsForDate(logs, date) {
  return logs.filter((l) => l.date === date)
}

export function dayTotals(items) {
  return items.reduce(
    (acc, i) => ({ calories: acc.calories + (Number(i.calories) || 0), protein: acc.protein + (Number(i.protein) || 0) }),
    { calories: 0, protein: 0 },
  )
}

// Daily totals oldest -> newest, for the history trend.
export function nutritionTrend(logs) {
  const byDate = new Map()
  for (const l of logs) {
    const cur = byDate.get(l.date) || { calories: 0, protein: 0 }
    cur.calories += Number(l.calories) || 0
    cur.protein += Number(l.protein) || 0
    byDate.set(l.date, cur)
  }
  return [...byDate.entries()]
    .map(([date, t]) => ({ date, ...t }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

// Merge incoming arrays into existing, deduped by id (incoming wins).
export function mergeById(existing, incoming) {
  const byId = new Map(existing.map((x) => [x.id, x]))
  for (const x of incoming) if (x && x.id) byId.set(x.id, x)
  return [...byId.values()]
}

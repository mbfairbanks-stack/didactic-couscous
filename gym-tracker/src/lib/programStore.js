import { DEFAULT_PROGRAM, WORKOUT_KEYS, isChoice } from '../data/program'

const KEY = 'gym-tracker:program:v1'
const MIGRATION_KEY = 'gym-tracker:program-migrations:v1'

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_PROGRAM))
}

function looksValid(p) {
  return p && WORKOUT_KEYS.every((k) => p[k] && Array.isArray(p[k].exercises))
}

// True if `id` names an exercise anywhere in a workout (top-level or inside a
// choice slot's options).
function workoutHasExercise(workout, id) {
  return workout.exercises.some((it) => (isChoice(it) ? it.options.some((o) => o.id === id) : it.id === id))
}

// One-time, idempotent additions that bring an already-saved program up to date
// with new seed exercises — so a saved program gains them without a full reset
// (which would discard the user's own program edits). Each runs at most once,
// tracked by id in MIGRATION_KEY, so intentionally deleting an exercise later
// won't make it reappear.
const PROGRAM_MIGRATIONS = [
  {
    id: 'c-db-overhead-press',
    apply(program) {
      const c = program.C
      if (!c || !Array.isArray(c.exercises) || workoutHasExercise(c, 'db_overhead_press')) return
      const ex = { id: 'db_overhead_press', name: 'Dumbbell overhead press', sets: 3, targetLabel: '6-8', type: 'weight' }
      // Insert right after the chest-press slot; append if it isn't found.
      const idx = c.exercises.findIndex((it) => it.id === 'c_press' || (isChoice(it) && it.options.some((o) => o.id === 'machine_chest_press')))
      if (idx === -1) c.exercises.push(ex)
      else c.exercises.splice(idx + 1, 0, ex)
    },
  },
]

function loadApplied() {
  try {
    const raw = localStorage.getItem(MIGRATION_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

// Runs any not-yet-applied migrations against a saved program, persisting both
// the updated program and the set of applied migration ids. A fresh install
// starts from the seed (already current), so its migrations are marked applied
// without running.
function migrate(program, isFresh) {
  const applied = loadApplied()
  let changed = false
  for (const m of PROGRAM_MIGRATIONS) {
    if (applied.has(m.id)) continue
    if (!isFresh) {
      m.apply(program)
      changed = true
    }
    applied.add(m.id)
  }
  if (changed) localStorage.setItem(KEY, JSON.stringify(program))
  localStorage.setItem(MIGRATION_KEY, JSON.stringify([...applied]))
  return program
}

export function loadProgram() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return migrate(cloneDefault(), true)
    const parsed = JSON.parse(raw)
    return looksValid(parsed) ? migrate(parsed, false) : cloneDefault()
  } catch {
    return cloneDefault()
  }
}

export function saveProgram(program) {
  localStorage.setItem(KEY, JSON.stringify(program))
  return program
}

export function resetProgram() {
  localStorage.removeItem(KEY)
  return cloneDefault()
}

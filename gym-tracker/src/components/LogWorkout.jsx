import { useEffect, useMemo, useState } from 'react'
import { PROGRAM } from '../data/program'
import { todayISO, findLastEntry } from '../lib/stats'
import ExerciseLogger from './ExerciseLogger'

function blankSet(exercise) {
  if (exercise.type === 'weight') return { weight: '', reps: '' }
  if (exercise.type === 'time') return { seconds: '' }
  if (exercise.type === 'cardio') return { level: '', distance: '', variant: exercise.variants?.[0] ?? '' }
  return { reps: '' }
}

function blankSets(exercise) {
  return Array.from({ length: exercise.sets }, () => blankSet(exercise))
}

function normalizeSet(set, type) {
  if (type === 'weight') {
    return {
      weight: set.weight === '' || set.weight == null ? null : Number(set.weight),
      reps: set.reps === '' || set.reps == null ? null : Number(set.reps),
    }
  }
  if (type === 'time') {
    return { seconds: set.seconds === '' || set.seconds == null ? null : Number(set.seconds) }
  }
  if (type === 'cardio') {
    return {
      level: set.level === '' || set.level == null ? null : Number(set.level),
      distance: set.distance === '' || set.distance == null ? null : Number(set.distance),
      variant: set.variant || null,
    }
  }
  return { reps: set.reps === '' || set.reps == null ? null : Number(set.reps) }
}

export default function LogWorkout({ workoutKey, sessions, existingSession, onSave }) {
  const workout = PROGRAM[workoutKey]
  const [date, setDate] = useState(existingSession?.date || todayISO())
  const [entries, setEntries] = useState(() => {
    const init = {}
    for (const ex of workout.exercises) {
      if (!existingSession?.entries?.[ex.id]) {
        init[ex.id] = blankSets(ex)
        continue
      }
      // Rehydrate saved sets, then pad up to the program's current target so
      // a session logged before the target grew (e.g. 2x12 -> 3x12) still
      // exposes the extra set rows for editing.
      const saved = existingSession.entries[ex.id].map((s) => ({
        weight: s.weight ?? '',
        reps: s.reps ?? '',
        seconds: s.seconds ?? '',
        level: s.level ?? '',
        distance: s.distance ?? '',
        variant: s.variant ?? (ex.variants?.[0] ?? ''),
      }))
      while (saved.length < ex.sets) saved.push(blankSet(ex))
      init[ex.id] = saved
    }
    return init
  })

  const [doneKeys, setDoneKeys] = useState(() => new Set())
  const sessionId = useMemo(() => existingSession?.id || crypto.randomUUID(), [existingSession])
  const today = todayISO()
  const dateIsInFuture = date > today

  // Keep the screen awake while logging so it doesn't sleep between sets.
  useEffect(() => {
    let lock = null
    const request = async () => {
      try {
        if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen')
      } catch {
        // Wake Lock unsupported or blocked (e.g. low battery) — harmless.
      }
    }
    request()
    const onVisible = () => {
      if (document.visibilityState === 'visible') request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [])

  function updateSet(exerciseId, index, next) {
    setEntries((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s, i) => (i === index ? next : s)),
    }))
  }

  function addSet(exercise) {
    setEntries((prev) => ({
      ...prev,
      [exercise.id]: [...prev[exercise.id], blankSet(exercise)],
    }))
  }

  // Fill each set from the matching set of the last session for this exercise.
  function prefillFromLast(exercise, lastEntry) {
    if (!lastEntry) return
    setEntries((prev) => ({
      ...prev,
      [exercise.id]: prev[exercise.id].map((s, i) => {
        const src = lastEntry.sets[i]
        if (!src) return s
        if (exercise.type === 'weight') return { ...s, weight: src.weight ?? '', reps: src.reps ?? '' }
        if (exercise.type === 'time') return { ...s, seconds: src.seconds ?? '' }
        if (exercise.type === 'cardio')
          return { ...s, level: src.level ?? '', distance: src.distance ?? '', variant: src.variant ?? s.variant }
        return { ...s, reps: src.reps ?? '' }
      }),
    }))
  }

  function toggleDone(exerciseId, index) {
    const key = `${exerciseId}:${index}`
    setDoneKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        // Auto-start the rest timer when a set is marked complete.
        window.dispatchEvent(new CustomEvent('gym:rest-start', { detail: 90 }))
      }
      return next
    })
  }

  function handleSave() {
    if (dateIsInFuture) return
    const savedEntries = {}
    const entryTypes = {}
    for (const ex of workout.exercises) {
      savedEntries[ex.id] = entries[ex.id].map((s) => normalizeSet(s, ex.type))
      entryTypes[ex.id] = ex.type
    }
    onSave({
      id: sessionId,
      date,
      workout: workoutKey,
      createdAt: existingSession?.createdAt ?? Date.now(),
      entries: savedEntries,
      entryTypes,
    })
  }

  return (
    <div>
      <div className="field-row">
        <label htmlFor="session-date">Date</label>
        <input
          id="session-date"
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {dateIsInFuture && (
        <div className="toast error" style={{ position: 'static', transform: 'none', margin: '0 0 1rem' }}>
          Session date can't be in the future.
        </div>
      )}

      {workout.exercises.map((ex) => {
        const lastEntry = findLastEntry(sessions, ex.id, {
          beforeDate: date,
          excludeId: sessionId,
          selfCreatedAt: existingSession?.createdAt,
        })
        return (
          <ExerciseLogger
            key={ex.id}
            exercise={ex}
            sets={entries[ex.id]}
            lastEntry={lastEntry}
            onChangeSet={(i, next) => updateSet(ex.id, i, next)}
            onAddSet={() => addSet(ex)}
            onPrefill={lastEntry ? () => prefillFromLast(ex, lastEntry) : null}
            isDone={(i) => doneKeys.has(`${ex.id}:${i}`)}
            onToggleDone={(i) => toggleDone(ex.id, i)}
          />
        )
      })}

      <div className="sticky-save">
        <button className="primary-btn" onClick={handleSave} disabled={dateIsInFuture}>
          Save session
        </button>
      </div>
    </div>
  )
}

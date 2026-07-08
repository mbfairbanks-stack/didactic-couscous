import { useMemo, useState } from 'react'
import { PROGRAM } from '../data/program'
import { todayISO, findLastEntry } from '../lib/stats'
import ExerciseLogger from './ExerciseLogger'

function blankSets(exercise) {
  return Array.from({ length: exercise.sets }, () => {
    if (exercise.type === 'weight') return { weight: '', reps: '' }
    if (exercise.type === 'time') return { seconds: '' }
    if (exercise.type === 'cardio') return { level: '', distance: '', variant: exercise.variants?.[0] ?? '' }
    return { reps: '' }
  })
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
      init[ex.id] = existingSession?.entries?.[ex.id]
        ? existingSession.entries[ex.id].map((s) => ({
            weight: s.weight ?? '',
            reps: s.reps ?? '',
            seconds: s.seconds ?? '',
            level: s.level ?? '',
            distance: s.distance ?? '',
            variant: s.variant ?? (ex.variants?.[0] ?? ''),
          }))
        : blankSets(ex)
    }
    return init
  })

  const sessionId = useMemo(() => existingSession?.id || crypto.randomUUID(), [existingSession])
  const today = todayISO()
  const dateIsInFuture = date > today

  function updateSet(exerciseId, index, next) {
    setEntries((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s, i) => (i === index ? next : s)),
    }))
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

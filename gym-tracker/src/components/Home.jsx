import { PROGRAM, WORKOUT_KEYS, getTodaysWorkoutKey } from '../data/program'
import { formatDateLabel } from '../lib/stats'

export default function Home({ sessions, onPickWorkout, onOpenSession }) {
  const todayKey = getTodaysWorkoutKey()
  const recent = [...sessions].reverse().slice(0, 8)

  return (
    <div>
      <h2>Start a workout</h2>
      <div className="workout-pick-grid">
        {WORKOUT_KEYS.map((key) => (
          <button
            key={key}
            className={`workout-pick${key === todayKey ? ' today' : ''}`}
            onClick={() => onPickWorkout(key)}
          >
            {key}
            <span className="sub">{key === todayKey ? "Today" : PROGRAM[key].exercises.length + ' ex'}</span>
          </button>
        ))}
      </div>

      <h2>Recent sessions</h2>
      {recent.length === 0 ? (
        <div className="empty-state">No sessions logged yet. Pick a workout above to get started.</div>
      ) : (
        <div className="card">
          {recent.map((s) => (
            <button key={s.id} className="session-list-item" onClick={() => onOpenSession(s)}>
              <span>
                <span className="badge">{s.workout}</span>
                {formatDateLabel(s.date)}
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                {Object.keys(s.entries || {}).length} exercises
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

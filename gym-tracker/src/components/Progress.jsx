import { useState } from 'react'
import { getAllExercises } from '../data/program'
import { progressSeries, formatDateLabel } from '../lib/stats'
import Sparkline from './Sparkline'

export default function Progress({ sessions }) {
  const exercises = getAllExercises()
  const [exerciseId, setExerciseId] = useState(exercises[0].id)
  const exercise = exercises.find((e) => e.id === exerciseId)

  const series = progressSeries(sessions, exerciseId)
  const chartPoints = series.map((p) => ({ date: p.date, value: p.value }))
  const best = series.length ? series.reduce((a, b) => (b.value > a.value ? b : a)) : null
  const latest = series.length ? series[series.length - 1] : null

  return (
    <div>
      <h2>Progress</h2>
      <select className="select-input" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </select>

      <div className="card" style={{ marginTop: '0.85rem' }}>
        {series.length === 0 ? (
          <div className="empty-state">No logged sets for {exercise.name} yet.</div>
        ) : (
          <>
            <Sparkline points={chartPoints} />
            <div className="progress-stat-row">
              <span>
                Latest ({formatDateLabel(latest.date)}): <strong>{latest.display}</strong>
              </span>
              <span>
                Best: <strong>{best.display}</strong>
              </span>
            </div>
          </>
        )}
      </div>

      {series.length > 0 && (
        <div className="card progress-history">
          {[...series].reverse().map((p, i) => (
            <div className="progress-history-row" key={i}>
              <span className="pdate">{formatDateLabel(p.date)}</span>
              <span>{p.display}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

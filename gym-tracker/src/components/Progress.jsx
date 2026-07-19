import { useState } from 'react'
import { getAllExercises } from '../data/program'
import { progressSeries, personalBests, stallInfo, formatDateLabel } from '../lib/stats'
import Sparkline from './Sparkline'

export default function Progress({ sessions }) {
  const exercises = getAllExercises()
  const [exerciseId, setExerciseId] = useState(exercises[0].id)
  const [metric, setMetric] = useState('top')
  const exercise = exercises.find((e) => e.id === exerciseId)

  const bests = personalBests(sessions, exercises)
  // est. 1RM only applies to weight lifts; fall back to top set otherwise.
  const canE1rm = exercise.type === 'weight'
  const effMetric = metric === 'e1rm' && !canE1rm ? 'top' : metric
  const stall = stallInfo(sessions, exerciseId)
  const series = progressSeries(sessions, exerciseId, effMetric)
  const chartPoints = series.map((p) => ({ date: p.date, value: p.value }))
  const best = series.length ? series.reduce((a, b) => (b.value > a.value ? b : a)) : null
  const latest = series.length ? series[series.length - 1] : null

  return (
    <div>
      {bests.length > 0 && (
        <>
          <h2>Personal bests</h2>
          <div className="card pr-list">
            {bests.map((b) => (
              <button key={b.id} className="pr-row" onClick={() => setExerciseId(b.id)}>
                <span className="pr-name">{b.name}</span>
                <span className="pr-best">{b.display}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2>Progress</h2>
      <select className="select-input" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </select>

      <div className="metric-toggle">
        <button className={effMetric === 'top' ? 'active' : ''} onClick={() => setMetric('top')}>
          Top set
        </button>
        <button className={effMetric === 'volume' ? 'active' : ''} onClick={() => setMetric('volume')}>
          Volume
        </button>
        {canE1rm && (
          <button className={effMetric === 'e1rm' ? 'active' : ''} onClick={() => setMetric('e1rm')}>
            Est. 1RM
          </button>
        )}
      </div>

      {stall && (
        <div className="stall-hint">
          Plateau: no new top set in {stall.since} session{stall.since === 1 ? '' : 's'}. Consider a deload, a rep
          change, or the alternate exercise.
        </div>
      )}

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

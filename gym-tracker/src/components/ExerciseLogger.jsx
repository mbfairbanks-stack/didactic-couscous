import { formatDateLabel, topSetMetric } from '../lib/stats'

function SetInputs({ type, set, onChange }) {
  if (type === 'weight') {
    return (
      <>
        <input
          type="number"
          inputMode="decimal"
          placeholder="lb"
          value={set.weight ?? ''}
          onChange={(e) => onChange({ ...set, weight: e.target.value })}
        />
        <span className="x">x</span>
        <input
          type="number"
          inputMode="numeric"
          placeholder="reps"
          value={set.reps ?? ''}
          onChange={(e) => onChange({ ...set, reps: e.target.value })}
        />
      </>
    )
  }
  if (type === 'time') {
    return (
      <input
        type="number"
        inputMode="numeric"
        placeholder="seconds"
        value={set.seconds ?? ''}
        onChange={(e) => onChange({ ...set, seconds: e.target.value })}
      />
    )
  }
  // reps only
  return (
    <input
      type="number"
      inputMode="numeric"
      placeholder="reps"
      value={set.reps ?? ''}
      onChange={(e) => onChange({ ...set, reps: e.target.value })}
    />
  )
}

export default function ExerciseLogger({ exercise, sets, onChangeSet, lastEntry }) {
  const currentTop = topSetMetric(sets, exercise.type)
  const lastTop = lastEntry ? topSetMetric(lastEntry.sets, lastEntry.type) : null
  const isNewBest = currentTop && lastTop && currentTop.value > lastTop.value

  return (
    <div className="card exercise-card">
      <div className="ex-header">
        <span className="ex-name">{exercise.name}</span>
        <span className="ex-target">
          {exercise.sets} x {exercise.targetLabel}
        </span>
      </div>

      {lastEntry && lastTop ? (
        <div className="last-time">
          Last time ({formatDateLabel(lastEntry.date)}): <strong>{lastTop.display}</strong>
        </div>
      ) : (
        <div className="last-time">No previous data yet &mdash; log your first set.</div>
      )}

      {isNewBest && <div className="new-best">New best!</div>}

      {sets.map((set, i) => (
        <div className="set-row" key={i}>
          <span className="set-num">{i + 1}</span>
          <SetInputs type={exercise.type} set={set} onChange={(next) => onChangeSet(i, next)} />
        </div>
      ))}
    </div>
  )
}

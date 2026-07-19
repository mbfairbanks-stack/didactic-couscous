import { formatDateLabel, topSetMetric, suggestTarget } from '../lib/stats'

// Number input flanked by -/+ steppers so you can adjust weight/reps with a
// thumb instead of opening the keyboard mid-set.
function NumberField({ value, onChange, step, placeholder, inputMode = 'numeric' }) {
  function adjust(delta) {
    const n = value === '' || value == null ? 0 : Number(value)
    let next = n + delta
    if (next < 0) next = 0
    next = Math.round(next * 100) / 100
    onChange(String(next))
  }
  return (
    <div className="numfield">
      <button type="button" className="step" onClick={() => adjust(-step)} aria-label="decrease" tabIndex={-1}>
        −
      </button>
      <input
        type="number"
        inputMode={inputMode}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="step" onClick={() => adjust(step)} aria-label="increase" tabIndex={-1}>
        +
      </button>
    </div>
  )
}

function SetInputs({ exercise, set, onChange }) {
  const type = exercise.type
  if (type === 'cardio') {
    return (
      <>
        {exercise.variants && (
          <select
            className="cardio-variant"
            value={set.variant ?? exercise.variants[0]}
            onChange={(e) => onChange({ ...set, variant: e.target.value })}
          >
            {exercise.variants.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}
        <NumberField
          value={set.level}
          step={1}
          placeholder="lvl"
          onChange={(v) => onChange({ ...set, level: v })}
        />
        <span className="x">·</span>
        <NumberField
          value={set.distance}
          step={0.1}
          placeholder="dist"
          inputMode="decimal"
          onChange={(v) => onChange({ ...set, distance: v })}
        />
      </>
    )
  }
  if (type === 'weight') {
    return (
      <>
        <NumberField
          value={set.weight}
          step={5}
          placeholder="lb"
          inputMode="decimal"
          onChange={(v) => onChange({ ...set, weight: v })}
        />
        <span className="x">x</span>
        <NumberField value={set.reps} step={1} placeholder="reps" onChange={(v) => onChange({ ...set, reps: v })} />
      </>
    )
  }
  if (type === 'time') {
    return (
      <NumberField
        value={set.seconds}
        step={5}
        placeholder="seconds"
        onChange={(v) => onChange({ ...set, seconds: v })}
      />
    )
  }
  // reps only
  return <NumberField value={set.reps} step={1} placeholder="reps" onChange={(v) => onChange({ ...set, reps: v })} />
}

export default function ExerciseLogger({
  exercise,
  sets,
  onChangeSet,
  onAddSet,
  onPrefill,
  isDone,
  onToggleDone,
  lastEntry,
  choice,
}) {
  const currentTop = topSetMetric(sets, exercise.type)
  const lastTop = lastEntry ? topSetMetric(lastEntry.sets, lastEntry.type) : null
  const isNewBest = currentTop && lastTop && currentTop.value > lastTop.value
  const isCardio = exercise.type === 'cardio'
  const suggestion = lastEntry ? suggestTarget(lastEntry, exercise) : null

  return (
    <div className="card exercise-card">
      {choice && (
        <div className="choice-seg">
          {choice.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={o.id === choice.selectedId ? 'active' : ''}
              onClick={() => choice.onSelect(o.id)}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}

      <div className="ex-header">
        <span className="ex-name">{exercise.name}</span>
        <span className="ex-target">
          {isCardio ? exercise.targetLabel : `${exercise.sets} x ${exercise.targetLabel}`}
        </span>
      </div>

      {lastEntry && lastTop ? (
        <div className="last-time">
          <span>
            Last time ({formatDateLabel(lastEntry.date)}): <strong>{lastTop.display}</strong>
          </span>
          {onPrefill && (
            <button type="button" className="prefill-btn" onClick={onPrefill}>
              Prefill
            </button>
          )}
        </div>
      ) : (
        <div className="last-time">No previous data yet &mdash; log your first set.</div>
      )}

      {isNewBest ? (
        <div className="new-best">New best!</div>
      ) : (
        suggestion && <div className="beat-target">🎯 {suggestion}</div>
      )}

      {sets.map((set, i) => (
        <div className={`set-row${isDone && isDone(i) ? ' done' : ''}`} key={i}>
          <span className="set-num">{i + 1}</span>
          <SetInputs exercise={exercise} set={set} onChange={(next) => onChangeSet(i, next)} />
          {!isCardio && onToggleDone && (
            <button
              type="button"
              className="set-done"
              onClick={() => onToggleDone(i)}
              aria-label={isDone && isDone(i) ? 'Mark set not done' : 'Mark set done, start rest'}
            >
              ✓
            </button>
          )}
        </div>
      ))}

      {!isCardio && onAddSet && (
        <button type="button" className="add-set-btn" onClick={onAddSet}>
          + Add set
        </button>
      )}
    </div>
  )
}

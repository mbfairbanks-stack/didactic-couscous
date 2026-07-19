import { useState } from 'react'
import { WORKOUT_KEYS } from '../data/program'
import { resetProgram } from '../lib/programStore'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const uid = () => crypto.randomUUID()

function slugify(name) {
  return (
    String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'ex'
  )
}

function uniqueId(base, taken) {
  let id = base
  let n = 2
  while (taken.has(id)) id = `${base}_${n++}`
  return id
}

// Attach stable React keys to every item/option for editing.
function withKeys(program) {
  const p = JSON.parse(JSON.stringify(program))
  for (const k of WORKOUT_KEYS) {
    p[k].exercises = p[k].exercises.map((item) => {
      const it = { ...item, _key: uid() }
      if (Array.isArray(it.options)) it.options = it.options.map((o) => ({ ...o, _key: uid() }))
      return it
    })
  }
  return p
}

function existingIds(program) {
  const s = new Set()
  for (const k of WORKOUT_KEYS)
    for (const item of program[k].exercises) {
      if (item.id) s.add(item.id)
      if (Array.isArray(item.options)) for (const o of item.options) if (o.id) s.add(o.id)
    }
  return s
}

function cleanExercise(o, taken) {
  const { _key, ...rest } = o
  rest.name = (rest.name || '').trim() || 'Exercise'
  rest.sets = Math.min(20, Math.max(1, Number(rest.sets) || 1))
  rest.targetLabel = (rest.targetLabel || '').trim() || '10'
  if (!rest.type) rest.type = 'weight'
  if (rest.type === 'cardio') {
    if (typeof rest.variants === 'string')
      rest.variants = rest.variants
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    if (!Array.isArray(rest.variants) || rest.variants.length === 0) delete rest.variants
  } else {
    delete rest.variants
  }
  if (!rest.id) rest.id = uniqueId(slugify(rest.name), taken)
  taken.add(rest.id)
  return rest
}

// Strip editor keys and fill in ids/defaults, producing a saveable program.
function clean(program) {
  const p = JSON.parse(JSON.stringify(program))
  const taken = existingIds(program)
  for (const k of WORKOUT_KEYS) {
    p[k].dayOfWeek = Number(p[k].dayOfWeek)
    p[k].exercises = p[k].exercises.map((item) => {
      if (Array.isArray(item.options)) {
        const { _key, ...rest } = item
        rest.label = (rest.label || '').trim() || 'Choice'
        rest.options = rest.options.map((o) => cleanExercise(o, taken))
        if (!rest.id) rest.id = uniqueId(slugify(rest.label) + '_slot', taken)
        taken.add(rest.id)
        return rest
      }
      return cleanExercise(item, taken)
    })
  }
  return p
}

function ExerciseFields({ ex, onChange }) {
  const set = (patch) => onChange({ ...ex, ...patch })
  return (
    <div className="edit-fields">
      <input
        className="text-input"
        placeholder="Exercise name"
        value={ex.name || ''}
        onChange={(e) => set({ name: e.target.value })}
      />
      <div className="edit-row">
        <select className="select-input" value={ex.type || 'weight'} onChange={(e) => set({ type: e.target.value })}>
          <option value="weight">Weight x reps</option>
          <option value="reps">Reps only</option>
          <option value="time">Time (sec)</option>
          <option value="cardio">Cardio (lvl+dist)</option>
        </select>
        <input
          className="text-input sets-input"
          type="number"
          min="1"
          inputMode="numeric"
          placeholder="sets"
          value={ex.sets ?? ''}
          onChange={(e) => set({ sets: e.target.value })}
        />
        <input
          className="text-input"
          placeholder="target"
          value={ex.targetLabel || ''}
          onChange={(e) => set({ targetLabel: e.target.value })}
        />
      </div>
      {ex.type === 'cardio' && (
        <input
          className="text-input"
          placeholder="options e.g. Row, Jog (optional)"
          value={Array.isArray(ex.variants) ? ex.variants.join(', ') : ex.variants || ''}
          onChange={(e) => set({ variants: e.target.value })}
        />
      )}
    </div>
  )
}

function ItemCard({ item, index, count, onChange, onMove, onDelete }) {
  const isSlot = Array.isArray(item.options)
  return (
    <div className="edit-item">
      <div className="edit-item-head">
        <span className="edit-item-title">{isSlot ? `Choice: ${item.label || ''}` : item.name || 'Exercise'}</span>
        <div className="edit-item-actions">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
            ↑
          </button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down">
            ↓
          </button>
          <button type="button" className="del" onClick={onDelete} aria-label="Delete">
            🗑
          </button>
        </div>
      </div>

      {isSlot ? (
        <>
          <input
            className="text-input"
            placeholder="Choice label (e.g. Chest press)"
            value={item.label || ''}
            onChange={(e) => onChange({ ...item, label: e.target.value })}
          />
          {item.options.map((o, oi) => (
            <div className="edit-option" key={o._key}>
              <ExerciseFields
                ex={o}
                onChange={(no) =>
                  onChange({ ...item, options: item.options.map((x, i) => (i === oi ? { ...no, _key: o._key } : x)) })
                }
              />
              <button
                type="button"
                className="link-btn"
                disabled={item.options.length <= 2}
                onClick={() => onChange({ ...item, options: item.options.filter((_, i) => i !== oi) })}
              >
                Remove option
              </button>
            </div>
          ))}
          <button
            type="button"
            className="add-set-btn"
            onClick={() =>
              onChange({
                ...item,
                options: [...item.options, { _key: uid(), id: '', name: '', sets: 3, targetLabel: '10', type: 'weight' }],
              })
            }
          >
            + Add option
          </button>
        </>
      ) : (
        <>
          <ExerciseFields ex={item} onChange={(ne) => onChange({ ...ne, _key: item._key })} />
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              const orig = { ...item }
              delete orig._key
              onChange({
                _key: item._key,
                id: '',
                label: item.name,
                options: [
                  { ...orig, _key: uid() },
                  { _key: uid(), id: '', name: '', sets: item.sets, targetLabel: item.targetLabel, type: item.type },
                ],
              })
            }}
          >
            Make this an either/or choice
          </button>
        </>
      )}
    </div>
  )
}

export default function ProgramEditor({ program, onSave }) {
  const [draft, setDraft] = useState(() => withKeys(program))
  const [msg, setMsg] = useState(null)

  const setExercises = (key, exercises) => setDraft((d) => ({ ...d, [key]: { ...d[key], exercises } }))

  function updateItem(key, idx, item) {
    setExercises(key, draft[key].exercises.map((x, i) => (i === idx ? item : x)))
  }
  function moveItem(key, idx, dir) {
    const arr = [...draft[key].exercises]
    const j = idx + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    setExercises(key, arr)
  }
  function deleteItem(key, idx) {
    setExercises(key, draft[key].exercises.filter((_, i) => i !== idx))
  }
  function addExercise(key) {
    setExercises(key, [...draft[key].exercises, { _key: uid(), id: '', name: '', sets: 3, targetLabel: '10', type: 'weight' }])
  }

  function handleSave() {
    onSave(clean(draft))
    setMsg('Program saved.')
    setTimeout(() => setMsg(null), 2500)
  }

  function handleReset() {
    if (!window.confirm('Reset the whole program to the original A/B/C default? Your logged sessions are not affected.'))
      return
    const def = resetProgram()
    setDraft(withKeys(def))
    onSave(def)
    setMsg('Reset to default.')
    setTimeout(() => setMsg(null), 2500)
  }

  return (
    <div>
      <h2>Edit program</h2>
      <p className="data-note">
        Changes apply to future sessions. Editing an exercise&apos;s name keeps its history &mdash; only the label
        changes. Deleting an exercise doesn&apos;t touch already-logged sessions.
      </p>

      {WORKOUT_KEYS.map((key) => (
        <div key={key} className="edit-workout">
          <div className="edit-workout-head">
            <span className="edit-workout-key">{key}</span>
            <input
              className="text-input"
              value={draft[key].name || ''}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...d[key], name: e.target.value } }))}
            />
            <select
              className="select-input day-select"
              value={draft[key].dayOfWeek}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...d[key], dayOfWeek: Number(e.target.value) } }))}
            >
              {DAYS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {draft[key].exercises.map((item, idx) => (
            <ItemCard
              key={item._key}
              item={item}
              index={idx}
              count={draft[key].exercises.length}
              onChange={(it) => updateItem(key, idx, it)}
              onMove={(dir) => moveItem(key, idx, dir)}
              onDelete={() => deleteItem(key, idx)}
            />
          ))}

          <button type="button" className="secondary-btn" onClick={() => addExercise(key)}>
            + Add exercise
          </button>
        </div>
      ))}

      <div className="sticky-save">
        <button className="primary-btn" onClick={handleSave}>
          Save program
        </button>
      </div>
      <button className="danger-btn" style={{ marginTop: '0.6rem' }} onClick={handleReset}>
        Reset to default
      </button>

      {msg && (
        <div className="toast" style={{ position: 'static', transform: 'none', marginTop: '0.85rem' }}>
          {msg}
        </div>
      )}
    </div>
  )
}

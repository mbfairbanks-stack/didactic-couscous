import { useState } from 'react'
import {
  loadMeals,
  saveMeals,
  loadLogs,
  saveLogs,
  loadTargets,
  saveTargets,
  itemsForDate,
  dayTotals,
  nutritionTrend,
} from '../lib/nutrition'
import { todayISO, formatDateLabel } from '../lib/stats'
import Sparkline from './Sparkline'

const uid = () => crypto.randomUUID()
const numOrZero = (v) => (v === '' || v == null ? 0 : Number(v) || 0)

function MacroBar({ label, value, target, unit, overWarn }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  const over = value > target && target > 0
  return (
    <div className="macro-bar">
      <div className="macro-bar-top">
        <span className="macro-label">{label}</span>
        <span className="macro-nums num">
          {Math.round(value)} / {target}
          {unit}
        </span>
      </div>
      <div className="macro-track">
        <div className={`macro-fill${over && overWarn ? ' over' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function Nutrition() {
  const [view, setView] = useState('today')
  const [date, setDate] = useState(todayISO())
  const [meals, setMeals] = useState(() => loadMeals())
  const [logs, setLogs] = useState(() => loadLogs())
  const [targets, setTargets] = useState(() => loadTargets())

  // quick-add form
  const [qa, setQa] = useState({ name: '', calories: '', protein: '', save: false })
  // library add/edit form
  const [mealForm, setMealForm] = useState({ id: null, name: '', calories: '', protein: '' })
  // targets edit
  const [editTargets, setEditTargets] = useState(false)
  const [targetForm, setTargetForm] = useState(targets)

  const today = todayISO()
  const dateIsFuture = date > today
  const items = itemsForDate(logs, date)
  const totals = dayTotals(items)

  const persistMeals = (m) => {
    setMeals(m)
    saveMeals(m)
  }
  const persistLogs = (l) => {
    setLogs(l)
    saveLogs(l)
  }

  function logMeal(meal) {
    if (dateIsFuture) return
    persistLogs([
      ...logs,
      { id: uid(), date, name: meal.name, calories: Number(meal.calories) || 0, protein: Number(meal.protein) || 0 },
    ])
  }

  function removeItem(id) {
    persistLogs(logs.filter((l) => l.id !== id))
  }

  function clearDay() {
    if (!window.confirm(`Delete all ${items.length} item(s) logged on ${formatDateLabel(date)}?`)) return
    persistLogs(logs.filter((l) => l.date !== date))
  }

  function submitQuickAdd() {
    const name = qa.name.trim()
    if (!name || qa.calories === '') return
    const entry = { name, calories: numOrZero(qa.calories), protein: numOrZero(qa.protein) }
    persistLogs([...logs, { id: uid(), date, ...entry }])
    if (qa.save) persistMeals([...meals, { id: uid(), ...entry }])
    setQa({ name: '', calories: '', protein: '', save: false })
  }

  function submitMeal() {
    const name = mealForm.name.trim()
    if (!name || mealForm.calories === '') return
    const data = { name, calories: numOrZero(mealForm.calories), protein: numOrZero(mealForm.protein) }
    if (mealForm.id) {
      persistMeals(meals.map((m) => (m.id === mealForm.id ? { ...m, ...data } : m)))
    } else {
      persistMeals([...meals, { id: uid(), ...data }])
    }
    setMealForm({ id: null, name: '', calories: '', protein: '' })
  }

  function deleteMeal(id) {
    if (!window.confirm('Delete this saved meal? Past logs are unaffected.')) return
    persistMeals(meals.filter((m) => m.id !== id))
    if (mealForm.id === id) setMealForm({ id: null, name: '', calories: '', protein: '' })
  }

  function saveTargetEdits() {
    const next = { calories: numOrZero(targetForm.calories) || targets.calories, protein: numOrZero(targetForm.protein) || targets.protein }
    setTargets(next)
    saveTargets(next)
    setEditTargets(false)
  }

  const trend = nutritionTrend(logs)

  return (
    <div>
      <div className="metric-toggle" style={{ marginTop: 0, marginBottom: '0.9rem' }}>
        <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>
          Today
        </button>
        <button className={view === 'meals' ? 'active' : ''} onClick={() => setView('meals')}>
          Meals
        </button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
          History
        </button>
      </div>

      {view === 'today' && (
        <>
          <div className="field-row">
            <label htmlFor="nutri-date">Date</label>
            <input
              id="nutri-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {dateIsFuture && (
            <div className="toast error" style={{ position: 'static', transform: 'none', margin: '0 0 1rem' }}>
              Date can&apos;t be in the future.
            </div>
          )}

          <div className="card">
            {!editTargets ? (
              <>
                <MacroBar label="Calories" value={totals.calories} target={targets.calories} unit="" overWarn />
                <MacroBar label="Protein" value={totals.protein} target={targets.protein} unit="g" />
                <button
                  className="link-btn"
                  onClick={() => {
                    setTargetForm(targets)
                    setEditTargets(true)
                  }}
                >
                  Edit targets
                </button>
              </>
            ) : (
              <div className="target-edit">
                <div className="macro-input-row">
                  <label>Calorie goal</label>
                  <input
                    className="text-input"
                    type="number"
                    inputMode="numeric"
                    value={targetForm.calories}
                    onChange={(e) => setTargetForm({ ...targetForm, calories: e.target.value })}
                  />
                </div>
                <div className="macro-input-row">
                  <label>Protein goal (g)</label>
                  <input
                    className="text-input"
                    type="number"
                    inputMode="numeric"
                    value={targetForm.protein}
                    onChange={(e) => setTargetForm({ ...targetForm, protein: e.target.value })}
                  />
                </div>
                <div className="btn-row" style={{ marginBottom: 0, marginTop: '0.6rem' }}>
                  <button className="primary-btn" onClick={saveTargetEdits}>
                    Save
                  </button>
                  <button className="secondary-btn" onClick={() => setEditTargets(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <h2>Log a meal</h2>
          {meals.length === 0 ? (
            <div className="empty-state">No saved meals yet. Add some in the Meals tab for one-tap logging.</div>
          ) : (
            <div className="meal-grid">
              {meals.map((m) => (
                <button key={m.id} className="meal-chip" onClick={() => logMeal(m)} disabled={dateIsFuture}>
                  <span className="meal-chip-name">{m.name}</span>
                  <span className="meal-chip-sub num">
                    {m.calories} kcal · {m.protein}g
                  </span>
                </button>
              ))}
            </div>
          )}

          <h2>Quick add</h2>
          <div className="card">
            <input
              className="text-input"
              placeholder="Food name"
              value={qa.name}
              onChange={(e) => setQa({ ...qa, name: e.target.value })}
              style={{ marginBottom: '0.5rem' }}
            />
            <div className="macro-input-row two">
              <input
                className="text-input"
                type="number"
                inputMode="numeric"
                placeholder="calories"
                value={qa.calories}
                onChange={(e) => setQa({ ...qa, calories: e.target.value })}
              />
              <input
                className="text-input"
                type="number"
                inputMode="numeric"
                placeholder="protein (g)"
                value={qa.protein}
                onChange={(e) => setQa({ ...qa, protein: e.target.value })}
              />
            </div>
            <label className="save-lib">
              <input type="checkbox" checked={qa.save} onChange={(e) => setQa({ ...qa, save: e.target.checked })} />
              Save to library
            </label>
            <button className="primary-btn" onClick={submitQuickAdd} disabled={dateIsFuture}>
              Add to {date === today ? 'today' : 'day'}
            </button>
          </div>

          <h2>
            {items.length} item{items.length === 1 ? '' : 's'} · {Math.round(totals.calories)} kcal ·{' '}
            {Math.round(totals.protein)}g
          </h2>
          {items.length === 0 ? (
            <div className="empty-state">Nothing logged for this day yet.</div>
          ) : (
            <div className="card">
              {items.map((i) => (
                <div className="log-row" key={i.id}>
                  <span className="log-name">{i.name}</span>
                  <span className="log-macros num">
                    {i.calories} kcal · {i.protein}g
                  </span>
                  <button className="log-x" onClick={() => removeItem(i.id)} aria-label="Remove">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {items.length > 0 && (
            <button className="danger-btn" onClick={clearDay}>
              Clear this day
            </button>
          )}
        </>
      )}

      {view === 'meals' && (
        <>
          <h2>{mealForm.id ? 'Edit meal' : 'New meal'}</h2>
          <div className="card">
            <input
              className="text-input"
              placeholder="Meal name"
              value={mealForm.name}
              onChange={(e) => setMealForm({ ...mealForm, name: e.target.value })}
              style={{ marginBottom: '0.5rem' }}
            />
            <div className="macro-input-row two">
              <input
                className="text-input"
                type="number"
                inputMode="numeric"
                placeholder="calories"
                value={mealForm.calories}
                onChange={(e) => setMealForm({ ...mealForm, calories: e.target.value })}
              />
              <input
                className="text-input"
                type="number"
                inputMode="numeric"
                placeholder="protein (g)"
                value={mealForm.protein}
                onChange={(e) => setMealForm({ ...mealForm, protein: e.target.value })}
              />
            </div>
            <div className="btn-row" style={{ marginBottom: 0 }}>
              <button className="primary-btn" onClick={submitMeal}>
                {mealForm.id ? 'Update' : 'Add meal'}
              </button>
              {mealForm.id && (
                <button className="secondary-btn" onClick={() => setMealForm({ id: null, name: '', calories: '', protein: '' })}>
                  Cancel
                </button>
              )}
            </div>
          </div>

          <h2>Saved meals</h2>
          {meals.length === 0 ? (
            <div className="empty-state">No saved meals yet.</div>
          ) : (
            <div className="card">
              {meals.map((m) => (
                <div className="meal-row" key={m.id}>
                  <span className="meal-row-name">{m.name}</span>
                  <span className="meal-row-macros num">
                    {m.calories} kcal · {m.protein}g
                  </span>
                  <div className="meal-row-actions">
                    <button onClick={() => setMealForm({ id: m.id, name: m.name, calories: m.calories, protein: m.protein })} aria-label="Edit">
                      ✎
                    </button>
                    <button className="del" onClick={() => deleteMeal(m.id)} aria-label="Delete">
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'history' && (
        <>
          {trend.length === 0 ? (
            <div className="empty-state">No days logged yet.</div>
          ) : (
            <>
              <h2>Calories</h2>
              <div className="card">
                <Sparkline points={trend.map((d) => ({ date: d.date, value: d.calories }))} />
              </div>
              <h2>Protein</h2>
              <div className="card">
                <Sparkline points={trend.map((d) => ({ date: d.date, value: d.protein }))} />
              </div>
              <h2>By day</h2>
              <div className="card">
                {[...trend].reverse().map((d) => (
                  <button
                    key={d.date}
                    className="log-row day-row"
                    onClick={() => {
                      setDate(d.date)
                      setView('today')
                    }}
                  >
                    <span className="log-name">{formatDateLabel(d.date)}</span>
                    <span className="log-macros num">
                      {Math.round(d.calories)} kcal · {Math.round(d.protein)}g
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

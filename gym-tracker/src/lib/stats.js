// Local-timezone YYYY-MM-DD (avoids UTC off-by-one-day issues from
// toISOString()).
export function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function hasData(set, type) {
  if (!set) return false
  if (type === 'weight') return set.reps != null && set.reps !== ''
  if (type === 'time') return set.seconds != null && set.seconds !== ''
  if (type === 'reps') return set.reps != null && set.reps !== ''
  if (type === 'cardio')
    return (set.distance != null && set.distance !== '') || (set.level != null && set.level !== '')
  return false
}

// Human label for a cardio set, e.g. "Row — Lvl 8 · 2.3".
function cardioDisplay(s) {
  const parts = []
  if (s.level != null && s.level !== '') parts.push(`Lvl ${s.level}`)
  if (s.distance != null && s.distance !== '') parts.push(`${s.distance} dist`)
  const body = parts.join(' · ') || '—'
  return s.variant ? `${s.variant} — ${body}` : body
}

// The "top set" metric used for best/progress comparisons:
//   weight -> heaviest weight logged (reps as tiebreak)
//   time   -> longest hold
//   reps   -> most reps
export function topSetMetric(sets, type) {
  const valid = (sets || []).filter((s) => hasData(s, type))
  if (valid.length === 0) return null

  if (type === 'weight') {
    let best = valid[0]
    for (const s of valid) {
      const w = Number(s.weight) || 0
      const bw = Number(best.weight) || 0
      if (w > bw || (w === bw && Number(s.reps) > Number(best.reps))) best = s
    }
    return { value: Number(best.weight) || 0, display: `${best.weight || 0} lb x ${best.reps}`, set: best }
  }
  if (type === 'time') {
    let best = valid[0]
    for (const s of valid) if (Number(s.seconds) > Number(best.seconds)) best = s
    return { value: Number(best.seconds) || 0, display: `${best.seconds} sec`, set: best }
  }
  if (type === 'reps') {
    let best = valid[0]
    for (const s of valid) if (Number(s.reps) > Number(best.reps)) best = s
    return { value: Number(best.reps) || 0, display: `${best.reps} reps`, set: best }
  }
  if (type === 'cardio') {
    // Distance is the progression metric ("go farther in 15 min").
    let best = valid[0]
    for (const s of valid) if ((Number(s.distance) || 0) > (Number(best.distance) || 0)) best = s
    return { value: Number(best.distance) || 0, display: cardioDisplay(best), set: best }
  }
  return null
}

export function entryHasAnyData(sets, type) {
  return (sets || []).some((s) => hasData(s, type))
}

// Per-set "volume" contribution used for the total-volume trend:
//   weight -> weight * reps      time -> seconds
//   reps   -> reps               cardio -> distance
function setVolume(set, type) {
  if (type === 'weight') return (Number(set.weight) || 0) * (Number(set.reps) || 0)
  if (type === 'time') return Number(set.seconds) || 0
  if (type === 'reps') return Number(set.reps) || 0
  if (type === 'cardio') return Number(set.distance) || 0
  return 0
}

export function entryVolume(sets, type) {
  return (sets || []).filter((s) => hasData(s, type)).reduce((sum, s) => sum + setVolume(s, type), 0)
}

// Estimated one-rep max (Epley). Rounded to the nearest pound.
export function estimate1RM(weight, reps) {
  const w = Number(weight)
  const r = Number(reps)
  if (!w || !r) return 0
  return Math.round(w * (1 + r / 30))
}

// Last integer in a target label, used as the rep goal: '10' -> 10,
// '8-10' -> 10, '10 per leg' -> 10.
function repGoal(targetLabel) {
  const m = String(targetLabel ?? '').match(/\d+/g)
  return m ? Number(m[m.length - 1]) : null
}

// A concrete "beat it" suggestion for today, from last time's top set.
export function suggestTarget(lastEntry, exercise) {
  if (!lastEntry) return null
  const top = topSetMetric(lastEntry.sets, lastEntry.type)
  if (!top) return null
  const type = exercise.type
  if (type === 'weight') {
    const goal = repGoal(exercise.targetLabel) ?? Number(top.set.reps)
    if (Number(top.set.reps) >= goal) {
      return `Try ${(Number(top.set.weight) || 0) + 5} lb x ${goal}`
    }
    return `Try ${top.set.weight} lb x ${Number(top.set.reps) + 1}`
  }
  if (type === 'reps') return `Try ${Number(top.set.reps) + 1} reps`
  if (type === 'time') return `Try ${Number(top.set.seconds) + 5}s`
  if (type === 'cardio') return `Go past ${top.set.distance} dist`
  return null
}

function formatVolume(value, type) {
  if (type === 'time') return `${value.toLocaleString()}s total`
  if (type === 'reps') return `${value.toLocaleString()} reps total`
  if (type === 'cardio') return `${value.toLocaleString()} dist`
  return `${value.toLocaleString()} lb vol`
}

// Most recent session for this exercise strictly before `beforeDate`
// (or same date but logged earlier, per createdAt) that has data logged.
// `excludeId` skips the session currently being edited. `selfCreatedAt`
// defaults to "now" (Infinity) so a brand-new, not-yet-saved session
// correctly treats every existing same-date session as "earlier".
export function findLastEntry(sessions, exerciseId, { beforeDate, excludeId, selfCreatedAt = Infinity }) {
  let best = null
  for (const session of sessions) {
    if (session.id === excludeId) continue
    if (session.date > beforeDate) continue
    if (session.date === beforeDate && (session.createdAt ?? 0) >= selfCreatedAt) continue

    const sets = session.entries?.[exerciseId]
    const type = session.entryTypes?.[exerciseId]
    if (!sets || !type || !entryHasAnyData(sets, type)) continue

    if (
      !best ||
      session.date > best.date ||
      (session.date === best.date && (session.createdAt ?? 0) > best._createdAt)
    ) {
      best = { date: session.date, sets, type, sessionId: session.id, _createdAt: session.createdAt ?? 0 }
    }
  }
  if (best) delete best._createdAt
  return best
}

// All sessions containing data for an exercise, oldest to newest, with a
// per-session value for progress charts. `metric` is 'top' (top-set) or
// 'volume' (total work that session).
export function progressSeries(sessions, exerciseId, metric = 'top') {
  const out = []
  for (const session of sessions) {
    const sets = session.entries?.[exerciseId]
    const type = session.entryTypes?.[exerciseId]
    if (!sets || !type || !entryHasAnyData(sets, type)) continue
    if (metric === 'e1rm' && type === 'weight') {
      let best = 0
      for (const s of sets) if (hasData(s, type)) best = Math.max(best, estimate1RM(s.weight, s.reps))
      if (best) out.push({ date: session.date, value: best, display: `${best} lb est. 1RM` })
    } else if (metric === 'volume') {
      const value = entryVolume(sets, type)
      out.push({ date: session.date, value, display: formatVolume(value, type) })
    } else {
      const top = topSetMetric(sets, type)
      if (top) out.push({ date: session.date, value: top.value, display: top.display })
    }
  }
  return out
}

// Flags a plateau: the all-time best top set was `windowN`+ sessions ago.
// Returns { since } or null. Needs enough history to be meaningful.
export function stallInfo(sessions, exerciseId, windowN = 3) {
  const series = progressSeries(sessions, exerciseId, 'top')
  if (series.length < windowN + 1) return null
  let bestIdx = 0
  for (let i = 1; i < series.length; i++) if (series[i].value >= series[bestIdx].value) bestIdx = i
  const since = series.length - 1 - bestIdx
  return since >= windowN ? { since } : null
}

// Best-ever top set for every exercise that has any logged data.
export function personalBests(sessions, exercises) {
  const out = []
  for (const ex of exercises) {
    const series = progressSeries(sessions, ex.id)
    if (series.length === 0) continue
    // On ties, keep the most recent (series is oldest->newest) so e.g. a later
    // 50x10 is shown over an earlier 50x8.
    const best = series.reduce((a, b) => (b.value >= a.value ? b : a))
    out.push({ id: ex.id, name: ex.name, display: best.display, date: best.date })
  }
  return out
}

// Monday (local) of the week containing an ISO date, as its own ISO string.
function mondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

// Count of consecutive weeks up to and including this week that have >=1
// session. Breaks as soon as a week is skipped.
export function weeklyStreak(sessions) {
  const weeks = new Set(sessions.map((s) => mondayOf(s.date)))
  let count = 0
  let cur = mondayOf(todayISO())
  while (weeks.has(cur)) {
    count++
    const [y, m, d] = cur.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() - 7)
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    cur = `${dt.getFullYear()}-${mm}-${dd}`
  }
  return count
}

export function sessionStats(sessions) {
  const total = sessions.length
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = sessions.filter((s) => s.date.startsWith(ym)).length
  // sessions are stored sorted ascending, so the last one is the newest.
  const last = total ? sessions[sessions.length - 1].date : null
  return { total, thisMonth, last, streak: weeklyStreak(sessions) }
}

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
  return false
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
  return null
}

export function entryHasAnyData(sets, type) {
  return (sets || []).some((s) => hasData(s, type))
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

// All sessions containing data for an exercise, oldest to newest, with
// their top-set metric, for progress charts.
export function progressSeries(sessions, exerciseId) {
  const out = []
  for (const session of sessions) {
    const sets = session.entries?.[exerciseId]
    const type = session.entryTypes?.[exerciseId]
    if (!sets || !type || !entryHasAnyData(sets, type)) continue
    const top = topSetMetric(sets, type)
    if (top) out.push({ date: session.date, value: top.value, display: top.display })
  }
  return out
}

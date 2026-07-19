import { useState } from 'react'
import Home from './components/Home'
import LogWorkout from './components/LogWorkout'
import Progress from './components/Progress'
import DataManager from './components/DataManager'
import ProgramEditor from './components/ProgramEditor'
import RestTimer from './components/RestTimer'
import { loadSessions, upsertSession, deleteSession } from './lib/storage'
import { loadProgram, saveProgram } from './lib/programStore'

const TABS = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'progress', label: 'Progress', icon: '📈' },
  { key: 'program', label: 'Program', icon: '⚙️' },
  { key: 'data', label: 'Backup', icon: '💾' },
]

export default function App() {
  const [sessions, setSessions] = useState(() => loadSessions())
  const [program, setProgram] = useState(() => loadProgram())
  const [tab, setTab] = useState('home')
  const [logging, setLogging] = useState(null) // { workoutKey, existingSession } | null

  function handleProgramSave(next) {
    setProgram(saveProgram(next))
  }

  function openNewSession(workoutKey) {
    setLogging({ workoutKey, existingSession: null })
  }

  function openExistingSession(session) {
    setLogging({ workoutKey: session.workout, existingSession: session })
  }

  function handleSave(session) {
    const updated = upsertSession(session)
    setSessions(updated)
    setLogging(null)
    setTab('home')
  }

  function handleDelete(sessionId) {
    if (!window.confirm('Delete this session? This cannot be undone.')) return
    const updated = deleteSession(sessionId)
    setSessions(updated)
    setLogging(null)
    setTab('home')
  }

  return (
    <>
      <header className="app-header">
        {logging ? (
          <button className="icon-btn" onClick={() => setLogging(null)} aria-label="Back">
            ←
          </button>
        ) : null}
        <h1>{logging ? `Workout ${logging.workoutKey}` : 'Gym Tracker'}</h1>
        {logging?.existingSession && (
          <button
            className="icon-btn"
            onClick={() => handleDelete(logging.existingSession.id)}
            aria-label="Delete session"
          >
            🗑
          </button>
        )}
      </header>

      <main className="app-main">
        {logging ? (
          <LogWorkout
            workoutKey={logging.workoutKey}
            program={program}
            sessions={sessions}
            existingSession={logging.existingSession}
            onSave={handleSave}
          />
        ) : tab === 'home' ? (
          <Home
            program={program}
            sessions={sessions}
            onPickWorkout={openNewSession}
            onOpenSession={openExistingSession}
          />
        ) : tab === 'progress' ? (
          <Progress program={program} sessions={sessions} />
        ) : tab === 'program' ? (
          <ProgramEditor program={program} onSave={handleProgramSave} />
        ) : (
          <DataManager sessions={sessions} onDataChanged={setSessions} />
        )}
      </main>

      {logging && <RestTimer />}

      {!logging && (
        <nav className="tab-bar">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              <span className="tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.55)
  } catch {
    // Audio not available (e.g. autoplay restrictions) — vibration below still fires.
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200])
}

export default function RestTimer() {
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState(60)
  const [endAt, setEndAt] = useState(null)
  const [remaining, setRemaining] = useState(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (endAt == null) return
    const tick = () => {
      const secs = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      setRemaining(secs)
      if (secs === 0 && !firedRef.current) {
        firedRef.current = true
        beep()
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [endAt])

  function start(seconds) {
    setDuration(seconds)
    firedRef.current = false
    setEndAt(Date.now() + seconds * 1000)
    setOpen(true)
  }

  function reset() {
    firedRef.current = false
    setEndAt(null)
    setRemaining(null)
  }

  const isDone = remaining === 0

  if (!open) {
    return (
      <button className="timer-fab" onClick={() => setOpen(true)} aria-label="Rest timer">
        ⏱
      </button>
    )
  }

  const mm = remaining != null ? String(Math.floor(remaining / 60)).padStart(2, '0') : '00'
  const ss = remaining != null ? String(remaining % 60).padStart(2, '0') : String(duration).padStart(2, '0')

  return (
    <div className="timer-panel">
      <div className="timer-panel-inner">
        <button className="timer-close" onClick={() => setOpen(false)} aria-label="Close timer">
          ✕
        </button>
        <div className={`timer-display${isDone ? ' done' : ''}`}>
          {remaining != null ? `${mm}:${ss}` : `${duration}s`}
        </div>
        <div className="timer-presets">
          {[30, 60, 90, 120].map((s) => (
            <button key={s} onClick={() => start(s)}>
              {s}s
            </button>
          ))}
        </div>
        <div className="timer-controls">
          <button className="secondary-btn" onClick={reset}>
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

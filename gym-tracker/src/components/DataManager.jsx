import { useRef, useState } from 'react'
import { exportData, importData, replaceAllData } from '../lib/storage'

export default function DataManager({ sessions, onDataChanged }) {
  const fileInputRef = useRef(null)
  const [message, setMessage] = useState(null)

  function handleExport() {
    const json = exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `gym-tracker-backup-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function handleFilePicked(mode) {
    return async (e) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      try {
        const text = await file.text()
        const merged = mode === 'merge' ? importData(text) : replaceAllData(text)
        onDataChanged(merged)
        setMessage({ type: 'ok', text: `Imported successfully. ${merged.length} session(s) total.` })
      } catch (err) {
        setMessage({ type: 'error', text: err.message || 'Import failed.' })
      }
    }
  }

  function triggerImport(mode) {
    if (mode === 'replace' && !window.confirm('This replaces ALL current data with the file contents. Continue?')) {
      return
    }
    fileInputRef.current.dataset.mode = mode
    fileInputRef.current.click()
  }

  return (
    <div>
      <h2>Backup &amp; restore</h2>
      <div className="card">
        <p className="data-note">
          {sessions.length} session{sessions.length === 1 ? '' : 's'} stored on this device, in your browser's
          local storage. Export a backup regularly, or before switching devices/browsers.
        </p>
        <div className="btn-row" style={{ marginBottom: 0 }}>
          <button className="primary-btn" onClick={handleExport}>
            Export JSON
          </button>
        </div>
      </div>

      <div className="card">
        <p className="data-note">
          Import a previously exported file. <strong>Merge</strong> adds sessions from the file to what's already
          here (matching sessions in both are overwritten by the file). <strong>Replace</strong> wipes existing data
          first.
        </p>
        <div className="btn-row">
          <button className="secondary-btn" onClick={() => triggerImport('merge')}>
            Import (merge)
          </button>
          <button className="danger-btn" onClick={() => triggerImport('replace')}>
            Import (replace all)
          </button>
        </div>
        <input
          type="file"
          accept="application/json"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={(e) => handleFilePicked(fileInputRef.current.dataset.mode)(e)}
        />
      </div>

      {message && (
        <div className={`toast${message.type === 'error' ? ' error' : ''}`} style={{ position: 'static', transform: 'none' }}>
          {message.text}
        </div>
      )}
    </div>
  )
}

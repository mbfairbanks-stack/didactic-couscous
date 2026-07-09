import { useRef, useState } from 'react'
import { exportData, importData, replaceAllData } from '../lib/storage'
import { loadBackupConfig, saveBackupConfig, pushBackup, pullBackup } from '../lib/backup'

export default function DataManager({ sessions, onDataChanged }) {
  const fileInputRef = useRef(null)
  const [message, setMessage] = useState(null)
  const [cfg, setCfg] = useState(() => loadBackupConfig())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)

  function updateCfg(patch) {
    const next = { ...cfg, ...patch }
    setCfg(next)
    saveBackupConfig(next)
  }

  async function handleCloudBackup() {
    if (!cfg.token) {
      setMessage({ type: 'error', text: 'Enter your server token first.' })
      return
    }
    setBusy(true)
    try {
      await pushBackup(cfg, exportData())
      const at = new Date().toISOString()
      updateCfg({ lastBackupAt: at })
      setMessage({ type: 'ok', text: `Backed up ${sessions.length} session(s) to your server.` })
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Backup failed.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleCloudRestore() {
    if (!cfg.token) {
      setMessage({ type: 'error', text: 'Enter your server token first.' })
      return
    }
    if (!window.confirm('Restore from server? This replaces ALL data on this device with the server copy.')) return
    setBusy(true)
    try {
      const text = await pullBackup(cfg)
      const restored = replaceAllData(text)
      onDataChanged(restored)
      setMessage({ type: 'ok', text: `Restored ${restored.length} session(s) from your server.` })
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Restore failed.' })
    } finally {
      setBusy(false)
    }
  }

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

      <h2>Cloud backup (your server)</h2>
      <div className="card">
        <p className="data-note">
          Optional one-tap backup to your own server. Still single-user &mdash; just paste the token you set on the
          server. {cfg.lastBackupAt
            ? `Last backed up ${new Date(cfg.lastBackupAt).toLocaleString()}.`
            : 'Not backed up yet.'}
        </p>
        <div className="field-row" style={{ marginBottom: '0.6rem' }}>
          <label htmlFor="backup-token">Token</label>
          <input
            id="backup-token"
            type="password"
            className="text-input"
            placeholder="server token"
            value={cfg.token || ''}
            onChange={(e) => updateCfg({ token: e.target.value })}
          />
        </div>

        <button className="link-btn" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? 'Hide' : 'Advanced'}
        </button>
        {showAdvanced && (
          <div className="field-row" style={{ margin: '0.5rem 0 0' }}>
            <label htmlFor="backup-url">Server URL</label>
            <input
              id="backup-url"
              type="url"
              className="text-input"
              placeholder="(this site)"
              value={cfg.baseUrl || ''}
              onChange={(e) => updateCfg({ baseUrl: e.target.value })}
            />
          </div>
        )}

        <div className="btn-row" style={{ marginTop: '0.85rem', marginBottom: 0 }}>
          <button className="primary-btn" onClick={handleCloudBackup} disabled={busy}>
            {busy ? 'Working…' : 'Back up now'}
          </button>
          <button className="secondary-btn" onClick={handleCloudRestore} disabled={busy}>
            Restore
          </button>
        </div>
      </div>

      {message && (
        <div className={`toast${message.type === 'error' ? ' error' : ''}`} style={{ position: 'static', transform: 'none' }}>
          {message.text}
        </div>
      )}
    </div>
  )
}

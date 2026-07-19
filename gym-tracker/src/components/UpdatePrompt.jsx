import { useRegisterSW } from 'virtual:pwa-register/react'

// Controlled update flow: when a new version is deployed, the service worker
// downloads it in the background and we show a banner instead of silently
// swapping (or forcing a hard refresh like the old cache behavior).
export default function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  return (
    <div className="update-bar">
      {needRefresh ? (
        <>
          <span>New version available</span>
          <button className="update-go" onClick={() => updateServiceWorker(true)}>
            Refresh
          </button>
          <button className="update-x" onClick={() => setNeedRefresh(false)} aria-label="Dismiss">
            ✕
          </button>
        </>
      ) : (
        <>
          <span>Ready to work offline</span>
          <button className="update-x" onClick={() => setOfflineReady(false)} aria-label="Dismiss">
            ✕
          </button>
        </>
      )}
    </div>
  )
}

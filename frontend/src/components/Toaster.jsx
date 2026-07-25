import { useEffect, useState } from "react";

let _nextId = 1;

/** Global toast stack. Listens for "app-toast" CustomEvents (see api.js toast()). */
export default function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    function onToast(e) {
      const { message, kind = "error" } = e.detail || {};
      if (!message) return;
      const id = _nextId++;
      setToasts((t) => [...t.slice(-3), { id, message, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
    }
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  if (!toasts.length) return null;

  const kindCls = {
    error: "border-red-500/40 bg-red-950/90 text-red-200",
    success: "border-green-500/40 bg-green-950/90 text-green-200",
    info: "border-zinc-600 bg-zinc-900/95 text-zinc-200",
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg border shadow-lg text-sm backdrop-blur flex items-start gap-2 ${kindCls[t.kind] || kindCls.info}`}
        >
          <span className="flex-1 break-words">{t.message}</span>
          <button
            onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            className="opacity-60 hover:opacity-100 leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

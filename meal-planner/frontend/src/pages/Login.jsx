import { useState } from "react";
import { useAuth } from "../AuthContext";

function LogoMark() {
  return (
    <svg width="48" height="48" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="22" r="14" fill="#16a34a" opacity="0.15" />
      <circle cx="20" cy="22" r="14" stroke="#16a34a" strokeWidth="1.5" fill="none" />
      <path d="M14 17 Q14 11 20 11 Q26 11 26 17" stroke="#16a34a" strokeWidth="1.8" fill="#16a34a" fillOpacity="0.2" strokeLinejoin="round" />
      <rect x="13" y="16" width="14" height="3" rx="1" fill="#16a34a" />
      <line x1="17" y1="20" x2="17" y2="29" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15.5" y1="20" x2="15.5" y2="24" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="18.5" y1="20" x2="18.5" y2="24" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="23" y1="20" x2="23" y2="29" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M23 20 L25 22 L23 24" stroke="#16a34a" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [tab, setTab] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (tab === "register" && password !== password2) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed");
      login(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-2 mb-1">
            <LogoMark />
            <span className="text-2xl font-bold text-stone-900 dark:text-white tracking-tight">
              Sous Chef
            </span>
          </div>
          <p className="text-stone-400 text-sm">Your household meal planner</p>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-800 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-stone-200">
            {["login", "register"].map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); }}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  tab === t
                    ? "text-green-700 dark:text-green-400 border-b-2 border-green-600 bg-green-50/50 dark:bg-green-900/20"
                    : "text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                }`}
              >
                {t === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300 block mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete={tab === "login" ? "username" : "new-password"}
                placeholder="e.g. wetbanks"
                className="w-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300 block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                placeholder={tab === "register" ? "At least 4 characters" : ""}
                className="w-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {tab === "register" && (
              <div>
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300 block mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            )}

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              {loading
                ? tab === "login" ? "Signing in…" : "Creating account…"
                : tab === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-stone-400 mt-6">
          Each household has their own private space.
        </p>
      </div>
    </div>
  );
}

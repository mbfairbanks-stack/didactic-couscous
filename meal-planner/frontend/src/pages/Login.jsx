import { useState } from "react";
import { useAuth } from "../AuthContext";

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
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-3xl">🍴</span>
            <span className="text-2xl font-bold text-stone-900">
              Wetbanks <span className="text-green-600">Sous Chef</span>
            </span>
          </div>
          <p className="text-stone-500 text-sm">Your household meal planner</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-stone-200">
            {["login", "register"].map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); }}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  tab === t
                    ? "text-green-700 border-b-2 border-green-600 bg-green-50/50"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {t === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-stone-700 block mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete={tab === "login" ? "username" : "new-password"}
                placeholder="e.g. wetbanks"
                className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-stone-700 block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                placeholder={tab === "register" ? "At least 4 characters" : ""}
                className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {tab === "register" && (
              <div>
                <label className="text-sm font-medium text-stone-700 block mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
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

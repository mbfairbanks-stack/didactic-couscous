import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState("signin"); // "signin" | "signup" | "demo"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = (t) => {
    setTab(t);
    setError("");
    setUsername("");
    setPassword("");
    setConfirm("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "demo") {
        await login("demo", "demo");
      } else if (tab === "signin") {
        await login(username.trim(), password);
      } else {
        // signup
        if (password !== confirm) {
          setError("Passwords don't match.");
          setLoading(false);
          return;
        }
        await register(username.trim(), password);
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="w-14 h-14 bg-yellow-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-black text-2xl font-bold">$</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">BudgetBot</h1>
          <p className="text-zinc-500 text-sm mt-1">Track your spending, own your money.</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-zinc-900 border border-zinc-700 rounded-xl p-1 gap-1">
          {[
            { key: "signin", label: "Sign In" },
            { key: "signup", label: "Sign Up" },
            { key: "demo", label: "Try Demo" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => reset(key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key
                  ? "bg-yellow-400 text-black"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4">
          {tab === "demo" ? (
            <div className="space-y-4">
              <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-4 text-sm text-yellow-200">
                <p className="font-medium mb-1">Demo Mode</p>
                <p className="text-yellow-300/80">Explore with sample data. Nothing you do will be saved permanently.</p>
              </div>
              <button
                onClick={submit}
                disabled={loading}
                className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-semibold rounded-lg py-3 transition-colors"
              >
                {loading ? "Loading…" : "Explore Demo →"}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={tab === "signup" ? "Choose a username" : "Your username"}
                  autoFocus
                  autoComplete="username"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-yellow-400 transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === "signup" ? "At least 6 characters" : "Your password"}
                  autoComplete={tab === "signup" ? "new-password" : "current-password"}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-yellow-400 transition-colors text-sm"
                />
              </div>
              {tab === "signup" && (
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-yellow-400 transition-colors text-sm"
                  />
                </div>
              )}
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading || !username || !password || (tab === "signup" && !confirm)}
                className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold rounded-lg py-3 transition-colors"
              >
                {loading
                  ? tab === "signup" ? "Creating account…" : "Signing in…"
                  : tab === "signup" ? "Create Account →" : "Sign In →"}
              </button>
              {tab === "signin" && (
                <p className="text-center text-xs text-zinc-600">
                  No account?{" "}
                  <button type="button" onClick={() => reset("signup")} className="text-yellow-400 hover:text-yellow-300">
                    Sign up free
                  </button>
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

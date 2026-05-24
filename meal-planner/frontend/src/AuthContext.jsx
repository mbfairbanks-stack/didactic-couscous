import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("sc_token"));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sc_user") || "null"); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  // Verify token is still valid on mount
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error("invalid");
        return r.json();
      })
      .then((u) => { setUser(u); localStorage.setItem("sc_user", JSON.stringify(u)); })
      .catch(() => { logout(); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((data) => {
    localStorage.setItem("sc_token", data.access_token);
    const u = { username: data.username, onboarding_done: data.onboarding_done };
    localStorage.setItem("sc_user", JSON.stringify(u));
    setToken(data.access_token);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("sc_token");
    localStorage.removeItem("sc_user");
    setToken(null);
    setUser(null);
  }, []);

  const markOnboardingDone = useCallback(() => {
    setUser((prev) => {
      const next = { ...prev, onboarding_done: true };
      localStorage.setItem("sc_user", JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout, markOnboardingDone }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { checkAuth, loginApi } from "../api";

const TOKEN_KEY = "budget_token";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [demo, setDemo] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuth()
      .then(({ ok, demo: isDemo }) => {
        setIsAuthenticated(!!ok);
        setDemo(!!isDemo);
      })
      .catch(() => setIsAuthenticated(true))
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (password) => {
    const { token } = await loginApi(password);
    localStorage.setItem(TOKEN_KEY, token);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, demo, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

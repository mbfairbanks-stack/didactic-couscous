import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { checkAuth, loginApi, registerApi } from "../api";

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

  const login = useCallback(async (username, password) => {
    const { token, demo: isDemo } = await loginApi(username, password);
    localStorage.setItem(TOKEN_KEY, token);
    setIsAuthenticated(true);
    setDemo(!!isDemo);
  }, []);

  const register = useCallback(async (username, password) => {
    const { token } = await registerApi(username, password);
    localStorage.setItem(TOKEN_KEY, token);
    setIsAuthenticated(true);
    setDemo(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setIsAuthenticated(false);
    setDemo(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, demo, checking, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Nav from "./components/Nav";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import BudgetPlanner from "./pages/BudgetPlanner";
import Charts from "./pages/Charts";
import Import from "./pages/Import";
import Insights from "./pages/Insights";
import Income from "./pages/Income";
import Debts from "./pages/Debts";
import CategoryAudit from "./pages/CategoryAudit";
import NetWorth from "./pages/NetWorth";
import Savings from "./pages/Savings";
import Settings from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import Login from "./pages/Login";
import { SettingsProvider } from "./contexts/SettingsContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { getOnboardingStatus } from "./api";

function OnboardingGuard({ children }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getOnboardingStatus().then(setStatus).catch(() => setStatus({ needs_onboarding: false }));
  }, []);

  if (status === null) return null;
  if (status.needs_onboarding) return <Navigate to="/onboarding" replace />;
  return children;
}

function AuthGuard({ children }) {
  const { isAuthenticated, checking } = useAuth();
  if (checking) return null;
  if (!isAuthenticated) return <Login />;
  return children;
}

function DemoBanner() {
  const { demo } = useAuth();
  if (!demo) return null;
  return (
    <div className="bg-yellow-400 text-black text-xs font-semibold text-center py-1.5 tracking-wide">
      DEMO MODE — data is fake and resets on restart
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGuard>
          <SettingsProvider>
            <DemoBanner />
            <Routes>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="*" element={
                <OnboardingGuard>
                  <div className="min-h-screen flex flex-col">
                    <Nav />
                    <main className="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full pt-6">
                      <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/transactions" element={<Transactions />} />
                        <Route path="/budget" element={<BudgetPlanner />} />
                        <Route path="/charts" element={<Charts />} />
                        <Route path="/import" element={<Import />} />
                        <Route path="/insights" element={<Insights />} />
                        <Route path="/income" element={<Income />} />
                        <Route path="/debts" element={<Debts />} />
                        <Route path="/category-audit" element={<CategoryAudit />} />
                        <Route path="/net-worth" element={<NetWorth />} />
                        <Route path="/savings" element={<Savings />} />
                        <Route path="/settings" element={<Settings />} />
                      </Routes>
                    </main>
                  </div>
                </OnboardingGuard>
              } />
            </Routes>
          </SettingsProvider>
        </AuthGuard>
      </AuthProvider>
    </BrowserRouter>
  );
}

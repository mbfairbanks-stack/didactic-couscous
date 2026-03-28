import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
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
import Settings from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import { SettingsProvider } from "./contexts/SettingsContext";
import { getOnboardingStatus } from "./api";

function OnboardingGuard({ children }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getOnboardingStatus().then(setStatus).catch(() => setStatus({ needs_onboarding: false }));
  }, []);

  if (status === null) return null; // loading
  if (status.needs_onboarding) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="*" element={
            <OnboardingGuard>
              <div className="min-h-screen flex flex-col">
                <Nav />
                <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
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
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </main>
              </div>
            </OnboardingGuard>
          } />
        </Routes>
      </SettingsProvider>
    </BrowserRouter>
  );
}

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import Nav from "./components/Nav";
import Toaster from "./components/Toaster";
import Login from "./pages/Login";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Transactions = lazy(() => import("./pages/Transactions"));
const BudgetPlanner = lazy(() => import("./pages/BudgetPlanner"));
const Charts = lazy(() => import("./pages/Charts"));
const Import = lazy(() => import("./pages/Import"));
const Insights = lazy(() => import("./pages/Insights"));
const Income = lazy(() => import("./pages/Income"));
const Debts = lazy(() => import("./pages/Debts"));
const CategoryAudit = lazy(() => import("./pages/CategoryAudit"));
const NetWorth = lazy(() => import("./pages/NetWorth"));
const Settings = lazy(() => import("./pages/Settings"));
const Retirement = lazy(() => import("./pages/Retirement"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
import { SettingsProvider } from "./contexts/SettingsContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { getOnboardingStatus } from "./api";
import ErrorBoundary from "./components/ErrorBoundary";

function OnboardingGuard({ children }) {
  const { demo } = useAuth();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (demo) { setStatus({ needs_onboarding: false }); return; }
    getOnboardingStatus().then(setStatus).catch(() => setStatus({ needs_onboarding: false }));
  }, [demo]);

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
      DEMO MODE — sample data only, all changes are disabled.{" "}
      <a
        href="https://github.com/mbfairbanks-stack/didactic-couscous"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-yellow-900"
      >
        Host your own →
      </a>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <AuthGuard>
          <SettingsProvider>
            <Toaster />
            <DemoBanner />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm">Loading…</div>}>
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
                        <Route path="/retirement" element={<Retirement />} />
                        <Route path="/settings" element={<Settings />} />
                      </Routes>
                    </main>
                  </div>
                </OnboardingGuard>
              } />
            </Routes>
            </Suspense>
          </SettingsProvider>
        </AuthGuard>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

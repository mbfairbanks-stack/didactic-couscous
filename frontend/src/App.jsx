import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Nav from "./components/Nav";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import BudgetPlanner from "./pages/BudgetPlanner";
import Charts from "./pages/Charts";
import Import from "./pages/Import";
import Insights from "./pages/Insights";
import Game from "./game/Game";

function AppInner() {
  const location = useLocation();
  const isGame = location.pathname === "/game";
  return (
    <div className="min-h-screen flex flex-col">
      {!isGame && <Nav />}
      <main className={isGame ? "" : "flex-1 p-6 max-w-7xl mx-auto w-full"}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budget" element={<BudgetPlanner />} />
          <Route path="/charts" element={<Charts />} />
          <Route path="/import" element={<Import />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/game" element={<Game />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

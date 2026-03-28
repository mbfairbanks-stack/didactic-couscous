import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

export default function App() {
  return (
    <BrowserRouter>
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
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

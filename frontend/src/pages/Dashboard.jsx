import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import StatCard from "../components/StatCard";
import { getMonthlySummary, getTotals, getCategorySummary, getYears } from "../api";

const MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (n) =>
  n == null ? "—" : "$" + Number(n).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

export default function Dashboard() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [years, setYears] = useState([currentYear]);
  const [monthly, setMonthly] = useState([]);
  const [totals, setTotals] = useState({});
  const [monthTotals, setMonthTotals] = useState({});
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
  }, []);

  useEffect(() => {
    getMonthlySummary(year).then(setMonthly);
    getTotals(year).then(setTotals);
  }, [year]);

  useEffect(() => {
    getTotals(year, month).then(setMonthTotals);
    getCategorySummary(year, month).then(setCategories);
  }, [year, month]);

  const chartData = monthly.map((m) => ({
    name: MONTH_LABELS[m.month],
    Income: m.income,
    Expenses: m.expenses,
  }));

  const topCategories = categories.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-3">
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTH_LABELS.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Year stats */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{year} Year to Date</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Income" value={fmt(totals.total_income)} color="green" />
          <StatCard label="Total Expenses" value={fmt(totals.total_expenses)} color="red" />
          <StatCard label="Balance" value={fmt(totals.balance)} color={totals.balance >= 0 ? "blue" : "red"} />
          <StatCard label="Savings Rate" value={`${totals.savings_rate ?? 0}%`} color="purple" />
        </div>
      </div>

      {/* Month stats */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {MONTH_LABELS[month]} {year}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Income" value={fmt(monthTotals.total_income)} color="green" />
          <StatCard label="Expenses" value={fmt(monthTotals.total_expenses)} color="red" />
          <StatCard label="Balance" value={fmt(monthTotals.balance)} color={monthTotals.balance >= 0 ? "blue" : "red"} />
          <StatCard label="Savings Rate" value={`${monthTotals.savings_rate ?? 0}%`} color="purple" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly income vs expenses */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold mb-4">{year} Monthly Income vs Expenses</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
              <Bar dataKey="Income" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top spending categories this month */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold mb-4">
            Top Spending — {MONTH_LABELS[month]} {year}
          </h2>
          {topCategories.length === 0 ? (
            <p className="text-gray-400 text-sm mt-8 text-center">No data for this period</p>
          ) : (
            <div className="space-y-2">
              {topCategories.map((c) => {
                const maxAmt = topCategories[0]?.total || 1;
                const pct = Math.round((c.total / maxAmt) * 100);
                return (
                  <div key={c.category}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="truncate max-w-[180px]">{c.category}</span>
                      <span className="font-medium">{fmt(c.total)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import StatCard from "../components/StatCard";
import { getMonthlySummary, getTotals, getCategorySummary, getYears, getProjections } from "../api";

const MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (n) =>
  n == null ? "—" : "$" + Number(n).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-lg">
      <p className="font-medium text-zinc-300 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [years, setYears] = useState([currentYear]);
  const [monthly, setMonthly] = useState([]);
  const [totals, setTotals] = useState({});
  const [monthTotals, setMonthTotals] = useState({});
  const [categories, setCategories] = useState([]);
  const [projections, setProjections] = useState(null);

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
  }, []);

  useEffect(() => {
    getMonthlySummary(year).then(setMonthly);
    getTotals(year, null, month).then(setTotals);
  }, [year, month]);

  useEffect(() => {
    getTotals(year, month).then(setMonthTotals);
    getCategorySummary(year, month).then(setCategories);
    getProjections(year, month).then(setProjections);
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <div className="flex gap-3 items-center">
          <a href="/income" className="bg-yellow-400 text-black px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-yellow-300">
            + Log Payday
          </a>
          <select
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100"
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
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">{year} Year to Date (Jan – {MONTH_LABELS[month]})</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Income" value={fmt(totals.total_income)} color="green" />
          <StatCard label="Total Expenses" value={fmt(totals.total_expenses)} color="red" />
          <StatCard label="Balance" value={fmt(totals.balance)} color={totals.balance >= 0 ? "yellow" : "red"} />
          <StatCard label="Savings Rate" value={`${totals.savings_rate ?? 0}%`} color="purple" />
        </div>
      </div>

      {/* Month stats */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          {MONTH_LABELS[month]} {year}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Income" value={fmt(monthTotals.total_income)} color="green" />
          <StatCard label="Expenses" value={fmt(monthTotals.total_expenses)} color="red" />
          <StatCard label="Balance" value={fmt(monthTotals.balance)} color={monthTotals.balance >= 0 ? "yellow" : "red"} />
          <StatCard label="Savings Rate" value={`${monthTotals.savings_rate ?? 0}%`} color="purple" />
        </div>
      </div>

      {/* Projections */}
      {projections && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Projections — based on historical averages
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Avg Monthly Income" value={fmt(projections.avg_monthly_income)} color="green" />
            <StatCard label="Avg Monthly Expenses" value={fmt(projections.avg_monthly_expenses)} color="red" />
            <StatCard label="Fixed Monthly Costs" value={fmt(projections.fixed_monthly_total)} color="yellow" />
            <StatCard label="Projected Year Balance" value={fmt(projections.projected_year_balance)}
              color={projections.projected_year_balance >= 0 ? "purple" : "red"} />
          </div>

          {/* Fixed expense breakdown */}
          {projections.fixed_categories?.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Fixed Monthly Expenses</h3>
                <span className="text-xs text-zinc-600">avg per month · from budget summary</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-2">
                {projections.fixed_categories.map((c) => (
                  <div key={c.category} className="flex justify-between text-sm">
                    <span className="text-zinc-400 truncate mr-2">{c.category}</span>
                    <span className="text-yellow-400 font-medium whitespace-nowrap">{fmt(c.avg_monthly)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-zinc-800 mt-3 pt-3 flex justify-between text-sm font-semibold">
                <span className="text-zinc-300">Total Fixed</span>
                <span className="text-yellow-400">{fmt(projections.fixed_monthly_total)}</span>
              </div>
            </div>
          )}

          {/* Year-end projection bar */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">Year-End Projection</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Projected Income</p>
                <p className="text-lg font-bold text-green-400">{fmt(projections.projected_year_income)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Projected Expenses</p>
                <p className="text-lg font-bold text-red-400">{fmt(projections.projected_year_expenses)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Projected Savings</p>
                <p className={`text-lg font-bold ${projections.projected_year_balance >= 0 ? "text-yellow-400" : "text-red-400"}`}>
                  {fmt(projections.projected_year_balance)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">{year} Monthly Income vs Expenses</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#71717a" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
              <Bar dataKey="Income" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
            Top Spending — {MONTH_LABELS[month]} {year}
          </h2>
          {topCategories.length === 0 ? (
            <p className="text-zinc-600 text-sm mt-8 text-center">No data for this period</p>
          ) : (
            <div className="space-y-2.5">
              {topCategories.map((c) => {
                const maxAmt = topCategories[0]?.total || 1;
                const pct = Math.round((c.total / maxAmt) * 100);
                return (
                  <div key={c.category}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="truncate max-w-[180px] text-zinc-300">{c.category}</span>
                      <span className="font-medium text-yellow-400">{fmt(c.total)}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full"
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

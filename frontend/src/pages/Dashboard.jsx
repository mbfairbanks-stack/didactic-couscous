import { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import StatCard from "../components/StatCard";
import { getMonthlySummary, getTotals, getCategorySummary, getYears, getProjections, getBudgetTargets } from "../api";
import { getCategoryGroup } from "../constants";
import { MONTH_LABELS, currentYear, currentMonth, fmt } from "../utils";

// ── Tooltip shared by all charts ─────────────────────────────────────────────
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

// ── Month-over-month comparison card ────────────────────────────────────────
function MoMCard({ current, last }) {
  function delta(cur, prev) {
    if (!prev || prev === 0) return null;
    return Math.round(((cur - prev) / Math.abs(prev)) * 100);
  }

  function Badge({ pct, invert }) {
    if (pct === null) return <span className="text-zinc-600 text-xs">—</span>;
    // For expenses: going up is bad (red), going down is good (green) → invert=true
    const positive = invert ? pct < 0 : pct >= 0;
    const sign = pct >= 0 ? "+" : "";
    return (
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${positive ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
        {sign}{pct}% vs last month
      </span>
    );
  }

  const curIncome = current?.total_income ?? 0;
  const curExpenses = current?.total_expenses ?? 0;
  const curBalance = current?.balance ?? 0;
  const curSavings = current?.savings_rate ?? 0;

  const lastIncome = last?.total_income ?? 0;
  const lastExpenses = last?.total_expenses ?? 0;
  const lastBalance = last?.balance ?? 0;
  const lastSavings = last?.savings_rate ?? 0;

  const metrics = [
    { label: "Income", value: fmt(curIncome), pct: delta(curIncome, lastIncome), invert: false },
    { label: "Expenses", value: fmt(curExpenses), pct: delta(curExpenses, lastExpenses), invert: true },
    { label: "Balance", value: fmt(curBalance), pct: delta(curBalance, lastBalance), invert: false },
    { label: "Savings Rate", value: `${curSavings}%`, pct: delta(curSavings, lastSavings), invert: false },
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">vs Last Month</h3>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(({ label, value, pct, invert }) => (
          <div key={label} className="space-y-1">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-sm font-bold text-zinc-100">{value}</p>
            <Badge pct={pct} invert={invert} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Savings Goal bar ─────────────────────────────────────────────────────────
function SavingsGoalBar({ savingsRate, savingsGoal, setSavingsGoal }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(savingsGoal));
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitEdit() {
    const val = Math.max(0, Math.min(100, Number(draft) || 0));
    setSavingsGoal(val);
    localStorage.setItem("savingsGoal", val);
    setDraft(String(val));
    setEditing(false);
  }

  function handleKey(e) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") { setDraft(String(savingsGoal)); setEditing(false); }
  }

  const rate = savingsRate ?? 0;
  const goal = savingsGoal ?? 20;
  const pct = Math.min(Math.round((rate / goal) * 100), 100);
  const onTrack = rate >= goal;
  const diff = Math.abs(Math.round((goal - rate) * 10) / 10);

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Savings Goal</span>
          {editing ? (
            <span className="flex items-center gap-1">
              <input
                ref={inputRef}
                type="number"
                min={0}
                max={100}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleKey}
                className="w-14 bg-zinc-800 border border-yellow-400/60 rounded px-1.5 py-0.5 text-xs text-zinc-100 text-center focus:outline-none focus:border-yellow-400"
              />
              <span className="text-xs text-zinc-400">%</span>
            </span>
          ) : (
            <button
              onClick={() => { setDraft(String(savingsGoal)); setEditing(true); }}
              className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
              title="Edit savings goal"
            >
              <span className="font-semibold">{goal}%</span>
              {/* Pencil icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
          )}
        </div>
        <span className={`text-xs font-medium ${onTrack ? "text-green-400" : "text-red-400"}`}>
          {onTrack ? "On track" : `${diff}% below target`}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${onTrack ? "bg-green-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-zinc-600 mt-1">
        <span>Current: {rate}%</span>
        <span>Goal: {goal}%</span>
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [years, setYears] = useState([currentYear]);
  const [monthly, setMonthly] = useState([]);
  const [totals, setTotals] = useState({});
  const [monthTotals, setMonthTotals] = useState({});
  const [lastMonthTotals, setLastMonthTotals] = useState({});
  const [categories, setCategories] = useState([]);
  const [projections, setProjections] = useState(null);
  const [budgetTargets, setBudgetTargets] = useState([]);
  const [error, setError] = useState("");
  const [savingsGoal, setSavingsGoal] = useState(() => {
    const stored = localStorage.getItem("savingsGoal");
    return stored !== null ? Number(stored) : 20;
  });

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear])).catch(() => {});
  }, []);

  const loadDashboardData = () => {
    setError("");
    Promise.all([
      getMonthlySummary(year).then(setMonthly),
      getTotals(year, null, month).then(setTotals),
    ]).catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => {
    // Derive last month / last year
    const lastMonth = month === 1 ? 12 : month - 1;
    const lastYear = month === 1 ? year - 1 : year;

    Promise.all([
      getTotals(year, month).then(setMonthTotals),
      getCategorySummary(year, month).then(setCategories),
      getProjections(year, month).then(setProjections),
      getBudgetTargets({ year, month }).then(setBudgetTargets).catch(() => setBudgetTargets([])),
      getTotals(lastYear, lastMonth).then(setLastMonthTotals).catch(() => setLastMonthTotals({})),
    ]).catch((e) => setError(e.message));
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

      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl px-4 py-3 text-sm text-red-400">
          Failed to load data: {error}
        </div>
      )}

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

      {/* vs Last Month + Savings Goal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MoMCard current={monthTotals} last={lastMonthTotals} />
        <SavingsGoalBar
          savingsRate={monthTotals.savings_rate}
          savingsGoal={savingsGoal}
          setSavingsGoal={setSavingsGoal}
        />
      </div>

      {/* Needs / Wants breakdown */}
      {categories.length > 0 && (() => {
        const budgetMap = Object.fromEntries(budgetTargets.map((t) => [t.category, t.amount]));
        const needs = categories.filter((c) => getCategoryGroup(c.category) === "Needs");
        const wants = categories.filter((c) => getCategoryGroup(c.category) === "Wants");
        const needsTotal = needs.reduce((s, c) => s + c.total, 0);
        const wantsTotal = wants.reduce((s, c) => s + c.total, 0);
        const grandTotal = needsTotal + wantsTotal || 1;
        const needsPct = Math.round((needsTotal / grandTotal) * 100);
        const wantsPct = 100 - needsPct;
        return (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Needs vs Wants — {MONTH_LABELS[month]} {year}
            </h2>

            {/* Split bar */}
            <div className="space-y-1">
              <div className="flex h-4 rounded-full overflow-hidden">
                <div className="bg-yellow-400 transition-all" style={{ width: `${needsPct}%` }} />
                <div className="bg-zinc-600 transition-all" style={{ width: `${wantsPct}%` }} />
              </div>
              <div className="flex justify-between text-xs text-zinc-500">
                <span className="text-yellow-400 font-medium">Needs {needsPct}% — {fmt(needsTotal)}</span>
                <span className="text-zinc-400 font-medium">{fmt(wantsTotal)} — {wantsPct}% Wants</span>
              </div>
            </div>

            {/* Two column breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-1">
              {[{ label: "Needs", rows: needs, color: "text-yellow-400" },
                { label: "Wants", rows: wants, color: "text-zinc-400" }].map(({ label, rows, color }) => (
                <div key={label}>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${color}`}>{label}</p>
                  <div className="space-y-1.5">
                    {rows.sort((a, b) => b.total - a.total).map((c) => {
                      const budget = budgetMap[c.category];
                      const pct = budget
                        ? Math.min(Math.round((c.total / budget) * 100), 100)
                        : Math.round((c.total / (label === "Needs" ? needsTotal : wantsTotal)) * 100);
                      const over = budget && c.total > budget;
                      return (
                        <div key={c.category}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-zinc-400 truncate max-w-[140px]">{c.category}</span>
                            <span className={`font-medium ${over ? "text-red-400" : "text-zinc-300"}`}>
                              {fmt(c.total)}{budget ? <span className="text-zinc-600"> / {fmt(budget)}</span> : null}
                            </span>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${over ? "bg-red-500" : label === "Needs" ? "bg-yellow-400/70" : "bg-zinc-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
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

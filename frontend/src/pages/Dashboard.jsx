import { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import StatCard from "../components/StatCard";
import { getMonthlySummary, getTotals, getCategorySummary, getYears, getProjections, getBudgetTargets, getCategoryDefinitions, getDebts, getTransactions, createTransaction, getCategories, getMissingRecurring, getMultiCategoryTrend, getRetirementSummary } from "../api";
import { NavLink } from "react-router-dom";
import { project, findRetirementYear } from "../lib/retirementEngine";
import { getCategoryGroup, updateCategoryGroups } from "../constants";
import { MONTH_LABELS, currentYear, currentMonth, fmt } from "../utils";

// ── Tooltip shared by all charts ─────────────────────────────────────────────
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs shadow-lg">
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
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

// ── Year-over-Year spending comparison card ──────────────────────────────────
function YoYCard({ year, month }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!year || !month) return;
    const prevYear = year - 1;
    Promise.all([
      getMonthlySummary(year, month).catch(() => null),
      getMonthlySummary(prevYear, month).catch(() => null),
    ]).then(([curr, prev]) => {
      setData({ curr, prev });
    });
  }, [year, month]);

  if (!data) return null;

  const currSpend = data.curr?.total_spending ?? 0;
  const prevSpend = data.prev?.total_spending ?? 0;
  const diff = currSpend - prevSpend;
  const pct = prevSpend > 0 ? ((diff / prevSpend) * 100).toFixed(1) : null;
  const isUp = diff > 0;
  const fmt = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

  const monthName = new Date(year, month - 1).toLocaleString("en-CA", { month: "long" });

  return (
    <div className="bg-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-400 uppercase font-semibold mb-1">vs Same Month Last Year</p>
      <p className="text-2xl font-bold text-zinc-100">{fmt(currSpend)}</p>
      <p className="text-sm text-zinc-400 mt-1">{monthName} {year}</p>
      <div className={`mt-2 text-sm font-medium ${isUp ? "text-red-400" : "text-green-400"}`}>
        {isUp ? "▲" : "▼"} {fmt(Math.abs(diff))}
        {pct && <span className="text-zinc-400 ml-1">({pct}% vs {monthName} {year - 1})</span>}
      </div>
      <p className="text-xs text-zinc-500 mt-1">Last year: {fmt(prevSpend)}</p>
    </div>
  );
}

// ── 12-Month Net Worth Forecast ──────────────────────────────────────────────
function DebtPaymentsWidget({ year, month }) {
  const [debts, setDebts] = useState([]);
  const [paidMap, setPaidMap] = useState({});  // { debtId: amountPaidThisMonth }

  useEffect(() => {
    if (!year || !month) return;
    Promise.all([
      getDebts().catch(() => []),
      getTransactions({ year, month, limit: 2000 }).catch(() => []),
    ]).then(([ds, txns]) => {
      setDebts(ds.filter((d) => d.current_balance > 0 || (d.computed_balance ?? 0) > 0));
      const map = {};
      for (const t of txns) {
        if (t.linked_debt_id && t.debt_direction !== "charge") {
          map[t.linked_debt_id] = (map[t.linked_debt_id] || 0) + t.amount;
        }
      }
      setPaidMap(map);
    });
  }, [year, month]);

  if (debts.length === 0) return null;

  const totalPlanned = debts.reduce((s, d) => s + d.monthly_payment + d.monthly_extra, 0);
  const totalPaid = Object.values(paidMap).reduce((s, v) => s + v, 0);
  const monthName = new Date(year, month - 1).toLocaleString("en-CA", { month: "long" });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Debt Payments — {monthName}</p>
        <div className="text-right">
          <span className="text-xs text-zinc-500">Paid </span>
          <span className="text-sm font-mono font-semibold text-yellow-400">{fmt(totalPaid)}</span>
          <span className="text-xs text-zinc-500"> / {fmt(totalPlanned)}</span>
        </div>
      </div>
      <div className="space-y-3">
        {debts.map((d) => {
          const planned = d.monthly_payment + d.monthly_extra;
          const paid = paidMap[d.id] || 0;
          const balance = d.computed_balance ?? d.current_balance;
          const pct = planned > 0 ? Math.min((paid / planned) * 100, 100) : 0;
          const overpaid = paid > planned && planned > 0;
          const linked = d.id in paidMap;
          return (
            <div key={d.id}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div>
                  <span className="text-zinc-100 font-medium">{d.name}</span>
                  <span className="text-zinc-500 text-xs ml-2">{fmt(balance)} remaining</span>
                </div>
                <div className="text-right space-y-0.5">
                  {linked && (
                    <div className={`font-mono text-xs ${overpaid ? "text-green-400" : "text-zinc-300"}`}>
                      {fmt(paid)} paid
                      {planned > 0 && <span className="text-zinc-500"> / {fmt(planned)}</span>}
                    </div>
                  )}
                  {planned > 0 && (
                    <div className="text-zinc-500 text-xs">
                      {fmt(d.monthly_payment)} min{d.monthly_extra > 0 ? ` + ${fmt(d.monthly_extra)} extra` : ""}
                    </div>
                  )}
                </div>
              </div>
              {planned > 0 && (
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${overpaid ? "bg-green-400" : pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-yellow-400" : "bg-zinc-700"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {totalPaid === 0 && (
        <p className="text-xs text-zinc-600 mt-3 text-center">Tag transactions as debt payments to track progress here.</p>
      )}
    </div>
  );
}


// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#facc15" }) {
  if (!data || data.length < 2) return null;
  const values = data.map(d => d.total || 0);
  const max = Math.max(...values) || 1;
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 48, h = 20;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="inline-block align-middle opacity-60">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Retirement Snapshot Tile ─────────────────────────────────────────────────
function RetirementTile() {
  const [data, setData] = useState(null);

  useEffect(() => {
    getRetirementSummary().then(setData).catch(() => {});
  }, []);

  if (!data) return null;
  const p = data.profile;
  if (!p) {
    return (
      <NavLink to="/retirement" className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-yellow-400/30 transition-colors">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Retirement</p>
        <p className="text-sm text-zinc-400 mt-1">Set up your retirement profile →</p>
      </NavLink>
    );
  }

  const projPoints = project(p, data.investable_assets, data.monthly_surplus, [], currentYear);
  const retireYear = findRetirementYear(projPoints);
  const lastPt = projPoints[projPoints.length - 1];
  const targetPct = lastPt?.target > 0
    ? Math.min(Math.round((data.investable_assets / lastPt.target) * 100), 100)
    : 0;

  return (
    <NavLink to="/retirement" className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-yellow-400/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Retirement</p>
        <span className="text-xs text-zinc-600">age {p.current_age} → {p.target_retirement_age}</span>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-3">
        <div>
          <p className="text-xs text-zinc-500">Years Left</p>
          <p className="text-lg font-bold text-yellow-400">{Math.max(p.years_to_retirement, 0)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Investable</p>
          <p className="text-lg font-bold text-zinc-200">{fmt(data.investable_assets)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Target</p>
          <p className="text-lg font-bold text-blue-400">{fmt(p.required_portfolio)}</p>
        </div>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1">
        <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${targetPct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-zinc-600">
        <span>{targetPct}% to target</span>
        {retireYear && <span className="text-green-400">on track for {retireYear}</span>}
      </div>
    </NavLink>
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
  const [statView, setStatView] = useState("month");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickForm, setQuickForm] = useState({ date: new Date().toISOString().split("T")[0], merchant: "", amount: "", category: "", notes: "" });
  const [quickCategories, setQuickCategories] = useState([]);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [quickSuccess, setQuickSuccess] = useState("");
  const [missingRecurring, setMissingRecurring] = useState([]);
  const [categoryTrends, setCategoryTrends] = useState({});  // { categoryName: [{ month, total }] }

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear])).catch(() => {});
    getCategoryDefinitions().then(updateCategoryGroups).catch(() => {});
    getCategories().then(setQuickCategories).catch(() => {});
    getMissingRecurring().then(setMissingRecurring).catch(() => {});
  }, []);

  useEffect(() => {
    if (!categories.length) return;
    const names = categories.slice(0, 12).map(c => c.category);
    if (!names.length) return;
    getMultiCategoryTrend(names)
      .then((data) => {
        // data is array of { category, month, year, total } or similar
        // Group by category
        const grouped = {};
        for (const row of data) {
          if (!grouped[row.category]) grouped[row.category] = [];
          grouped[row.category].push(row);
        }
        setCategoryTrends(grouped);
      })
      .catch(() => {});
  }, [categories]);

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
          <button
            onClick={() => window.print()}
            className="no-print border border-zinc-700 text-zinc-400 px-3 py-1.5 rounded-lg text-sm hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            title="Print or save as PDF"
          >
            Print / PDF
          </button>
          <select
            className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-100"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-100"
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

      {/* Missing recurring transactions alert */}
      {missingRecurring.length > 0 && (
        <div className="bg-zinc-900 border border-yellow-400/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Expected This Month</p>
            <span className="text-xs text-zinc-500">{missingRecurring.length} recurring {missingRecurring.length === 1 ? "transaction" : "transactions"} not yet seen</span>
          </div>
          <div className="space-y-1">
            {missingRecurring.slice(0, 5).map((r) => (
              <div key={r.merchant} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">{r.merchant}</span>
                <span className="text-zinc-500 font-mono text-xs">{fmt(r.avg_amount)} avg</span>
              </div>
            ))}
            {missingRecurring.length > 5 && (
              <p className="text-xs text-zinc-600">+{missingRecurring.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2 before:content-[''] before:block before:w-1 before:h-3 before:bg-yellow-400/60 before:rounded-full">
            {statView === "month" ? `${MONTH_LABELS[month]} ${year}` : `${year} Year to Date`}
          </h2>
          <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
            <button
              onClick={() => setStatView("month")}
              className={`px-3 py-1 transition-colors ${statView === "month" ? "bg-yellow-400 text-zinc-900 font-semibold" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              This Month
            </button>
            <button
              onClick={() => setStatView("ytd")}
              className={`px-3 py-1 transition-colors ${statView === "ytd" ? "bg-yellow-400 text-zinc-900 font-semibold" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Year to Date
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {statView === "month" ? (
            <>
              <StatCard label="Income" value={fmt(monthTotals.total_income)} color="green" />
              <StatCard label="Expenses" value={fmt(monthTotals.total_expenses)} color="red" />
              <StatCard label="Balance" value={fmt(monthTotals.balance)} color={monthTotals.balance >= 0 ? "yellow" : "red"} />
              <StatCard label="Savings Rate" value={`${monthTotals.savings_rate ?? 0}%`} color="purple" />
            </>
          ) : (
            <>
              <StatCard label="Total Income" value={fmt(totals.total_income)} color="green" />
              <StatCard label="Total Expenses" value={fmt(totals.total_expenses)} color="red" />
              <StatCard label="Balance" value={fmt(totals.balance)} color={totals.balance >= 0 ? "yellow" : "red"} />
              <StatCard label="Savings Rate" value={`${totals.savings_rate ?? 0}%`} color="purple" />
            </>
          )}
        </div>
        {/* Committed / Discretionary */}
        {(() => {
          const committed = categories.filter((c) => getCategoryGroup(c.category) === "Committed");
          if (!committed.length) return null;
          const committedTotal = committed.reduce((s, c) => s + c.total, 0);
          const discretionary = (monthTotals.total_expenses ?? 0) - committedTotal;
          return (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 border border-zinc-800/50 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Committed Costs</p>
                <p className="text-xl font-bold text-blue-400">{fmt(committedTotal)}</p>
                <p className="text-xs text-zinc-600 mt-0.5">fixed recurring</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800/50 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Discretionary</p>
                <p className="text-xl font-bold text-zinc-200">{fmt(discretionary)}</p>
                <p className="text-xs text-zinc-600 mt-0.5">needs + wants</p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Spending pace — current month only */}
      {month === new Date().getMonth() + 1 && year === new Date().getFullYear() && monthTotals.total_expenses > 0 && (
        (() => {
          const today = new Date();
          const daysInMonth = new Date(year, month, 0).getDate();
          const dayOfMonth = today.getDate();
          const monthPct = Math.round((dayOfMonth / daysInMonth) * 100);
          const expensePct = monthTotals.total_income > 0
            ? Math.round((monthTotals.total_expenses / monthTotals.total_income) * 100)
            : null;
          const projectedExpenses = Math.round((monthTotals.total_expenses / dayOfMonth) * daysInMonth);
          const ahead = expensePct !== null && expensePct > monthPct + 10;
          return (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                Spending Pace — Day {dayOfMonth} of {daysInMonth}
              </h3>
              <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
                <div className="absolute top-0 left-0 h-full bg-zinc-600 rounded-full transition-all" style={{ width: `${monthPct}%` }} />
                <div className={`absolute top-0 left-0 h-full rounded-full transition-all ${ahead ? "bg-red-500" : "bg-green-500"}`}
                  style={{ width: `${Math.min(expensePct ?? monthPct, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-zinc-500 mb-3">
                <span>Expenses: <span className={ahead ? "text-red-400 font-semibold" : "text-zinc-300"}>{expensePct != null ? `${expensePct}% of income` : fmt(monthTotals.total_expenses)}</span></span>
                <span>Month: <span className="text-zinc-300">{monthPct}% elapsed</span></span>
              </div>
              <div className="flex gap-4 text-xs">
                <div>
                  <p className="text-zinc-500">Spent so far</p>
                  <p className="font-semibold text-zinc-100">{fmt(monthTotals.total_expenses)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Month-end projection</p>
                  <p className={`font-semibold ${ahead ? "text-red-400" : "text-zinc-100"}`}>{fmt(projectedExpenses)}</p>
                </div>
                {monthTotals.total_income > 0 && (
                  <div>
                    <p className="text-zinc-500">Remaining income</p>
                    <p className={`font-semibold ${monthTotals.total_income - monthTotals.total_expenses < 0 ? "text-red-400" : "text-green-400"}`}>
                      {fmt(Math.max(0, monthTotals.total_income - monthTotals.total_expenses))}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}

      {/* vs Last Month + Savings Goal + YoY */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MoMCard current={monthTotals} last={lastMonthTotals} />
        <SavingsGoalBar
          savingsRate={monthTotals.savings_rate}
          savingsGoal={savingsGoal}
          setSavingsGoal={setSavingsGoal}
        />
        <YoYCard year={year} month={month} />
      </div>

      {/* Debt Payments */}
      <DebtPaymentsWidget year={year} month={month} />

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
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
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
                            <span className="text-zinc-400 truncate min-w-0 mr-2 flex items-center gap-1">
                              {c.category}
                              {categoryTrends[c.category] && (
                                <Sparkline data={categoryTrends[c.category]} color={label === "Needs" ? "#facc15" : "#71717a"} />
                              )}
                            </span>
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
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-semibold text-zinc-500 uppercase tracking-wide hover:text-zinc-300 transition-colors">
            <span className="flex items-center gap-2 before:content-[''] before:block before:w-1 before:h-3 before:bg-yellow-400/60 before:rounded-full">
              Projections
            </span>
            <span className="text-yellow-400 font-bold normal-case text-sm">{fmt(projections.projected_year_balance)} projected</span>
          </summary>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Avg Monthly Income" value={fmt(projections.avg_monthly_income)} color="green" />
              <StatCard label="Avg Monthly Expenses" value={fmt(projections.avg_monthly_expenses)} color="red" />
              <StatCard label="Fixed Monthly Costs" value={fmt(projections.fixed_monthly_total)} color="yellow" />
              <StatCard label="Projected Year Balance" value={fmt(projections.projected_year_balance)}
                color={projections.projected_year_balance >= 0 ? "purple" : "red"} />
            </div>

            {/* Fixed expense breakdown — collapsed by default */}
            {projections.fixed_categories?.length > 0 && (
              <details className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <summary className="text-xs font-semibold text-zinc-500 uppercase tracking-wide cursor-pointer hover:text-zinc-300 flex items-center justify-between">
                  <span>Fixed Monthly Expenses</span>
                  <span className="text-yellow-400 font-bold normal-case text-sm">{fmt(projections.fixed_monthly_total)}</span>
                </summary>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-2 mt-4">
                  {projections.fixed_categories.map((c) => (
                    <div key={c.category} className="flex justify-between text-sm">
                      <span className="text-zinc-400 truncate mr-2">{c.category}</span>
                      <span className="text-yellow-400 font-medium whitespace-nowrap">{fmt(c.avg_monthly)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Year-end projection bar */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
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
        </details>
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
                      <span className="truncate min-w-0 mr-2 text-zinc-300">{c.category}</span>
                      <span className="font-medium text-yellow-400 shrink-0">{fmt(c.total)}</span>
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

      {/* Retirement Snapshot */}
      <RetirementTile />

      {/* Quick Add Transaction Button */}
      <button
        onClick={() => { setShowQuickAdd(true); setQuickError(""); setQuickSuccess(""); }}
        className="fixed bottom-6 right-6 bg-yellow-400 text-zinc-900 w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-2xl font-bold hover:bg-yellow-300 transition-colors z-40"
        title="Quick add transaction"
      >
        +
      </button>

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowQuickAdd(false); }}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-100">Quick Add Transaction</h2>
              <button onClick={() => setShowQuickAdd(false)} className="text-zinc-500 hover:text-zinc-300 text-xl">✕</button>
            </div>
            {quickError && <p className="text-red-400 text-sm">{quickError}</p>}
            {quickSuccess && <p className="text-green-400 text-sm">{quickSuccess}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Date</label>
                <input type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
                  value={quickForm.date} onChange={(e) => setQuickForm({ ...quickForm, date: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Merchant</label>
                <input type="text" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
                  placeholder="Tim Hortons" value={quickForm.merchant} onChange={(e) => setQuickForm({ ...quickForm, merchant: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Amount</label>
                <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
                  placeholder="0.00" value={quickForm.amount} onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Category</label>
                <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
                  value={quickForm.category} onChange={(e) => setQuickForm({ ...quickForm, category: e.target.value })}>
                  <option value="">— Select category —</option>
                  {quickCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
                <input type="text" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
                  value={quickForm.notes} onChange={(e) => setQuickForm({ ...quickForm, notes: e.target.value })} />
              </div>
            </div>
            <button
              disabled={quickSaving || !quickForm.merchant || !quickForm.amount || !quickForm.category}
              onClick={async () => {
                setQuickSaving(true);
                setQuickError("");
                setQuickSuccess("");
                try {
                  await createTransaction({
                    date: quickForm.date,
                    merchant: quickForm.merchant,
                    amount: parseFloat(quickForm.amount),
                    category: quickForm.category,
                    notes: quickForm.notes || null,
                    year: new Date(quickForm.date).getFullYear(),
                    month: new Date(quickForm.date).getMonth() + 1,
                  });
                  setQuickSuccess("Transaction added!");
                  setQuickForm({ date: new Date().toISOString().split("T")[0], merchant: "", amount: "", category: "", notes: "" });
                  loadDashboardData();
                  setTimeout(() => setQuickSuccess(""), 2000);
                } catch (e) {
                  setQuickError(e.message || "Failed to save.");
                } finally {
                  setQuickSaving(false);
                }
              }}
              className="w-full bg-yellow-400 text-zinc-900 py-2 rounded-lg font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {quickSaving ? "Saving..." : "Add Transaction"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

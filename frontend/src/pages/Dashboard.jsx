import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import StatCard from "../components/StatCard";
import { getMonthlySummary, getTotals, getCategorySummary, getYears, getProjections, getBudgetTargets, createIncome } from "../api";
import { getCategoryGroup } from "../constants";
import { MONTH_LABELS, currentYear, currentMonth, fmt } from "../utils";

// ── CPI data (Canada, 2020 = 100 base) ──────────────────────────────────────
const CPI_INDEX = { 2019: 96.5, 2020: 100, 2021: 103.4, 2022: 110.4, 2023: 114.7, 2024: 117.7, 2025: 120.4, 2026: 122.8 };
const CURRENT_CPI = 122.8;
const realIncome = (nominal, year) => nominal * (CURRENT_CPI / (CPI_INDEX[year] ?? CURRENT_CPI));

// ── Shared input styles (mirrors Income.jsx) ─────────────────────────────────
const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full";
const selectCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none";

const emptyPayday = { date: "", matt_base: "", matt_commission: "", nicole_base: "" };

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

// ── Log Payday Modal ─────────────────────────────────────────────────────────
function PaydayModal({ years, onClose, onSaved }) {
  const [modalYear, setModalYear] = useState(currentYear);
  const [modalMonth, setModalMonth] = useState(currentMonth);
  const [payday1, setPayday1] = useState({ ...emptyPayday });
  const [payday2, setPayday2] = useState({ ...emptyPayday });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const savePayday = async (payday) => {
    if (!payday.date) return;
    const entries = [
      { person: "Matt", income_type: "base", amount: parseFloat(payday.matt_base) },
      { person: "Matt", income_type: "commission", amount: parseFloat(payday.matt_commission) },
      { person: "Nicole", income_type: "base", amount: parseFloat(payday.nicole_base) },
    ].filter((e) => e.amount > 0);
    for (const entry of entries) {
      await createIncome({ year: modalYear, month: modalMonth, pay_date: payday.date, ...entry });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!payday1.date && !payday2.date) { setError("Enter at least one payday date."); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      await savePayday(payday1);
      await savePayday(payday2);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Log Payday Income</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Year / Month selectors */}
          <div className="flex gap-3">
            <select className={selectCls} value={modalYear} onChange={(e) => { setModalYear(Number(e.target.value)); setSaved(false); }}>
              {[...new Set([...years, currentYear])].sort().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select className={selectCls} value={modalMonth} onChange={(e) => { setModalMonth(Number(e.target.value)); setSaved(false); }}>
              {MONTH_LABELS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          {/* Two payday blocks */}
          {[
            { label: "Payday 1", state: payday1, setState: setPayday1 },
            { label: "Payday 2", state: payday2, setState: setPayday2 },
          ].map(({ label, state, setState }) => (
            <div key={label} className="border border-zinc-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest">{label}</span>
                <input
                  type="date"
                  className={`${inputCls} w-auto flex-1`}
                  value={state.date}
                  onChange={(e) => setState({ ...state, date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Matt Base ($)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    className={inputCls} value={state.matt_base}
                    onChange={(e) => setState({ ...state, matt_base: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Matt Commission ($)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    className={inputCls} value={state.matt_commission}
                    onChange={(e) => setState({ ...state, matt_commission: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Nicole Base ($)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    className={inputCls} value={state.nicole_base}
                    onChange={(e) => setState({ ...state, nicole_base: e.target.value })} />
                </div>
              </div>
            </div>
          ))}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {saved && (
            <p className="text-green-400 text-sm">
              Paydays saved for {MONTH_LABELS[modalMonth]} {modalYear}.{" "}
              <button type="button" onClick={onClose} className="underline hover:no-underline">Close</button>
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300 disabled:opacity-40"
            >
              {saving ? "Saving..." : `Save ${MONTH_LABELS[modalMonth]} ${modalYear} Paydays`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Income History Section ───────────────────────────────────────────────────
function IncomeHistory({ years }) {
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!years.length) return;
    setLoading(true);
    Promise.all(years.map((y) => getTotals(y, null, 12).then((t) => ({ year: y, income: t.total_income ?? 0 }))))
      .then((results) => {
        const sorted = results.sort((a, b) => a.year - b.year);
        setHistoryData(sorted);
      })
      .finally(() => setLoading(false));
  }, [years]);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">Income History</h2>
        <p className="text-zinc-600 text-sm text-center py-8">Loading...</p>
      </div>
    );
  }

  if (!historyData.length) return null;

  // Build chart + table rows
  const chartData = historyData.map((d) => ({
    year: String(d.year),
    Income: d.income,
    "Real Income": Math.round(realIncome(d.income, d.year)),
  }));

  const tableRows = historyData.map((d, i) => {
    const prev = i > 0 ? historyData[i - 1].income : null;
    const yoyPct = prev && prev > 0 ? ((d.income - prev) / prev) * 100 : null;
    return {
      year: d.year,
      income: d.income,
      realIncome: realIncome(d.income, d.year),
      yoyPct,
    };
  });

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-6">
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Income History</h2>

      {/* Bar chart */}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<DarkTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
          <Bar dataKey="Income" fill="#22c55e" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Real Income" fill="#22c55e" fillOpacity={0.4} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <th className="text-left pb-2 pr-4 font-semibold">Year</th>
              <th className="text-right pb-2 pr-4 font-semibold">Income</th>
              <th className="text-right pb-2 pr-4 font-semibold">Real Income (2026 $)</th>
              <th className="text-right pb-2 font-semibold">YoY Change</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => (
              <tr key={r.year} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                <td className="py-2.5 pr-4 text-zinc-300 font-medium">{r.year}</td>
                <td className="py-2.5 pr-4 text-right text-zinc-100">{fmt(r.income)}</td>
                <td className="py-2.5 pr-4 text-right text-zinc-400">{fmt(Math.round(r.realIncome))}</td>
                <td className="py-2.5 text-right">
                  {r.yoyPct === null ? (
                    <span className="text-zinc-600">—</span>
                  ) : (
                    <span className={r.yoyPct >= 0 ? "text-green-400" : "text-red-400"}>
                      {r.yoyPct >= 0 ? "+" : ""}{r.yoyPct.toFixed(1)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [categories, setCategories] = useState([]);
  const [projections, setProjections] = useState(null);
  const [budgetTargets, setBudgetTargets] = useState([]);
  const [error, setError] = useState("");
  const [showPaydayModal, setShowPaydayModal] = useState(false);

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
    Promise.all([
      getTotals(year, month).then(setMonthTotals),
      getCategorySummary(year, month).then(setCategories),
      getProjections(year, month).then(setProjections),
      getBudgetTargets({ year, month }).then(setBudgetTargets).catch(() => setBudgetTargets([])),
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
            onClick={() => setShowPaydayModal(true)}
            className="bg-yellow-400 text-black px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-yellow-300"
          >
            + Log Payday
          </button>
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

      {/* Income History */}
      <IncomeHistory years={years} />

      {/* Log Payday Modal */}
      {showPaydayModal && (
        <PaydayModal
          years={years}
          onClose={() => setShowPaydayModal(false)}
          onSaved={() => {
            loadDashboardData();
            // Keep modal open briefly so the user sees the "saved" confirmation,
            // then auto-close after 1.5 s
            setTimeout(() => setShowPaydayModal(false), 1500);
          }}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { getCategorySummary, getBudgetTargets, createBudgetTarget, updateBudgetTarget, deleteBudgetTarget, getYears, autoPopulateBudget, copyBudgetFromMonth, getCategories } from "../api";
import { getCategoryGroup } from "../constants";
import { MONTH_LABELS, currentYear, currentMonth, fmt } from "../utils";

const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

function ProgressBar({ actual, budget }) {
  if (!budget) return null;
  const pct = Math.min((actual / budget) * 100, 100);
  const over = actual > budget;
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden w-full">
      <div
        className={`h-full rounded-full transition-all ${over ? "bg-red-500" : "bg-green-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function BudgetPlanner() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [years, setYears] = useState([currentYear]);
  const [actuals, setActuals] = useState([]);
  const [targets, setTargets] = useState([]);
  const [knownCategories, setKnownCategories] = useState([]);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [error, setError] = useState("");
  const [autoPopulating, setAutoPopulating] = useState(false);
  const [autoPopResult, setAutoPopResult] = useState(null);
  const [lookback, setLookback] = useState(3);
  const [overwrite, setOverwrite] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyResult, setCopyResult] = useState(null);
  const [yoyActuals, setYoyActuals] = useState([]);

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear])).catch(() => {});
    getCategories().then(setKnownCategories).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setError("");
    Promise.all([
      getCategorySummary(year, month).then(setActuals),
      getBudgetTargets({ year, month }).then(setTargets),
      getCategorySummary(year - 1, month).then(setYoyActuals).catch(() => setYoyActuals([])),
    ]).catch((e) => setError(e.message));
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const targetMap = Object.fromEntries(targets.map((t) => [t.category, t]));

  const seenCategories = new Set([
    ...actuals.map((a) => a.category),
    ...targets.map((t) => t.category),
  ]);
  const allCategories = [
    ...actuals,
    ...targets
      .filter((t) => !actuals.find((a) => a.category === t.category))
      .map((t) => ({ category: t.category, total: 0, count: 0 })),
    ...knownCategories
      .filter((c) => !seenCategories.has(c))
      .map((c) => ({ category: c, total: 0, count: 0 })),
  ];

  const totalActual = actuals.reduce((s, a) => s + a.total, 0);
  const totalBudget = targets.reduce((s, t) => s + t.amount, 0);

  const saveTarget = async (category, amount) => {
    setSaving(true);
    const existing = targetMap[category];
    const body = { category, year, month, amount: parseFloat(amount) };
    if (existing) {
      await updateBudgetTarget(existing.id, body);
    } else {
      await createBudgetTarget(body);
    }
    setEditing((e) => { const n = { ...e }; delete n[category]; return n; });
    setSaving(false);
    load();
  };

  const removeTarget = async (category) => {
    const existing = targetMap[category];
    if (!existing) return;
    await deleteBudgetTarget(existing.id);
    load();
  };

  const addNew = async (e) => {
    e.preventDefault();
    if (!newCategory || !newAmount) return;
    await createBudgetTarget({ category: newCategory, year, month, amount: parseFloat(newAmount) });
    setNewCategory("");
    setNewAmount("");
    load();
  };

  const handleAutoPopulate = async () => {
    setAutoPopulating(true);
    setAutoPopResult(null);
    setError("");
    try {
      const res = await autoPopulateBudget({ year, month, lookback_months: lookback, overwrite });
      setAutoPopResult(res);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setAutoPopulating(false);
    }
  };

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevMonthYear = month === 1 ? year - 1 : year;

  const handleCopyFromLastMonth = async () => {
    setCopying(true);
    setCopyResult(null);
    setError("");
    try {
      const res = await copyBudgetFromMonth({
        from_year: prevMonthYear, from_month: prevMonth,
        to_year: year, to_month: month, overwrite: false,
      });
      setCopyResult(res);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setCopying(false);
    }
  };

  const yoyMap = Object.fromEntries(yoyActuals.map((r) => [r.category, r.total]));

  // Budget alert computations
  const alertRows = allCategories.filter((row) => {
    const budget = targetMap[row.category]?.amount;
    return budget && row.total > 0;
  });
  const overBudgetCount = alertRows.filter((row) => row.total >= targetMap[row.category].amount).length;
  const approachingCount = alertRows.filter((row) => {
    const budget = targetMap[row.category].amount;
    return row.total >= budget * 0.8 && row.total < budget;
  }).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-zinc-100">Budget Planner</h1>
        <div className="flex gap-3">
          <select className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className={inputCls} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
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

      {/* Budget alerts summary */}
      {(overBudgetCount > 0 || approachingCount > 0) && (
        <div className={`border rounded-xl px-4 py-3 text-sm flex flex-wrap gap-4 items-center ${overBudgetCount > 0 ? "bg-red-900/20 border-red-700/50" : "bg-yellow-900/20 border-yellow-700/50"}`}>
          {overBudgetCount > 0 && (
            <span className="text-red-400 font-medium">
              {overBudgetCount} {overBudgetCount === 1 ? "category" : "categories"} over budget
            </span>
          )}
          {approachingCount > 0 && (
            <span className="text-yellow-400 font-medium">
              {approachingCount} {approachingCount === 1 ? "category" : "categories"} approaching limit
            </span>
          )}
        </div>
      )}

      {/* Summary bar */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex flex-wrap gap-6 items-center">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Total Budgeted</p>
          <p className="text-xl font-bold text-yellow-400">{fmt(totalBudget)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Total Actual</p>
          <p className={`text-xl font-bold ${totalActual > totalBudget ? "text-red-400" : "text-green-400"}`}>
            {fmt(totalActual)}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Remaining</p>
          <p className={`text-xl font-bold ${totalBudget - totalActual < 0 ? "text-red-400" : "text-zinc-200"}`}>
            {fmt(totalBudget - totalActual)}
          </p>
        </div>
        {totalBudget > 0 && (
          <div className="flex-1 min-w-[160px]">
            <div className="flex justify-between text-xs text-zinc-500 mb-1">
              <span>{Math.round((totalActual / totalBudget) * 100)}% used</span>
              <span>{fmt(totalBudget)}</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${totalActual > totalBudget ? "bg-red-500" : "bg-yellow-400"}`}
                style={{ width: `${Math.min((totalActual / totalBudget) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Auto-populate from history */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-200">Auto-populate from history</p>
            <p className="text-xs text-zinc-500 mt-0.5">Set budget targets based on your spending averages from recent months.</p>
          </div>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Look back</label>
              <select className={inputCls} value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
                {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n} month{n !== 1 ? "s" : ""}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer pb-1.5">
              <input
                type="checkbox"
                className="accent-yellow-400"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              Overwrite existing
            </label>
            <button
              onClick={handleAutoPopulate}
              disabled={autoPopulating}
              className="bg-zinc-700 text-zinc-100 px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {autoPopulating ? "Calculating..." : "Auto-populate"}
            </button>
          </div>
        </div>
        {autoPopResult && (
          <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-sm text-green-400">
            Set <strong>{autoPopResult.set}</strong> targets from {autoPopResult.months_analyzed} month{autoPopResult.months_analyzed !== 1 ? "s" : ""} of history.
            {autoPopResult.skipped > 0 && <span className="text-zinc-500"> ({autoPopResult.skipped} skipped)</span>}
          </div>
        )}
        <div className="border-t border-zinc-800 pt-3 flex items-center gap-3 flex-wrap">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Or copy from {MONTH_LABELS[prevMonth]} {prevMonthYear}</p>
            <button
              onClick={handleCopyFromLastMonth}
              disabled={copying}
              className="bg-zinc-700 text-zinc-100 px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-600 disabled:opacity-40"
            >
              {copying ? "Copying..." : `Copy from ${MONTH_LABELS[prevMonth]}`}
            </button>
          </div>
          {copyResult && (
            <span className="text-xs text-green-400">
              Copied {copyResult.copied} target{copyResult.copied !== 1 ? "s" : ""}.
              {copyResult.skipped > 0 && ` (${copyResult.skipped} already set, skipped)`}
            </span>
          )}
        </div>
      </div>

      {/* Add new category budget */}
      <form onSubmit={addNew} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex gap-3 flex-wrap items-end">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Category</label>
          <input
            type="text"
            placeholder="e.g. Groceries"
            className={`${inputCls} w-44`}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Monthly Budget ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            className={`${inputCls} w-32`}
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
          />
        </div>
        <button type="submit" className="bg-yellow-400 text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-yellow-300">
          Set Budget
        </button>
      </form>

      {/* Table grouped by Needs / Wants */}
      {allCategories.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-10 text-center text-zinc-600 text-sm">
          No data. Import a spreadsheet or add transactions.
        </div>
      ) : (
        ["Needs", "Wants", "Other"].map((group) => {
          const rows = allCategories.filter((r) => getCategoryGroup(r.category) === group);
          if (!rows.length) return null;
          const groupActual = rows.reduce((s, r) => s + r.total, 0);
          const groupBudget = rows.reduce((s, r) => s + (targetMap[r.category]?.amount ?? 0), 0);
          return (
            <div key={group} className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest">{group}</span>
                <span className="text-xs text-zinc-500">
                  {fmt(groupActual)}{groupBudget > 0 ? ` / ${fmt(groupBudget)}` : ""}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-zinc-600">
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium text-right">Budget</th>
                    <th className="px-4 py-2 font-medium text-right">Actual</th>
                    <th className="px-4 py-2 font-medium text-right">Diff</th>
                    <th className="px-4 py-2 font-medium text-right text-zinc-600">{year - 1}</th>
                    <th className="px-4 py-2 font-medium w-28">Progress</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const target = targetMap[row.category];
                    const budget = target?.amount ?? 0;
                    const diff = budget - row.total;
                    const isEditing = editing[row.category] !== undefined;
                    return (
                      <tr key={row.category} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800">
                        <td className="px-4 py-2.5 font-medium text-zinc-200">{row.category}</td>
                        <td className="px-4 py-2.5 text-right">
                          {isEditing ? (
                            <input type="number" step="0.01" min="0" autoFocus
                              className="bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-sm w-24 text-right text-zinc-100 focus:outline-none focus:border-yellow-400/50"
                              value={editing[row.category]}
                              onChange={(e) => setEditing({ ...editing, [row.category]: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveTarget(row.category, editing[row.category]);
                                if (e.key === "Escape") setEditing((ed) => { const n = { ...ed }; delete n[row.category]; return n; });
                              }} />
                          ) : (
                            <button onClick={() => setEditing({ ...editing, [row.category]: String(budget) })}
                              className="text-right hover:text-yellow-400 w-full text-zinc-300">
                              {budget ? fmt(budget) : <span className="text-zinc-700">Set</span>}
                            </button>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium ${
                          budget && row.total >= budget
                            ? "bg-red-900/30 text-red-400"
                            : budget && row.total >= budget * 0.8
                            ? "bg-yellow-900/20 text-yellow-300"
                            : "text-zinc-300"
                        }`}>
                          <span className="flex items-center justify-end gap-1.5">
                            {fmt(row.total)}
                            {budget && row.total >= budget && (
                              <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Over!</span>
                            )}
                            {budget && row.total >= budget * 0.8 && row.total < budget && (
                              <span title="Approaching limit">⚠</span>
                            )}
                          </span>
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium ${diff < 0 ? "text-red-400" : "text-green-400"}`}>
                          {budget ? (diff < 0 ? `-${fmt(Math.abs(diff))}` : `+${fmt(diff)}`) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-600 text-xs">
                          {yoyMap[row.category] != null ? fmt(yoyMap[row.category]) : "—"}
                        </td>
                        <td className="px-4 py-2.5"><ProgressBar actual={row.total} budget={budget} /></td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          {isEditing && (
                            <button onClick={() => saveTarget(row.category, editing[row.category])}
                              disabled={saving} className="text-yellow-400 hover:text-yellow-300 mr-2">Save</button>
                          )}
                          {target && (
                            <button onClick={() => removeTarget(row.category)} className="text-red-500 hover:text-red-400">Remove</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })
      )}
      <p className="text-xs text-zinc-600">Click any budget amount to edit inline. Press Enter to save, Escape to cancel.</p>
    </div>
  );
}

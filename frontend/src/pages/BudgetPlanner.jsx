import { useState, useEffect, useCallback } from "react";
import { getCategorySummary, getBudgetTargets, createBudgetTarget, updateBudgetTarget, deleteBudgetTarget, getYears } from "../api";
import { getCategoryGroup } from "../constants";

const MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

const fmt = (n) => "$" + Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newAmount, setNewAmount] = useState("");

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
  }, []);

  const load = useCallback(() => {
    getCategorySummary(year, month).then(setActuals);
    getBudgetTargets({ year, month }).then(setTargets);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const targetMap = Object.fromEntries(targets.map((t) => [t.category, t]));

  const allCategories = [
    ...actuals,
    ...targets
      .filter((t) => !actuals.find((a) => a.category === t.category))
      .map((t) => ({ category: t.category, total: 0, count: 0 })),
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
                    <th className="px-4 py-2 font-medium w-32">Progress</th>
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
                        <td className="px-4 py-2.5 text-right text-zinc-300">{fmt(row.total)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${diff < 0 ? "text-red-400" : "text-green-400"}`}>
                          {budget ? (diff < 0 ? `-${fmt(Math.abs(diff))}` : `+${fmt(diff)}`) : "—"}
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

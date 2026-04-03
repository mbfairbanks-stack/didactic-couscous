import { useState, useEffect, useCallback } from "react";
import { getCategorySummary, getBudgetTargets, createBudgetTarget, updateBudgetTarget, deleteBudgetTarget, getYears, autoPopulateBudget, copyBudgetFromMonth, getCategoryDefinitions, rolloverBudget, getBudgetTemplates, saveBudgetTemplate, applyBudgetTemplate, deleteBudgetTemplate } from "../api";
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
  const [catDefs, setCatDefs] = useState([]);
  const [expandedParents, setExpandedParents] = useState(new Set());
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
  const [showSetBudgets, setShowSetBudgets] = useState(false);
  const [yoyActuals, setYoyActuals] = useState([]);
  const [priorMonthsActuals, setPriorMonthsActuals] = useState([]); // 3 prior months for committed avg

  // Budget rollover
  const [rollingOver, setRollingOver] = useState(false);
  const [rolloverResult, setRolloverResult] = useState(null);

  // Budget templates
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMsg, setTemplateMsg] = useState("");

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear])).catch(() => {});
    getCategoryDefinitions().then(setCatDefs).catch(() => {});
    getBudgetTemplates().then(setTemplates).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setError("");
    // Compute 3 prior months
    const priorMonths = [];
    for (let i = 1; i <= 3; i++) {
      const m = month - i;
      priorMonths.push(m <= 0 ? { y: year - 1, m: m + 12 } : { y: year, m });
    }
    Promise.all([
      getCategorySummary(year, month).then(setActuals),
      getBudgetTargets({ year, month }).then(setTargets),
      getCategorySummary(year - 1, month).then(setYoyActuals).catch(() => setYoyActuals([])),
      Promise.all(priorMonths.map(({ y, m }) => getCategorySummary(y, m).catch(() => []))).then(setPriorMonthsActuals),
    ]).catch((e) => setError(e.message));
  }, [year, month]);

  useEffect(() => { load(); }, [load]);


  const targetMap = Object.fromEntries(targets.map((t) => [t.category, t]));

  // Build category metadata from definitions
  const hiddenSet = new Set(catDefs.filter((c) => c.is_hidden).map((c) => c.name));
  const childrenOf = catDefs.reduce((acc, c) => {
    if (c.parent_name) {
      acc[c.parent_name] = [...(acc[c.parent_name] || []), c.name];
    }
    return acc;
  }, {});
  const isChildSet = new Set(catDefs.filter((c) => c.parent_name).map((c) => c.name));

  const toggleParent = (name) =>
    setExpandedParents((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const seenCategories = new Set([
    ...actuals.map((a) => a.category),
    ...targets.map((t) => t.category),
  ]);
  const allCategories = [
    ...actuals,
    ...targets
      .filter((t) => !actuals.find((a) => a.category === t.category))
      .map((t) => ({ category: t.category, total: 0, count: 0 })),
  ];

  // Top-level = not hidden, not a child of another category
  const visibleCategories = allCategories.filter(
    (r) => !hiddenSet.has(r.category) && !isChildSet.has(r.category)
  );

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

  const handleRollover = async () => {
    setRollingOver(true);
    setRolloverResult(null);
    setError("");
    try {
      const res = await rolloverBudget({ year, month, carry_remainder: true });
      setRolloverResult(res);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRollingOver(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    setTemplateMsg("");
    try {
      await saveBudgetTemplate({ name: templateName.trim(), year, month });
      setTemplateMsg(`Saved as "${templateName.trim()}"`);
      setTemplateName("");
      getBudgetTemplates().then(setTemplates).catch(() => {});
    } catch (e) {
      setTemplateMsg("Error: " + e.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleApplyTemplate = async (name) => {
    setError("");
    try {
      const res = await applyBudgetTemplate({ name, year, month, overwrite: false });
      setTemplateMsg(`Applied "${name}": ${res.applied} targets set`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteTemplate = async (name) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      await deleteBudgetTemplate(name);
      setTemplates((prev) => prev.filter((t) => t.name !== name));
    } catch (e) {
      setError(e.message);
    }
  };

  const yoyMap = Object.fromEntries(yoyActuals.map((r) => [r.category, r.total]));

  // 3-month rolling average per category for committed group
  const committedAvgMap = (() => {
    const totals = {};
    const counts = {};
    for (const monthData of priorMonthsActuals) {
      for (const row of monthData) {
        totals[row.category] = (totals[row.category] || 0) + row.total;
        counts[row.category] = (counts[row.category] || 0) + 1;
      }
    }
    return Object.fromEntries(Object.keys(totals).map((k) => [k, totals[k] / counts[k]]));
  })();

  // Budget alert computations (across all non-hidden categories including children)
  const alertRows = allCategories.filter((row) => {
    if (hiddenSet.has(row.category)) return false;
    const budget = targetMap[row.category]?.amount;
    return budget && row.total > 0;
  });
  const overBudgetCount = alertRows.filter((row) => row.total > targetMap[row.category].amount).length;
  const approachingCount = alertRows.filter((row) => {
    const budget = targetMap[row.category].amount;
    return row.total >= budget * 0.8 && row.total <= budget && (budget - row.total) > 5;
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap gap-6 items-center">
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

      {/* Set Budgets — collapsed by default */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowSetBudgets((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <span className="font-medium">Set Budgets</span>
          <span className="text-zinc-600 text-xs">{showSetBudgets ? "▲ collapse" : "▼ expand"}</span>
        </button>
        {showSetBudgets && (
          <div className="border-t border-zinc-800 p-4 space-y-4">
            {/* Add single */}
            <form onSubmit={addNew} className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Category</label>
                <input type="text" placeholder="e.g. Groceries" className={`${inputCls} w-40`}
                  value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Monthly Budget ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" className={`${inputCls} w-28`}
                  value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
              </div>
              <button type="submit" className="bg-yellow-400 text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-yellow-300">Set</button>
            </form>
            {/* Auto-populate */}
            <div className="border-t border-zinc-800 pt-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Auto-populate from history</p>
              <div className="flex gap-3 items-center flex-wrap">
                <select className={inputCls} value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
                  {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n} month{n !== 1 ? "s" : ""}</option>)}
                </select>
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input type="checkbox" className="accent-yellow-400" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                  Overwrite existing
                </label>
                <button onClick={handleAutoPopulate} disabled={autoPopulating}
                  className="bg-zinc-700 text-zinc-100 px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-600 disabled:opacity-40">
                  {autoPopulating ? "Calculating..." : "Auto-populate"}
                </button>
                <button onClick={handleCopyFromLastMonth} disabled={copying}
                  className="bg-zinc-700 text-zinc-100 px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-600 disabled:opacity-40">
                  {copying ? "Copying..." : `Copy from ${MONTH_LABELS[prevMonth]}`}
                </button>
                <button onClick={handleRollover} disabled={rollingOver}
                  className="bg-zinc-700 text-zinc-100 px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-600 disabled:opacity-40"
                  title="Copies last month's budgets and adds any unspent amounts as a bonus">
                  {rollingOver ? "Rolling over..." : "Rollover from Last Month"}
                </button>
              </div>
              {autoPopResult && (
                <p className="text-sm text-green-400">Set {autoPopResult.set} targets from {autoPopResult.months_analyzed} month{autoPopResult.months_analyzed !== 1 ? "s" : ""} of history.</p>
              )}
              {copyResult && (
                <p className="text-sm text-green-400">Copied {copyResult.copied} target{copyResult.copied !== 1 ? "s" : ""}.</p>
              )}
              {rolloverResult && (
                <p className="text-sm text-green-400">Rolled over {rolloverResult.copied} target{rolloverResult.copied !== 1 ? "s" : ""} from last month.</p>
              )}
            </div>

            {/* Budget templates */}
            <div className="border-t border-zinc-800 pt-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Budget Templates</p>
              <div className="flex gap-2 items-center flex-wrap">
                <input
                  type="text"
                  placeholder="Template name..."
                  className={`${inputCls} flex-1 min-w-[140px]`}
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveTemplate()}
                />
                <button onClick={handleSaveTemplate} disabled={savingTemplate || !templateName.trim()}
                  className="bg-zinc-700 text-zinc-100 px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-600 disabled:opacity-40">
                  {savingTemplate ? "Saving..." : "Save Current as Template"}
                </button>
              </div>
              {templates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <div key={t.name} className="flex items-center gap-1 bg-zinc-800 rounded px-2 py-1 text-xs">
                      <span className="text-zinc-300 font-medium">{t.name}</span>
                      <span className="text-zinc-600">({t.count})</span>
                      <button onClick={() => handleApplyTemplate(t.name)} className="text-yellow-400 hover:text-yellow-300 ml-1">Apply</button>
                      <button onClick={() => handleDeleteTemplate(t.name)} className="text-zinc-600 hover:text-red-400 ml-1">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {templateMsg && <p className="text-sm text-green-400">{templateMsg}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Table grouped by Committed / Needs / Wants / Other */}
      {visibleCategories.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-zinc-600 text-sm">
          No data. Import a spreadsheet or add transactions.
        </div>
      ) : (
        ["Committed", "Needs", "Wants", "Other"].map((group) => {
          const rows = visibleCategories.filter((r) => getCategoryGroup(r.category) === group);
          if (!rows.length) return null;
          const groupActual = rows.reduce((s, r) => {
            const kids = (childrenOf[r.category] || []);
            return s + r.total + kids.reduce((ks, name) => {
              const k = allCategories.find((a) => a.category === name);
              return ks + (k?.total ?? 0);
            }, 0);
          }, 0);
          const groupBudget = rows.reduce((s, r) => {
            const kids = (childrenOf[r.category] || []);
            return s + (targetMap[r.category]?.amount ?? 0) + kids.reduce((ks, name) => ks + (targetMap[name]?.amount ?? 0), 0);
          }, 0);

          // Helper to render a single budget row
          const renderRow = (row, indent = false) => {
            const target = targetMap[row.category];
            const budget = target?.amount ?? 0;
            const avg3 = committedAvgMap[row.category]; // 3-month rolling avg for committed
            const ref = budget || (group === "Committed" ? avg3 : 0); // use avg as reference if no budget
            const diff = ref - row.total;
            const isEditing = editing[row.category] !== undefined;
            return (
              <tr key={row.category} className={`border-b border-zinc-800 last:border-0 hover:bg-zinc-800 ${indent ? "bg-zinc-900/60" : ""}`}>
                <td className={`px-4 py-2.5 font-medium text-zinc-200 ${indent ? "pl-8" : ""}`}>
                  {indent && <span className="text-zinc-600 mr-1.5 text-xs">└</span>}
                  {row.category}
                </td>
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
                    <button onClick={() => setEditing({ ...editing, [row.category]: String(budget || Math.round(avg3 || 0)) })}
                      className="text-right hover:text-yellow-400 w-full text-zinc-300">
                      {budget ? fmt(budget) : group === "Committed" && avg3
                        ? <span className="text-zinc-500 text-xs">~{fmt(avg3)} avg</span>
                        : <span className="text-zinc-700">Set</span>}
                    </button>
                  )}
                </td>
                <td className={`px-4 py-2.5 text-right font-medium ${
                  ref > 0 && row.total > ref * 1.1 ? "bg-red-900/30 text-red-400"
                  : "text-zinc-300"
                }`}>
                  <span className="flex items-center justify-end gap-1.5">
                    {fmt(row.total)}
                    {ref > 0 && row.total > ref * 1.1 && (
                      <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">High</span>
                    )}
                  </span>
                </td>
                <td className={`hidden sm:table-cell px-4 py-2.5 text-right font-medium ${ref > 0 ? (diff < 0 ? "text-red-400" : "text-green-400") : "text-zinc-600"}`}>
                  {ref > 0 ? (diff < 0 ? `-${fmt(Math.abs(diff))}` : `+${fmt(diff)}`) : "—"}
                </td>
                <td className="hidden lg:table-cell px-4 py-2.5 text-right text-zinc-600 text-xs">
                  {yoyMap[row.category] != null ? fmt(yoyMap[row.category]) : "—"}
                </td>
                <td className="hidden sm:table-cell px-4 py-2.5"><ProgressBar actual={row.total} budget={ref} /></td>
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
          };

          return (
            <div key={group} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className={`px-4 py-2.5 border-b border-zinc-700 flex justify-between items-center ${group === "Committed" ? "bg-zinc-800/80" : "bg-zinc-800"}`}>
                <span className={`text-xs font-bold uppercase tracking-widest ${group === "Committed" ? "text-blue-400" : "text-yellow-400"}`}>
                  {group}
                  {group === "Committed" && <span className="text-zinc-600 font-normal normal-case tracking-normal ml-2">recurring fixed costs</span>}
                </span>
                <span className="text-xs text-zinc-500">
                  {fmt(groupActual)}{groupBudget > 0 ? ` / ${fmt(groupBudget)}` : ""}
                </span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-zinc-600">
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium text-right">{group === "Committed" ? "Ref / Budget" : "Budget"}</th>
                    <th className="px-4 py-2 font-medium text-right">Actual</th>
                    <th className="hidden sm:table-cell px-4 py-2 font-medium text-right">Diff</th>
                    <th className="hidden lg:table-cell px-4 py-2 font-medium text-right text-zinc-600">{year - 1}</th>
                    <th className="hidden sm:table-cell px-4 py-2 font-medium w-28">Progress</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const kids = (childrenOf[row.category] || [])
                      .map((name) => allCategories.find((a) => a.category === name) || { category: name, total: 0, count: 0 });

                    if (kids.length === 0) return renderRow(row);

                    // Parent row — shows rollup of self + children
                    const rollupActual = row.total + kids.reduce((s, k) => s + k.total, 0);
                    const rollupBudget = (targetMap[row.category]?.amount ?? 0) + kids.reduce((s, k) => s + (targetMap[k.category]?.amount ?? 0), 0);
                    const isExpanded = expandedParents.has(row.category);

                    return (
                      <>
                        <tr key={row.category}
                          className="border-b border-zinc-800 hover:bg-zinc-800 cursor-pointer select-none"
                          onClick={() => toggleParent(row.category)}>
                          <td className="px-4 py-2.5 font-medium text-zinc-200">
                            <span className="mr-1.5 text-zinc-500">{isExpanded ? "▾" : "▸"}</span>
                            {row.category}
                            <span className="text-xs text-zinc-600 ml-2">{kids.length} sub</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-zinc-400">
                            {rollupBudget ? fmt(rollupBudget) : <span className="text-zinc-700">—</span>}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-medium ${
                            rollupBudget > 0 && rollupActual > rollupBudget ? "text-red-400"
                            : rollupBudget > 0 && rollupActual >= rollupBudget * 0.8 ? "text-yellow-300"
                            : "text-zinc-300"
                          }`}>{fmt(rollupActual)}</td>
                          <td className={`hidden sm:table-cell px-4 py-2.5 text-right font-medium ${rollupBudget - rollupActual < 0 ? "text-red-400" : "text-green-400"}`}>
                            {rollupBudget ? (rollupBudget - rollupActual < 0 ? `-${fmt(Math.abs(rollupBudget - rollupActual))}` : `+${fmt(rollupBudget - rollupActual)}`) : "—"}
                          </td>
                          <td className="hidden lg:table-cell px-4 py-2.5 text-right text-zinc-600 text-xs">—</td>
                          <td className="hidden sm:table-cell px-4 py-2.5"><ProgressBar actual={rollupActual} budget={rollupBudget} /></td>
                          <td></td>
                        </tr>
                        {isExpanded && kids.map((kid) => renderRow(kid, true))}
                      </>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          );
        })
      )}
      <p className="text-xs text-zinc-600">Click any budget amount to edit inline. Press Enter to save, Escape to cancel.</p>
    </div>
  );
}

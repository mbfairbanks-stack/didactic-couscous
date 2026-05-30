import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getTransactions, createTransaction, updateTransaction, deleteTransaction, getCategories, getYears, exportTransactionsCsv, getAnomalies, splitTransaction, getRecurringSuggestions, getDebts } from "../api";
import { MONTH_LABELS, currentYear, currentMonth, fmtCents as fmt } from "../utils";

const VIRTUAL_CATEGORIES = ["E-Transfer", "Shared Expense"];

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  merchant: "",
  amount: "",
  category: "",
  year: currentYear,
  month: currentMonth,
  is_fixed: false,
  notes: "",
  source: "",
  linked_debt_id: "",
  debt_direction: "payment",
};

const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50";

export default function Transactions() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [search, setSearch] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [fixedOnly, setFixedOnly] = useState(false);
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [colFilter, setColFilter] = useState({ date: "", merchant: "", category: "", source: "" });
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showColFilters, setShowColFilters] = useState(false);
  const [years, setYears] = useState([currentYear]);
  const [allCategories, setAllCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Inline cell editing: { id, field, value } or null
  const [cellEdit, setCellEdit] = useState(null);
  const cellInputRef = useRef(null);

  // Bulk selection
  const [selected, setSelected] = useState(new Set());
  const [bulkCategory, setBulkCategory] = useState("");

  // Anomaly detection
  const [anomalyIds, setAnomalyIds] = useState(new Set());

  // Split transaction
  const [splitTxn, setSplitTxn] = useState(null);
  const [splitA, setSplitA] = useState({ amount: "", category: "" });
  const [splitB, setSplitB] = useState({ amount: "", category: "" });

  // Debt linking
  const [debts, setDebts] = useState([]);

  // Recurring detection
  const [recurringSuggestions, setRecurringSuggestions] = useState([]);
  const [showRecurring, setShowRecurring] = useState(false);
  const [markingRecurring, setMarkingRecurring] = useState(false);

  // Search ref for keyboard shortcut
  const searchRef = useRef(null);

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
    getCategories().then(setAllCategories);
    getRecurringSuggestions()
      .then((rows) => setRecurringSuggestions(rows.filter((r) => r.is_consistent)))
      .catch(() => {});
    getDebts().then(setDebts).catch(() => {});
  }, []);

  // Load anomalies whenever year/month changes
  useEffect(() => {
    if (!month) { setAnomalyIds(new Set()); return; }
    getAnomalies(year, month)
      .then((rows) => setAnomalyIds(new Set(rows.map((r) => r.id))))
      .catch(() => setAnomalyIds(new Set()));
  }, [year, month]);

  // Keyboard shortcuts: '/' focuses search, 'n' opens new transaction form
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowForm(true);
        setEditId(null);
        setForm(emptyForm);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setPage(0);
    // "__uncategorized__" is a client-only pseudo-filter; don't send to API
    const apiCategory = (filterCategory && filterCategory !== "__uncategorized__") ? filterCategory : undefined;
    getTransactions({ year, month, category: apiCategory, limit: 5000 })
      .then(setTransactions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, month, filterCategory]);

  useEffect(() => { load(); }, [load]);

  // Clear selection when visible set changes due to filter changes
  useEffect(() => {
    setSelected(new Set());
  }, [year, month, filterCategory, filterSource, search, amountMin, amountMax, fixedOnly, recurringOnly, colFilter]);

  const allSources = [...new Set(transactions.map((t) => t.source).filter(Boolean))].sort();

  const filtered = useMemo(() => transactions
    .filter((t) => {
      if (search && !t.merchant?.toLowerCase().includes(search.toLowerCase()) &&
          !(t.category || "").toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCategory === "__uncategorized__" && t.category && t.category.trim() !== "") return false;
      if (filterSource && t.source !== filterSource) return false;
      if (amountMin !== "" && t.amount < parseFloat(amountMin)) return false;
      if (amountMax !== "" && t.amount > parseFloat(amountMax)) return false;
      if (fixedOnly && !t.is_fixed) return false;
      if (recurringOnly && !t.is_recurring) return false;
      if (colFilter.date && !t.date?.includes(colFilter.date)) return false;
      if (colFilter.merchant && !t.merchant?.toLowerCase().includes(colFilter.merchant.toLowerCase())) return false;
      if (colFilter.category && !t.category?.toLowerCase().includes(colFilter.category.toLowerCase())) return false;
      if (colFilter.source && !(t.source || "").toLowerCase().includes(colFilter.source.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      let av = a[sortField], bv = b[sortField];
      if (sortField === "amount") { av = Number(av); bv = Number(bv); }
      else if (sortField === "merchant") { av = av?.toLowerCase(); bv = bv?.toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    }), [transactions, search, filterCategory, filterSource, amountMin, amountMax, fixedOnly, recurringOnly, colFilter, sortField, sortDir]);

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Inline cell editing ──────────────────────────────────────────────────────

  const startCellEdit = (txn, field) => {
    const value = field === "amount" ? String(txn.amount) : txn[field];
    setCellEdit({ id: txn.id, field, value });
    setTimeout(() => { if (cellInputRef.current) cellInputRef.current.focus(); }, 0);
  };

  const commitCellEdit = async () => {
    if (!cellEdit) return;
    const { id, field, value } = cellEdit;
    const txn = transactions.find((t) => t.id === id);
    if (!txn) { setCellEdit(null); return; }
    const coerced = field === "amount" ? parseFloat(value) : value;
    if (String(coerced) !== String(txn[field])) {
      try {
        await updateTransaction(id, { ...txn, [field]: coerced });
        load();
      } catch (e) {
        setError(e.message);
      }
    }
    setCellEdit(null);
  };

  const cancelCellEdit = () => setCellEdit(null);

  const handleCellKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitCellEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancelCellEdit(); }
  };

  // Renders a td that is either an inline editor or a clickable display value
  const renderEditableCell = (txn, field, displayNode, cellClass = "") => {
    const isEditing = cellEdit && cellEdit.id === txn.id && cellEdit.field === field;

    if (isEditing) {
      const inputCommon = {
        ref: cellInputRef,
        value: cellEdit.value,
        onChange: (e) => setCellEdit((ce) => ({ ...ce, value: e.target.value })),
        onBlur: commitCellEdit,
        onKeyDown: handleCellKeyDown,
        className: "bg-zinc-700 border border-yellow-400/70 rounded px-2 py-0.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400 w-full",
      };

      return (
        <td className={`px-4 py-2 ${cellClass}`}>
          {field === "category" ? (
            <select {...inputCommon}>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              {!allCategories.includes(cellEdit.value) && cellEdit.value && (
                <option value={cellEdit.value}>{cellEdit.value}</option>
              )}
            </select>
          ) : (
            <input
              {...inputCommon}
              type={field === "amount" ? "number" : "text"}
              step={field === "amount" ? "0.01" : undefined}
              min={field === "amount" ? "0" : undefined}
            />
          )}
        </td>
      );
    }

    return (
      <td
        className={`px-4 py-2 cursor-pointer group/cell ${cellClass}`}
        onClick={() => startCellEdit(txn, field)}
        title="Click to edit"
      >
        <span className="group-hover/cell:underline group-hover/cell:decoration-dotted group-hover/cell:decoration-zinc-500">
          {displayNode}
        </span>
      </td>
    );
  };

  // ── Bulk selection ───────────────────────────────────────────────────────────

  const filteredIds = filtered.map((t) => t.id);
  const allVisibleSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredIds));
    }
  };

  const toggleSelectRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkApplyCategory = async () => {
    if (!bulkCategory) return;
    setError("");
    const selectedIds = [...selected];
    const results = await Promise.allSettled(
      selectedIds.map((id) => {
        const txn = transactions.find((t) => t.id === id);
        return txn ? updateTransaction(id, { ...txn, category: bulkCategory }) : Promise.reject(new Error("Not found"));
      })
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    if (failed > 0) {
      setError(`${succeeded} updated, ${failed} failed. Please try again.`);
    } else {
      setSelected(new Set());
      setBulkCategory("");
    }
    load();
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!confirm(`Delete ${ids.length} selected transaction${ids.length === 1 ? "" : "s"}?`)) return;
    setError("");
    const results = await Promise.allSettled(ids.map((id) => deleteTransaction(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    if (failed > 0) {
      setError(`${succeeded} deleted, ${failed} failed. Please try again.`);
    } else {
      setSelected(new Set());
    }
    load();
  };

  // ── Form handlers ────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const [y, m] = form.date.split("-").map(Number);
    const body = {
      ...form,
      amount: parseFloat(form.amount),
      year: y,
      month: m,
      linked_debt_id: form.linked_debt_id ? parseInt(form.linked_debt_id) : null,
      debt_direction: form.linked_debt_id ? form.debt_direction : null,
    };
    try {
      if (editId) {
        await updateTransaction(editId, body);
      } else {
        await createTransaction(body);
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleEdit = (txn) => {
    setForm({
      date: txn.date,
      merchant: txn.merchant,
      amount: String(txn.amount),
      category: txn.category,
      year: txn.year,
      month: txn.month,
      is_fixed: txn.is_fixed,
      notes: txn.notes || "",
      source: txn.source || "",
      linked_debt_id: txn.linked_debt_id ? String(txn.linked_debt_id) : "",
      debt_direction: txn.debt_direction || "payment",
    });
    setEditId(txn.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this transaction?")) return;
    setError("");
    try {
      await deleteTransaction(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  // ── Recurring toggle ─────────────────────────────────────────────────────────

  const toggleRecurring = async (txn) => {
    try {
      await updateTransaction(txn.id, { ...txn, is_recurring: !txn.is_recurring });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  // ── Mark all from a merchant as recurring ────────────────────────────────────

  const markMerchantRecurring = async (merchant) => {
    setMarkingRecurring(true);
    const matches = transactions.filter((t) => t.merchant === merchant && !t.is_recurring);
    for (const txn of matches) {
      try { await updateTransaction(txn.id, { ...txn, is_recurring: true }); }
      catch {}
    }
    setMarkingRecurring(false);
    setRecurringSuggestions((prev) => prev.filter((s) => s.merchant !== merchant));
    load();
  };

  // ── CSV Export ───────────────────────────────────────────────────────────────

  const handleExportCsv = async () => {
    setExportingCsv(true);
    const params = { year };
    if (month) params.month = month;
    if (filterCategory) params.category = filterCategory;
    try {
      await exportTransactionsCsv(params);
    } catch (e) {
      setError("Export failed: " + e.message);
    } finally {
      setExportingCsv(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-zinc-100">Transactions</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExportCsv}
            disabled={exportingCsv}
            className="border border-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exportingCsv ? "Exporting..." : "Export CSV"}
          </button>
          <button
            onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }}
            className="bg-yellow-400 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-300"
          >
            + Add Transaction
          </button>
        </div>
      </div>

      {/* Recurring detection panel */}
      {recurringSuggestions.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowRecurring((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-800 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="text-yellow-400 font-semibold">↻ Recurring Detected</span>
              <span className="bg-yellow-400/20 text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded-full">{recurringSuggestions.length}</span>
              <span className="text-zinc-500 text-xs">merchants appear monthly — mark as recurring?</span>
            </span>
            <span className="text-zinc-600 text-xs">{showRecurring ? "▲" : "▼"}</span>
          </button>
          {showRecurring && (
            <div className="border-t border-zinc-800 divide-y divide-zinc-800/60">
              {recurringSuggestions.map((s) => (
                <div key={s.merchant} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <span className="text-zinc-200 font-medium">{s.merchant}</span>
                    <span className="text-zinc-600 text-xs ml-2">{s.category}</span>
                    <span className="text-zinc-600 text-xs ml-2">~{fmt(s.avg_amount)}/mo × {s.month_count} months</span>
                  </div>
                  <button
                    onClick={() => markMerchantRecurring(s.merchant)}
                    disabled={markingRecurring}
                    className="text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-400/30 px-2 py-1 rounded hover:bg-yellow-400/10 disabled:opacity-40"
                  >
                    Mark Recurring
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
        {/* Primary filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <select className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className={inputCls} value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPage(0); }}>
            <option value="">All months</option>
            {MONTH_LABELS.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select className={inputCls} value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }}>
            <option value="">All categories</option>
            <option value="__uncategorized__">Uncategorized</option>
            {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            ref={searchRef}
            className={`${inputCls} flex-1 min-w-[140px]`}
            placeholder="Search... ( / )"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
          <button
            onClick={() => setShowMoreFilters((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${showMoreFilters ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
          >
            Filters {(amountMin || amountMax || fixedOnly || recurringOnly || filterSource) ? "●" : ""}
          </button>
          <button
            onClick={() => setShowColFilters((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${showColFilters ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
          >
            Columns {Object.values(colFilter).some(Boolean) ? "●" : ""}
          </button>
          {(search || filterCategory || filterSource || amountMin || amountMax || fixedOnly || recurringOnly || Object.values(colFilter).some(Boolean)) && (
            <button
              onClick={() => { setSearch(""); setFilterCategory(""); setFilterSource(""); setAmountMin(""); setAmountMax(""); setFixedOnly(false); setRecurringOnly(false); setColFilter({ date: "", merchant: "", category: "", source: "" }); setPage(0); }}
              className="text-xs text-zinc-500 hover:text-zinc-300 underline"
            >
              Clear
            </button>
          )}
        </div>

        {/* Secondary filters — hidden by default */}
        {showMoreFilters && (
          <div className="flex flex-wrap gap-3 items-center pt-1 border-t border-zinc-800">
            <select className={inputCls} value={filterSource} onChange={(e) => { setFilterSource(e.target.value); setPage(0); }}>
              <option value="">All sources</option>
              {allSources.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">Amount:</span>
              <input type="number" min="0" step="0.01" placeholder="Min"
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 w-20 focus:outline-none focus:border-yellow-400/50"
                value={amountMin} onChange={(e) => { setAmountMin(e.target.value); setPage(0); }} />
              <span className="text-zinc-600 text-xs">–</span>
              <input type="number" min="0" step="0.01" placeholder="Max"
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 w-20 focus:outline-none focus:border-yellow-400/50"
                value={amountMax} onChange={(e) => { setAmountMax(e.target.value); setPage(0); }} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">Sort:</span>
              <select className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50"
                value={sortField} onChange={(e) => setSortField(e.target.value)}>
                <option value="date">Date</option>
                <option value="amount">Amount</option>
                <option value="merchant">Merchant</option>
                <option value="category">Category</option>
              </select>
              <button onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 w-8">
                {sortDir === "asc" ? "↑" : "↓"}
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" className="accent-yellow-400" checked={fixedOnly}
                onChange={(e) => { setFixedOnly(e.target.checked); setPage(0); }} />
              Fixed only
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" className="accent-yellow-400" checked={recurringOnly}
                onChange={(e) => { setRecurringOnly(e.target.checked); setPage(0); }} />
              Recurring only
            </label>
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-700 bg-zinc-800">
          <span className="text-xs text-zinc-500">
            {filtered.length} transactions
            {filtered.length > PAGE_SIZE && ` — showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)}`}
          </span>
          <span className="text-sm font-semibold text-yellow-400">Total: {fmt(total)}</span>
        </div>
        {loading ? (
          <div className="py-12 space-y-3 px-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center animate-pulse">
                <div className="w-5 h-5 bg-zinc-800 rounded" />
                <div className="w-20 h-4 bg-zinc-800 rounded" />
                <div className="flex-1 h-4 bg-zinc-800 rounded" />
                <div className="w-24 h-4 bg-zinc-800 rounded" />
                <div className="w-16 h-4 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-zinc-400 font-medium">No transactions found</p>
            <p className="text-zinc-600 text-sm mt-1">
              {search || filterCategory ? "Try adjusting your filters" : "Add your first transaction with the button above"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-left text-zinc-500 bg-zinc-800">
                  {/* Checkbox select-all */}
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      className="accent-yellow-400 cursor-pointer"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      title={allVisibleSelected ? "Deselect all" : "Select all visible"}
                    />
                  </th>
                  {[["date","Date"],["merchant","Merchant"],["category","Category"]].map(([f,label]) => (
                    <th key={f} className="px-4 py-2 font-medium cursor-pointer hover:text-zinc-300 select-none"
                      onClick={() => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } }}>
                      {label}{sortField === f ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  ))}
                  <th className="px-4 py-2 font-medium text-right cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => { if (sortField === "amount") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField("amount"); setSortDir("desc"); } }}>
                    Amount{sortField === "amount" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className="hidden sm:table-cell px-4 py-2 font-medium cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => { if (sortField === "source") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField("source"); setSortDir("asc"); } }}>
                    Source{sortField === "source" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className="hidden sm:table-cell px-4 py-2 font-medium text-center" title="Recurring">↻</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
                {showColFilters && (
                  <tr className="border-b border-zinc-700 bg-zinc-800/60">
                    <td className="px-3 py-1"></td>
                    {["date","merchant","category"].map((f) => (
                      <td key={f} className="px-2 py-1">
                        <input type="text" placeholder="Filter..."
                          className="w-full bg-zinc-700/60 border border-zinc-600/50 rounded px-2 py-0.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50"
                          value={colFilter[f]}
                          onChange={(e) => { setColFilter(cf => ({ ...cf, [f]: e.target.value })); setPage(0); }} />
                      </td>
                    ))}
                    <td className="px-2 py-1"></td>
                    <td className="hidden sm:table-cell px-2 py-1">
                      <input type="text" placeholder="Filter..."
                        className="w-full bg-zinc-700/60 border border-zinc-600/50 rounded px-2 py-0.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50"
                        value={colFilter.source}
                        onChange={(e) => { setColFilter(cf => ({ ...cf, source: e.target.value })); setPage(0); }} />
                    </td>
                    <td className="hidden sm:table-cell px-2 py-1"></td>
                    <td className="px-2 py-1 text-right">
                      {Object.values(colFilter).some(Boolean) && (
                        <button onClick={() => { setColFilter({ date: "", merchant: "", category: "", source: "" }); setPage(0); }}
                          className="text-xs text-zinc-600 hover:text-zinc-400">✕</button>
                      )}
                    </td>
                  </tr>
                )}
              </thead>
              <tbody>
                {paginated.map((txn) => (
                  <tr
                    key={txn.id}
                    className={`border-b border-zinc-800 last:border-0 hover:bg-zinc-800 ${txn.is_recurring ? "bg-yellow-400/5" : ""} ${selected.has(txn.id) ? "bg-yellow-400/10" : ""}`}
                  >
                    {/* Row checkbox */}
                    <td className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        className="accent-yellow-400 cursor-pointer"
                        checked={selected.has(txn.id)}
                        onChange={() => toggleSelectRow(txn.id)}
                      />
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{txn.date}</td>
                    {/* Inline-editable: merchant */}
                    {renderEditableCell(
                      txn,
                      "merchant",
                      <span className="max-w-[220px] block">
                        <span className="truncate block text-zinc-200">
                          {txn.merchant}
                          {txn.linked_debt_id && (
                            <span className="text-xs text-blue-400 ml-1">
                              · {txn.debt_direction === "charge" ? "LOC charge" : "debt payment"}
                            </span>
                          )}
                        </span>
                        {txn.notes && (
                          <span className="truncate block text-zinc-500 text-xs">{txn.notes}</span>
                        )}
                      </span>,
                      "max-w-[240px]"
                    )}
                    {/* Inline-editable: category */}
                    {renderEditableCell(
                      txn,
                      "category",
                      txn.category
                        ? <span className="bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded text-xs font-medium">{txn.category}</span>
                        : <span className="text-zinc-600 text-xs italic">Uncategorized</span>
                    )}
                    {/* Inline-editable: amount */}
                    {renderEditableCell(
                      txn,
                      "amount",
                      <span className="font-medium text-zinc-100">{fmt(txn.amount)}</span>,
                      "text-right"
                    )}
                    <td className="hidden sm:table-cell px-4 py-2 text-zinc-600 text-xs uppercase">{txn.source || "—"}</td>
                    <td className="hidden sm:table-cell px-3 py-2 text-center">
                      <button
                        onClick={() => toggleRecurring(txn)}
                        title={txn.is_recurring ? "Mark as non-recurring" : "Mark as recurring"}
                        className={`text-base leading-none transition-colors ${txn.is_recurring ? "text-yellow-400" : "text-zinc-700 hover:text-zinc-400"}`}
                      >
                        ↻
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {anomalyIds.has(txn.id) && (
                        <span className="inline-flex items-center mr-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-900/40 text-orange-400 border border-orange-700/50" title="Unusually high for this category">
                          ⚠ High
                        </span>
                      )}
                      <button onClick={() => handleEdit(txn)} className="text-yellow-400 hover:text-yellow-300 mr-2 text-xs">Edit</button>
                      <button onClick={() => { setSplitTxn(txn); setSplitA({ amount: "", category: txn.category }); setSplitB({ amount: "", category: txn.category }); }} className="text-zinc-500 hover:text-zinc-300 mr-2 text-xs">Split</button>
                      <button onClick={() => handleDelete(txn.id)} className="text-red-500 hover:text-red-400 text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Bulk action bar — sticky at bottom when ≥1 row selected */}
      {someSelected && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-3 px-6 py-3 bg-zinc-900 border-t border-zinc-700 shadow-2xl">
          <span className="text-sm font-medium text-zinc-300 shrink-0">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 flex-1">
            <select
              className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            >
              <option value="">— choose category —</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={handleBulkApplyCategory}
              disabled={!bulkCategory}
              className="bg-yellow-400 text-black px-3 py-1.5 rounded text-sm font-medium hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply Category
            </button>
          </div>
          <button
            onClick={handleBulkDelete}
            className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-sm font-medium shrink-0"
          >
            Delete Selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:text-zinc-300 text-xs underline shrink-0"
          >
            Clear
          </button>
        </div>
      )}

      {/* Split transaction modal */}
      {splitTxn && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-1 text-zinc-100">Split Transaction</h2>
            <p className="text-zinc-500 text-xs mb-4">
              {splitTxn.merchant} — {fmt(splitTxn.amount)} total
            </p>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <div className="space-y-4">
              {[{ label: "Part A", state: splitA, setState: setSplitA }, { label: "Part B", state: splitB, setState: setSplitB }].map(({ label, state, setState }) => (
                <div key={label} className="bg-zinc-800/60 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-zinc-400">{label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-zinc-500">Amount ($)</label>
                      <input type="number" step="0.01" min="0" className={`w-full mt-0.5 ${inputCls}`}
                        value={state.amount}
                        onChange={(e) => setState({ ...state, amount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">Category</label>
                      <select className={`w-full mt-0.5 ${inputCls}`} value={state.category} onChange={(e) => setState({ ...state, category: e.target.value })}>
                        {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {splitA.amount && splitB.amount && (
                <p className={`text-xs text-center ${Math.abs(parseFloat(splitA.amount) + parseFloat(splitB.amount) - splitTxn.amount) < 0.02 ? "text-green-400" : "text-red-400"}`}>
                  Total: {fmt(parseFloat(splitA.amount || 0) + parseFloat(splitB.amount || 0))} / {fmt(splitTxn.amount)}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setError("");
                    const amtA = parseFloat(splitA.amount);
                    const amtB = parseFloat(splitB.amount);
                    if (!amtA || !amtB) { setError("Both amounts required"); return; }
                    try {
                      await splitTransaction(splitTxn.id, { amount_a: amtA, category_a: splitA.category, amount_b: amtB, category_b: splitB.category });
                      setSplitTxn(null);
                      load();
                    } catch (e) { setError(e.message); }
                  }}
                  className="flex-1 bg-yellow-400 text-black py-2 rounded-lg text-sm font-medium hover:bg-yellow-300"
                >
                  Split
                </button>
                <button onClick={() => { setSplitTxn(null); setError(""); }} className="flex-1 border border-zinc-700 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-zinc-100">{editId ? "Edit Transaction" : "Add Transaction"}</h2>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500">Date</label>
                  <input type="date" required className={`w-full mt-0.5 ${inputCls}`}
                    value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Amount ($)</label>
                  <input type="number" step="0.01" min="0" required className={`w-full mt-0.5 ${inputCls}`}
                    value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500">Merchant</label>
                <input type="text" required className={`w-full mt-0.5 ${inputCls}`}
                  value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Category</label>
                <select required className={`w-full mt-0.5 ${inputCls}`}
                  value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {!form.category && <option value="">— choose category —</option>}
                  {form.category && !allCategories.includes(form.category) && !VIRTUAL_CATEGORIES.includes(form.category) && (
                    <option value={form.category}>{form.category}</option>
                  )}
                  {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  {VIRTUAL_CATEGORIES.map((cat) => !allCategories.includes(cat) && <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500">Notes (optional)</label>
                <input type="text" className={`w-full mt-0.5 ${inputCls}`}
                  placeholder="e.g. Split with Alex, Enbridge bill"
                  value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Link to Debt (optional)</label>
                <select
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
                  value={form.linked_debt_id}
                  onChange={(e) => setForm({ ...form, linked_debt_id: e.target.value })}
                >
                  <option value="">None</option>
                  {debts.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.creditor})</option>
                  ))}
                </select>
              </div>
              {form.linked_debt_id && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Direction</label>
                  <select
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
                    value={form.debt_direction}
                    onChange={(e) => setForm({ ...form, debt_direction: e.target.value })}
                  >
                    <option value="payment">Payment (reduces balance)</option>
                    <option value="charge">Charge (increases balance — LOC)</option>
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_fixed" checked={form.is_fixed}
                  onChange={(e) => setForm({ ...form, is_fixed: e.target.checked })}
                  className="accent-yellow-400" />
                <label htmlFor="is_fixed" className="text-sm text-zinc-300">Fixed expense</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-yellow-400 text-black py-2 rounded-lg text-sm font-medium hover:bg-yellow-300">
                  {editId ? "Save Changes" : "Add Transaction"}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditId(null); setError(""); }}
                  className="flex-1 border border-zinc-700 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

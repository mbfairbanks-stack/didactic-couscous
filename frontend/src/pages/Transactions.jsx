import { useState, useEffect, useCallback } from "react";
import { getTransactions, createTransaction, updateTransaction, deleteTransaction, getCategories, getYears } from "../api";
import { MONTH_LABELS, currentYear, currentMonth, fmtCents as fmt } from "../utils";

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
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [colFilter, setColFilter] = useState({ date: "", merchant: "", category: "", source: "" });
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

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
    getCategories().then(setAllCategories);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setPage(0);
    getTransactions({ year, month, category: filterCategory || undefined, limit: 5000 })
      .then(setTransactions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, month, filterCategory]);

  useEffect(() => { load(); }, [load]);

  const allSources = [...new Set(transactions.map((t) => t.source).filter(Boolean))].sort();

  const filtered = transactions
    .filter((t) => {
      if (search && !t.merchant.toLowerCase().includes(search.toLowerCase()) &&
          !t.category.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterSource && t.source !== filterSource) return false;
      if (amountMin !== "" && t.amount < parseFloat(amountMin)) return false;
      if (amountMax !== "" && t.amount > parseFloat(amountMax)) return false;
      if (fixedOnly && !t.is_fixed) return false;
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
    });

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const body = {
      ...form,
      amount: parseFloat(form.amount),
      year: parseInt(form.year),
      month: parseInt(form.month),
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
    });
    setEditId(txn.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this transaction?")) return;
    await deleteTransaction(id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-zinc-100">Transactions</h1>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }}
          className="bg-yellow-400 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-300"
        >
          + Add Transaction
        </button>
      </div>

      {/* Filters */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
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
            {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={inputCls} value={filterSource} onChange={(e) => { setFilterSource(e.target.value); setPage(0); }}>
            <option value="">All sources</option>
            {allSources.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
          <input
            className={`${inputCls} flex-1 min-w-[160px]`}
            placeholder="Search merchant or category..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">Amount:</span>
            <input
              type="number" min="0" step="0.01" placeholder="Min"
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 w-24 focus:outline-none focus:border-yellow-400/50"
              value={amountMin}
              onChange={(e) => { setAmountMin(e.target.value); setPage(0); }}
            />
            <span className="text-zinc-600 text-xs">–</span>
            <input
              type="number" min="0" step="0.01" placeholder="Max"
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 w-24 focus:outline-none focus:border-yellow-400/50"
              value={amountMax}
              onChange={(e) => { setAmountMax(e.target.value); setPage(0); }}
            />
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
            <button
              onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 w-10"
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" className="accent-yellow-400" checked={fixedOnly}
              onChange={(e) => { setFixedOnly(e.target.checked); setPage(0); }} />
            Fixed only
          </label>
          {(search || filterCategory || filterSource || amountMin || amountMax || fixedOnly || Object.values(colFilter).some(Boolean)) && (
            <button
              onClick={() => { setSearch(""); setFilterCategory(""); setFilterSource(""); setAmountMin(""); setAmountMax(""); setFixedOnly(false); setColFilter({ date: "", merchant: "", category: "", source: "" }); setPage(0); }}
              className="text-xs text-zinc-500 hover:text-zinc-300 underline ml-auto"
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-700 bg-zinc-800">
          <span className="text-xs text-zinc-500">
            {filtered.length} transactions
            {filtered.length > PAGE_SIZE && ` — showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)}`}
          </span>
          <span className="text-sm font-semibold text-yellow-400">Total: {fmt(total)}</span>
        </div>
        {loading ? (
          <p className="text-center text-zinc-600 py-12">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-zinc-600 py-12">No transactions found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-left text-zinc-500 bg-zinc-800">
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
                  <th className="px-4 py-2 font-medium cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => { if (sortField === "source") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField("source"); setSortDir("asc"); } }}>
                    Source{sortField === "source" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
                <tr className="border-b border-zinc-700 bg-zinc-800/60">
                  {["date","merchant","category"].map((f) => (
                    <td key={f} className="px-2 py-1">
                      <input
                        type="text"
                        placeholder="Filter..."
                        className="w-full bg-zinc-700/60 border border-zinc-600/50 rounded px-2 py-0.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50"
                        value={colFilter[f]}
                        onChange={(e) => { setColFilter(cf => ({ ...cf, [f]: e.target.value })); setPage(0); }}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1"></td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      placeholder="Filter..."
                      className="w-full bg-zinc-700/60 border border-zinc-600/50 rounded px-2 py-0.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50"
                      value={colFilter.source}
                      onChange={(e) => { setColFilter(cf => ({ ...cf, source: e.target.value })); setPage(0); }}
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    {Object.values(colFilter).some(Boolean) && (
                      <button onClick={() => { setColFilter({ date: "", merchant: "", category: "", source: "" }); setPage(0); }}
                        className="text-xs text-zinc-600 hover:text-zinc-400">✕</button>
                    )}
                  </td>
                </tr>
              </thead>
              <tbody>
                {paginated.map((txn) => (
                  <tr key={txn.id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800">
                    <td className="px-4 py-2 text-zinc-500">{txn.date}</td>
                    <td className="px-4 py-2 max-w-[240px] truncate text-zinc-200">{txn.merchant}</td>
                    <td className="px-4 py-2">
                      <span className="bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded text-xs font-medium">
                        {txn.category}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-zinc-100">{fmt(txn.amount)}</td>
                    <td className="px-4 py-2 text-zinc-600 text-xs uppercase">{txn.source || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleEdit(txn)} className="text-yellow-400 hover:text-yellow-300 mr-3 text-xs">Edit</button>
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

      {/* Add / Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 w-full max-w-md">
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
                <input type="text" required list="cat-list" className={`w-full mt-0.5 ${inputCls}`}
                  value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                <datalist id="cat-list">
                  {allCategories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500">Year</label>
                  <input type="number" required className={`w-full mt-0.5 ${inputCls}`}
                    value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Month</label>
                  <select className={`w-full mt-0.5 ${inputCls}`}
                    value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}>
                    {MONTH_LABELS.slice(1).map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500">Notes (optional)</label>
                <input type="text" className={`w-full mt-0.5 ${inputCls}`}
                  value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
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

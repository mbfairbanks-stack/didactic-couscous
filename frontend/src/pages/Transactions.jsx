import { useState, useEffect, useCallback } from "react";
import { getTransactions, createTransaction, updateTransaction, deleteTransaction, getCategories, getYears } from "../api";

const MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

const fmt = (n) => "$" + Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export default function Transactions() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [filterCategory, setFilterCategory] = useState("");
  const [search, setSearch] = useState("");
  const [years, setYears] = useState([currentYear]);
  const [allCategories, setAllCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
    getCategories().then(setAllCategories);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    getTransactions({ year, month, category: filterCategory || undefined })
      .then(setTransactions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, month, filterCategory]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? transactions.filter((t) =>
        t.merchant.toLowerCase().includes(search.toLowerCase()) ||
        t.category.toLowerCase().includes(search.toLowerCase())
      )
    : transactions;

  const total = filtered.reduce((s, t) => s + t.amount, 0);

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
        <h1 className="text-2xl font-bold">Transactions</h1>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Add Transaction
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white border rounded-xl p-4">
        <select className="border rounded px-3 py-1.5 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="border rounded px-3 py-1.5 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          <option value="">All months</option>
          {MONTH_LABELS.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select className="border rounded px-3 py-1.5 text-sm" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[160px]"
          placeholder="Search merchant or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b bg-gray-50">
          <span className="text-sm text-gray-500">{filtered.length} transactions</span>
          <span className="text-sm font-semibold">Total: {fmt(total)}</span>
        </div>
        {loading ? (
          <p className="text-center text-gray-400 py-12">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No transactions found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Merchant</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((txn) => (
                  <tr key={txn.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500">{txn.date}</td>
                    <td className="px-4 py-2 max-w-[240px] truncate">{txn.merchant}</td>
                    <td className="px-4 py-2">
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                        {txn.category}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{fmt(txn.amount)}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs uppercase">{txn.source || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleEdit(txn)} className="text-blue-500 hover:text-blue-700 mr-3 text-xs">Edit</button>
                      <button onClick={() => handleDelete(txn.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">{editId ? "Edit Transaction" : "Add Transaction"}</h2>
            {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Date</label>
                  <input type="date" required className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                    value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Amount ($)</label>
                  <input type="number" step="0.01" min="0" required className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                    value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Merchant</label>
                <input type="text" required className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                  value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Category</label>
                <input type="text" required list="cat-list" className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                  value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                <datalist id="cat-list">
                  {allCategories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Year</label>
                  <input type="number" required className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                    value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Month</label>
                  <select className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                    value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}>
                    {MONTH_LABELS.slice(1).map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Notes (optional)</label>
                <input type="text" className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                  value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_fixed" checked={form.is_fixed}
                  onChange={(e) => setForm({ ...form, is_fixed: e.target.checked })} />
                <label htmlFor="is_fixed" className="text-sm">Fixed expense</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                  {editId ? "Save Changes" : "Add Transaction"}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditId(null); setError(""); }}
                  className="flex-1 border py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
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

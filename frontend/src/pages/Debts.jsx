import { useState, useEffect, useCallback } from "react";
import { getDebts, createDebt, updateDebt, deleteDebt } from "../api";
import { fmt } from "../utils";

const inputCls =
  "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

const emptyForm = {
  name: "",
  creditor: "",
  initial_balance: "",
  current_balance: "",
  monthly_payment: "",
  monthly_extra: "",
  savings: "",
  due_date: "",
  notes: "",
};

function parseMonthsRemaining(dueDateStr) {
  if (!dueDateStr) return null;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = dueDateStr.split(" ");
  if (parts.length !== 2) return null;
  const m = monthNames.indexOf(parts[0]);
  const y = parseInt(parts[1]);
  if (m === -1 || isNaN(y)) return null;
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - now.getMonth());
}

function computeDebtStats(debt) {
  const remaining = debt.current_balance - debt.savings;
  const monthsLeft = parseMonthsRemaining(debt.due_date);
  const totalMonthly = debt.monthly_payment + debt.monthly_extra;
  const balanceAtDue =
    monthsLeft != null ? Math.max(0, remaining - totalMonthly * monthsLeft) : null;
  const monthlyNeeded =
    monthsLeft != null && monthsLeft > 0 ? remaining / monthsLeft : null;
  const onTrack = monthlyNeeded != null ? totalMonthly >= monthlyNeeded : true;
  const pctPaid =
    debt.initial_balance > 0
      ? Math.min(100, ((debt.initial_balance - debt.current_balance) / debt.initial_balance) * 100)
      : 0;
  return { remaining, monthsLeft, totalMonthly, balanceAtDue, monthlyNeeded, onTrack, pctPaid };
}

function StatBox({ label, value }) {
  return (
    <div className="bg-zinc-800 rounded-lg px-3 py-2">
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

export default function Debts() {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    getDebts()
      .then(setDebts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ ...emptyForm });
    setEditId(null);
    setFormError("");
    setShowModal(true);
  };

  const openEdit = (debt) => {
    setForm({
      name: debt.name,
      creditor: debt.creditor || "",
      initial_balance: String(debt.initial_balance),
      current_balance: String(debt.current_balance),
      monthly_payment: String(debt.monthly_payment),
      monthly_extra: String(debt.monthly_extra),
      savings: String(debt.savings),
      due_date: debt.due_date || "",
      notes: debt.notes || "",
    });
    setEditId(debt.id);
    setFormError("");
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this debt?")) return;
    try {
      await deleteDebt(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    const body = {
      name: form.name.trim(),
      creditor: form.creditor.trim(),
      initial_balance: parseFloat(form.initial_balance) || 0,
      current_balance: parseFloat(form.current_balance) || 0,
      monthly_payment: parseFloat(form.monthly_payment) || 0,
      monthly_extra: parseFloat(form.monthly_extra) || 0,
      savings: parseFloat(form.savings) || 0,
      due_date: form.due_date.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editId) {
        await updateDebt(editId, body);
      } else {
        await createDebt(body);
      }
      setShowModal(false);
      setEditId(null);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  // Summary totals
  const totalBalance = debts.reduce((s, d) => s + d.current_balance, 0);
  const totalMonthly = debts.reduce((s, d) => s + d.monthly_payment + d.monthly_extra, 0);
  const totalRemaining = debts.reduce((s, d) => s + (d.current_balance - d.savings), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-zinc-100">Debt Tracker</h1>
        <button
          onClick={openAdd}
          className="bg-yellow-400 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-300"
        >
          + Add Debt
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Summary bar */}
      {debts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Current Balance</p>
            <p className="text-xl font-bold text-yellow-400">{fmt(totalBalance)}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Monthly Committed</p>
            <p className="text-xl font-bold text-yellow-400">{fmt(totalMonthly)}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Remaining</p>
            <p className="text-xl font-bold text-yellow-400">{fmt(totalRemaining)}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-center text-zinc-600 py-16">Loading...</p>
      )}

      {/* Empty state */}
      {!loading && debts.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl py-16 text-center">
          <p className="text-zinc-500 text-sm">No debts tracked yet.</p>
          <button
            onClick={openAdd}
            className="mt-4 bg-yellow-400 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-300"
          >
            + Add Your First Debt
          </button>
        </div>
      )}

      {/* Debt cards */}
      {!loading && debts.map((debt) => {
        const { remaining, monthsLeft, totalMonthly: tm, balanceAtDue, monthlyNeeded, onTrack, pctPaid } =
          computeDebtStats(debt);

        return (
          <div key={debt.id} className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700 bg-zinc-800">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-base font-semibold text-zinc-100">{debt.name}</span>
                {debt.creditor && (
                  <span className="bg-zinc-700 text-zinc-300 text-xs px-2 py-0.5 rounded-full">
                    {debt.creditor}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openEdit(debt)}
                  className="text-yellow-400 hover:text-yellow-300 text-xs font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(debt.id)}
                  className="text-red-500 hover:text-red-400 text-xs font-medium"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-zinc-500">Progress</span>
                  <span className="text-xs font-medium text-yellow-400">
                    {pctPaid.toFixed(1)}% paid off
                  </span>
                </div>
                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full transition-all"
                    style={{ width: `${pctPaid}%` }}
                  />
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatBox label="Current Balance" value={fmt(debt.current_balance)} />
                <StatBox label="Initial Balance" value={fmt(debt.initial_balance)} />
                <StatBox label="Remaining (net)" value={fmt(remaining)} />
                <StatBox label="Savings Set Aside" value={fmt(debt.savings)} />
              </div>

              {/* Due date stats */}
              {debt.due_date && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-start">
                  <StatBox label="Due Date" value={debt.due_date} />
                  <StatBox
                    label="Months Left"
                    value={monthsLeft != null ? monthsLeft : "—"}
                  />
                  <StatBox
                    label="Balance at Due"
                    value={balanceAtDue != null ? fmt(balanceAtDue) : "—"}
                  />
                  <StatBox
                    label="Monthly Needed"
                    value={monthlyNeeded != null ? fmt(monthlyNeeded) : "—"}
                  />
                  <div className="bg-zinc-800 rounded-lg px-3 py-2 flex flex-col justify-center">
                    <p className="text-xs text-zinc-500 mb-1">Status</p>
                    {onTrack ? (
                      <span className="inline-block bg-green-500/15 text-green-400 text-xs font-semibold px-2 py-0.5 rounded">
                        On Track
                      </span>
                    ) : (
                      <span className="inline-block bg-red-500/15 text-red-400 text-xs font-semibold px-2 py-0.5 rounded">
                        At Risk
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {debt.notes && (
                <p className="text-xs text-zinc-400 border-t border-zinc-800 pt-3">
                  <span className="text-zinc-600 font-medium uppercase tracking-wide mr-1">Notes:</span>
                  {debt.notes}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {/* Add / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4 text-zinc-100">
              {editId ? "Edit Debt" : "Add Debt"}
            </h2>

            {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Car Loan"
                    className={`w-full ${inputCls}`}
                    {...field("name")}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Creditor</label>
                  <input
                    type="text"
                    placeholder="e.g. TD Bank"
                    className={`w-full ${inputCls}`}
                    {...field("creditor")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Initial Balance ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className={`w-full ${inputCls}`}
                    {...field("initial_balance")}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Current Balance ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className={`w-full ${inputCls}`}
                    {...field("current_balance")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Monthly Payment ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className={`w-full ${inputCls}`}
                    {...field("monthly_payment")}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Monthly Extra ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className={`w-full ${inputCls}`}
                    {...field("monthly_extra")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Savings Set Aside ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className={`w-full ${inputCls}`}
                    {...field("savings")}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Due Date</label>
                  <input
                    type="text"
                    placeholder="Feb 2027"
                    className={`w-full ${inputCls}`}
                    {...field("due_date")}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-500 block mb-0.5">Notes (optional)</label>
                <input
                  type="text"
                  placeholder="Any notes..."
                  className={`w-full ${inputCls}`}
                  {...field("notes")}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-yellow-400 text-black py-2 rounded-lg text-sm font-medium hover:bg-yellow-300 disabled:opacity-40"
                >
                  {saving ? "Saving..." : editId ? "Save Changes" : "Add Debt"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditId(null); setFormError(""); }}
                  className="flex-1 border border-zinc-700 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800"
                >
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

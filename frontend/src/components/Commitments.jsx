import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import {
  getRecurringBills, createRecurringBill, updateRecurringBill,
  deleteRecurringBill, getCommitments, getCategories, getDebts,
} from "../api";
import { BUCKETS, BUCKET_META } from "../constants";
import { fmt } from "../utils";

const inputCls =
  "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

const FREQUENCIES = [
  ["monthly", "Monthly"],
  ["annual", "Yearly"],
  ["quarterly", "Quarterly"],
  ["semimonthly", "Twice a month"],
  ["biweekly", "Every 2 weeks"],
  ["weekly", "Weekly"],
];

const blank = { name: "", amount: "", frequency: "monthly", category: "", due_day: "" };

/**
 * Set payments — the outflows that are decided before the month starts.
 * Debt minimums and extra principal are read from the Debts page rather than
 * re-entered here, so there is only ever one place to change them.
 */
export default function Commitments() {
  const [bills, setBills] = useState([]);
  const [committed, setCommitted] = useState(null);
  const [categories, setCategories] = useState([]);
  const [debts, setDebts] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    getRecurringBills().then(setBills).catch((e) => setError(e.message));
    getCommitments().then(setCommitted).catch(() => {});
    getDebts().then(setDebts).catch(() => setDebts([]));
  }, []);

  useEffect(() => {
    load();
    getCategories().then(setCategories).catch(() => {});
  }, [load]);

  const reset = () => { setForm(blank); setEditingId(null); };

  const submit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("A name and an amount above zero are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = {
        name: form.name.trim(),
        amount,
        frequency: form.frequency,
        category: form.category || null,
        due_day: form.due_day ? Number(form.due_day) : null,
        is_active: true,
      };
      if (editingId) await updateRecurringBill(editingId, body);
      else await createRecurringBill(body);
      reset();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const activeDebts = debts.filter((d) => (d.effective_balance ?? d.current_balance) > 0);
  const totalMonthly = committed?.total_monthly ?? 0;

  return (
    <div id="commitments" className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden scroll-mt-20">
      <div className="px-5 py-4 border-b border-zinc-700">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-zinc-300">Set payments</h2>
          <span className="text-sm font-bold text-zinc-200 tabular-nums">
            {fmt(totalMonthly)}<span className="text-xs text-zinc-500 font-normal">/mo committed</span>
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Bills that arrive on their own. These show against each bucket's target so
          you can see what is left before you spend anything. Yearly amounts are
          spread across twelve months.
        </p>
      </div>

      {committed && totalMonthly > 0 && (
        <div className="px-5 py-3 border-b border-zinc-800 flex flex-wrap gap-4">
          {BUCKETS.filter((b) => committed.totals[b] > 0).map((b) => (
            <span key={b} className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: BUCKET_META[b].fill }} />
              <span className="text-zinc-500">{BUCKET_META[b].label}</span>
              <span className="text-zinc-300 tabular-nums font-medium">{fmt(committed.totals[b])}</span>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="mx-5 mt-3 bg-red-900/20 border border-red-700/50 rounded p-3 text-sm text-red-400">{error}</div>
      )}

      <form onSubmit={submit} className="px-5 py-4 border-b border-zinc-800 bg-zinc-800/30 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-36">
          <label className="text-xs text-zinc-500 block mb-1">Name</label>
          <input className={`${inputCls} w-full`} placeholder="Mortgage"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="w-28">
          <label className="text-xs text-zinc-500 block mb-1">Amount</label>
          <input type="number" step="0.01" min="0" className={`${inputCls} w-full`} placeholder="2450"
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div className="w-36">
          <label className="text-xs text-zinc-500 block mb-1">How often</label>
          <select className={`${inputCls} w-full`} value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
            {FREQUENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="w-44">
          <label className="text-xs text-zinc-500 block mb-1">Category</label>
          <select className={`${inputCls} w-full`} value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">— pick one —</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button type="submit" disabled={busy}
          className="bg-yellow-400 text-black px-5 py-2 rounded text-sm font-medium hover:bg-yellow-300 disabled:opacity-40">
          {busy ? "Saving…" : editingId ? "Update" : "Add"}
        </button>
        {editingId && (
          <button type="button" onClick={reset} className="text-xs text-zinc-500 hover:text-zinc-300">
            Cancel
          </button>
        )}
      </form>

      <div className="divide-y divide-zinc-800">
        {bills.map((b) => (
          <div key={b.id} className="flex items-center gap-3 px-5 py-2.5">
            <span className="w-2 h-2 rounded-sm shrink-0"
              style={{ background: BUCKET_META[b.bucket]?.fill }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200 truncate">{b.name}</p>
              <p className="text-xs text-zinc-600">
                {b.category || "uncategorised"} · {BUCKET_META[b.bucket]?.short}
                {b.frequency !== "monthly" && ` · ${b.frequency}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-200 tabular-nums">{fmt(b.monthly_equivalent)}<span className="text-xs text-zinc-600">/mo</span></p>
              {b.frequency !== "monthly" && (
                <p className="text-xs text-zinc-600 tabular-nums">{fmt(b.amount)} {b.frequency}</p>
              )}
            </div>
            <button
              onClick={() => {
                setEditingId(b.id);
                setForm({
                  name: b.name, amount: String(b.amount), frequency: b.frequency,
                  category: b.category || "", due_day: b.due_day ? String(b.due_day) : "",
                });
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Edit
            </button>
            <button
              onClick={async () => {
                if (!confirm(`Remove "${b.name}"?`)) return;
                await deleteRecurringBill(b.id);
                if (editingId === b.id) reset();
                load();
              }}
              className="text-xs text-red-600 hover:text-red-400"
            >
              Delete
            </button>
          </div>
        ))}
        {bills.length === 0 && (
          <p className="px-5 py-6 text-sm text-zinc-600 text-center">
            No set payments yet. Add your mortgage, utilities and insurance here.
          </p>
        )}
      </div>

      {activeDebts.length > 0 && (
        <div className="px-5 py-4 border-t border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
            From your debts
          </p>
          <div className="space-y-1.5">
            {activeDebts.map((d) => (
              <div key={d.id} className="flex justify-between text-xs">
                <span className="text-zinc-400 truncate mr-2">{d.name}</span>
                <span className="tabular-nums space-x-3">
                  {d.monthly_payment > 0 && (
                    <span className="text-sky-400">{fmt(d.monthly_payment)} minimum</span>
                  )}
                  {d.monthly_extra > 0 && (
                    <span className="text-violet-400">{fmt(d.monthly_extra)} extra</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            Minimums count as fixed costs; extra principal counts as meaningful
            savings, because it buys down a liability. Change these on the{" "}
            <NavLink to="/debts" className="text-yellow-400 hover:text-yellow-300">Debts page</NavLink>.
          </p>
        </div>
      )}
    </div>
  );
}

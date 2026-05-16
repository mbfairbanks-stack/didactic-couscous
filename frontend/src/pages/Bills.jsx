import { useState, useEffect } from "react";
import { getBills, createBill, updateBill, deleteBill, getUpcomingBills } from "../api";

const FREQUENCIES = ["monthly", "annual", "weekly", "quarterly"];

const fmt = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

const daysColor = (days) => {
  if (days <= 3) return "text-red-400";
  if (days <= 7) return "text-yellow-400";
  return "text-zinc-400";
};

const EMPTY = { name: "", merchant: "", amount: "", frequency: "monthly", due_day: "", category: "", notes: "" };

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const [b, u] = await Promise.all([getBills(), getUpcomingBills()]);
    setBills(b);
    setUpcoming(u);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setError("");
    if (!form.name || !form.merchant || !form.amount) {
      setError("Name, merchant and amount are required.");
      return;
    }
    const body = {
      ...form,
      amount: parseFloat(form.amount),
      due_day: form.due_day ? parseInt(form.due_day) : null,
      is_active: true,
    };
    try {
      if (editId) {
        await updateBill(editId, body);
      } else {
        await createBill(body);
      }
      setForm(EMPTY);
      setEditId(null);
      setShowForm(false);
      load();
    } catch (e) {
      setError(e.message || "Failed to save bill.");
    }
  };

  const startEdit = (bill) => {
    setEditId(bill.id);
    setForm({
      name: bill.name,
      merchant: bill.merchant,
      amount: String(bill.amount),
      frequency: bill.frequency,
      due_day: bill.due_day ? String(bill.due_day) : "",
      category: bill.category || "",
      notes: bill.notes || "",
    });
    setShowForm(true);
  };

  const remove = async (id) => {
    if (!confirm("Delete this bill?")) return;
    await deleteBill(id);
    load();
  };

  const INP = "w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400";
  const SEL = "w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400";

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-yellow-400">Recurring Bills</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY); }}
          className="bg-yellow-400 text-zinc-900 px-4 py-2 rounded font-semibold text-sm hover:bg-yellow-300"
        >
          {showForm ? "Cancel" : "+ Add Bill"}
        </button>
      </div>

      {/* Upcoming bills */}
      {upcoming.length > 0 && (
        <div className="bg-zinc-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase mb-3">Upcoming</h2>
          <div className="space-y-2">
            {upcoming.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-200">{b.name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-zinc-400">{b.due_date}</span>
                  <span className={daysColor(b.days_until)}>
                    {b.days_until === 0 ? "Today" : `${b.days_until}d`}
                  </span>
                  <span className="text-yellow-400 font-mono">{fmt(b.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase">{editId ? "Edit Bill" : "New Bill"}</h2>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Name</label>
              <input className={INP} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Netflix" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Merchant</label>
              <input className={INP} value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} placeholder="NETFLIX.COM" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Amount ($)</label>
              <input className={INP} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="17.99" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Frequency</label>
              <select className={SEL} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Due Day (1–31)</label>
              <input className={INP} type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} placeholder="15" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Category</label>
              <input className={INP} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Subscriptions" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Notes</label>
            <input className={INP} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button onClick={save} className="bg-yellow-400 text-zinc-900 px-6 py-2 rounded font-semibold text-sm hover:bg-yellow-300">
            {editId ? "Save Changes" : "Add Bill"}
          </button>
        </div>
      )}

      {/* Bills list */}
      <div className="bg-zinc-800 rounded-xl divide-y divide-zinc-700">
        {bills.length === 0 ? (
          <p className="p-6 text-center text-zinc-500 text-sm">No bills tracked yet. Add your subscriptions and recurring bills.</p>
        ) : (
          bills.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-zinc-100 font-medium">{b.name}</p>
                <p className="text-xs text-zinc-500">{b.merchant} · {b.frequency}{b.due_day ? ` · due day ${b.due_day}` : ""}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-yellow-400 font-mono text-sm">{fmt(b.amount)}</span>
                <button onClick={() => startEdit(b)} className="text-xs text-zinc-400 hover:text-yellow-400">Edit</button>
                <button onClick={() => remove(b.id)} className="text-xs text-zinc-400 hover:text-red-400">Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

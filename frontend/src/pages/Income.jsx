import { useState, useEffect, useCallback } from "react";
import { getIncome, createIncome, deleteIncome, getYears } from "../api";
import { MONTH_LABELS, currentYear, currentMonth, fmt } from "../utils";

const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full";
const selectCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none";

const emptyPayday = { date: "", matt_base: "", matt_commission: "", nicole_base: "" };

export default function Income() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [years, setYears] = useState([currentYear]);
  const [records, setRecords] = useState([]);
  const [payday1, setPayday1] = useState({ ...emptyPayday });
  const [payday2, setPayday2] = useState({ ...emptyPayday });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
  }, []);

  const load = useCallback(() => {
    getIncome({ year, month }).then(setRecords);
  }, [year, month]);

  useEffect(() => { load(); setSaved(false); }, [load]);

  const savePayday = async (payday) => {
    if (!payday.date) return;
    const entries = [
      { person: "Matt", income_type: "base", amount: parseFloat(payday.matt_base) },
      { person: "Matt", income_type: "commission", amount: parseFloat(payday.matt_commission) },
      { person: "Nicole", income_type: "base", amount: parseFloat(payday.nicole_base) },
    ].filter((e) => e.amount > 0);
    for (const entry of entries) {
      await createIncome({ year, month, pay_date: payday.date, ...entry });
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
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await deleteIncome(id);
    load();
  };

  // Group records by pay_date
  const byDate = records.reduce((acc, r) => {
    const key = r.pay_date || "unspecified";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const totalIncome = records.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-100">Log Payday Income</h1>

      {/* Month selector */}
      <div className="flex gap-3 flex-wrap">
        <select className={selectCls} value={year}
          onChange={(e) => { setYear(Number(e.target.value)); setSaved(false); }}>
          {[...new Set([...years, currentYear])].sort().map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select className={selectCls} value={month}
          onChange={(e) => { setMonth(Number(e.target.value)); setSaved(false); }}>
          {MONTH_LABELS.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>

      {/* Payday entry form */}
      <form onSubmit={handleSave} className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-6">
        <h2 className="text-sm font-semibold text-zinc-300">
          Log Paydays — {MONTH_LABELS[month]} {year}
        </h2>

        {[
          { label: "Payday 1", state: payday1, setState: setPayday1 },
          { label: "Payday 2", state: payday2, setState: setPayday2 },
        ].map(({ label, state, setState }) => (
          <div key={label} className="border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest">{label}</span>
              <input type="date" className={`${inputCls} w-auto flex-1`}
                value={state.date}
                onChange={(e) => setState({ ...state, date: e.target.value })} />
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
        {saved && <p className="text-green-400 text-sm">Paydays saved for {MONTH_LABELS[month]} {year}.</p>}

        <button type="submit" disabled={saving}
          className="w-full bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300 disabled:opacity-40">
          {saving ? "Saving..." : `Save ${MONTH_LABELS[month]} ${year} Paydays`}
        </button>
      </form>

      {/* Recorded income for month */}
      {records.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-700 flex justify-between items-center bg-zinc-800">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">{MONTH_LABELS[month]} {year} — Recorded</span>
            <span className="text-sm font-bold text-yellow-400">{fmt(totalIncome)}</span>
          </div>
          {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([dateKey, entries]) => (
            <div key={dateKey} className="border-b border-zinc-800 last:border-0">
              <div className="px-4 py-2 bg-zinc-800/50">
                <span className="text-xs font-semibold text-zinc-400">
                  {dateKey === "unspecified" ? "No date" : new Date(dateKey + "T12:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className="text-xs text-zinc-600 ml-2">
                  {fmt(entries.reduce((s, r) => s + r.amount, 0))}
                </span>
              </div>
              {entries.map((r) => (
                <div key={r.id} className="px-4 py-2 flex items-center justify-between hover:bg-zinc-800">
                  <span className="text-sm text-zinc-300">{r.person}</span>
                  <span className="text-xs text-zinc-500 capitalize">{r.income_type}</span>
                  <span className="text-sm font-medium text-zinc-100">{fmt(r.amount)}</span>
                  <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:text-red-400 ml-4">Delete</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

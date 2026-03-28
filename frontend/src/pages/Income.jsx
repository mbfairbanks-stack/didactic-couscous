import { useState, useEffect, useCallback } from "react";
import { getIncome, createIncome, deleteIncome, getYears } from "../api";

const MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const fmt = (n) => "$" + Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full";

const emptyForm = {
  year: currentYear, month: currentMonth,
  matt_base: "", matt_commission: "", nicole_base: "",
};

export default function Income() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [years, setYears] = useState([currentYear]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
  }, []);

  const load = useCallback(() => {
    getIncome({ year, month }).then(setRecords);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  // Pre-fill form from loaded records
  useEffect(() => {
    const mattBase = records.find((r) => r.person === "Matt" && r.income_type === "base");
    const mattComm = records.find((r) => r.person === "Matt" && r.income_type === "commission");
    const nicole = records.find((r) => r.person === "Nicole" && r.income_type === "base");
    setForm({
      year, month,
      matt_base: mattBase ? String(mattBase.amount) : "",
      matt_commission: mattComm ? String(mattComm.amount) : "",
      nicole_base: nicole ? String(nicole.amount) : "",
    });
  }, [records, year, month]);

  // Copy amounts from previous month
  const copyFromLastMonth = async () => {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prev = await getIncome({ year: prevYear, month: prevMonth });
    const mattBase = prev.find((r) => r.person === "Matt" && r.income_type === "base");
    const mattComm = prev.find((r) => r.person === "Matt" && r.income_type === "commission");
    const nicole = prev.find((r) => r.person === "Nicole" && r.income_type === "base");
    setForm((f) => ({
      ...f,
      matt_base: mattBase ? String(mattBase.amount) : f.matt_base,
      matt_commission: mattComm ? String(mattComm.amount) : f.matt_commission,
      nicole_base: nicole ? String(nicole.amount) : f.nicole_base,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const entries = [
        { person: "Matt", income_type: "base", amount: parseFloat(form.matt_base) || 0 },
        { person: "Matt", income_type: "commission", amount: parseFloat(form.matt_commission) || 0 },
        { person: "Nicole", income_type: "base", amount: parseFloat(form.nicole_base) || 0 },
      ].filter((e) => e.amount > 0);

      for (const entry of entries) {
        await createIncome({ year: form.year, month: form.month, ...entry });
      }
      setSaved(true);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const totalIncome = records.reduce((s, r) => s + r.amount, 0);
  const selectCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none";

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-100">Log Payday Income</h1>

      {/* Month selector */}
      <div className="flex gap-3">
        <select className={selectCls} value={year} onChange={(e) => { setYear(Number(e.target.value)); setSaved(false); }}>
          {[...years, currentYear].filter((v, i, a) => a.indexOf(v) === i).sort().map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select className={selectCls} value={month} onChange={(e) => { setMonth(Number(e.target.value)); setSaved(false); }}>
          {MONTH_LABELS.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <button onClick={copyFromLastMonth} className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded px-3 py-1.5 hover:border-zinc-600">
          Copy from last month
        </button>
      </div>

      {/* Income form */}
      <form onSubmit={handleSave} className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-zinc-300">
          {MONTH_LABELS[month]} {year} Income
        </h2>

        <div className="space-y-4">
          <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Matt</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Base Pay ($)</label>
                <input type="number" step="0.01" min="0" className={inputCls}
                  placeholder="0.00"
                  value={form.matt_base}
                  onChange={(e) => setForm({ ...form, matt_base: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Commission ($)</label>
                <input type="number" step="0.01" min="0" className={inputCls}
                  placeholder="0.00"
                  value={form.matt_commission}
                  onChange={(e) => setForm({ ...form, matt_commission: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Nicole</p>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Base Pay ($)</label>
              <input type="number" step="0.01" min="0" className={inputCls}
                placeholder="0.00"
                value={form.nicole_base}
                onChange={(e) => setForm({ ...form, nicole_base: e.target.value })} />
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {saved && <p className="text-green-400 text-sm">Income saved for {MONTH_LABELS[form.month]} {form.year}.</p>}

        <button type="submit" disabled={saving}
          className="w-full bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300 disabled:opacity-40">
          {saving ? "Saving..." : `Save ${MONTH_LABELS[month]} ${year} Income`}
        </button>
      </form>

      {/* History table */}
      {records.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-700 flex justify-between items-center bg-zinc-800">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">{MONTH_LABELS[month]} {year} — Recorded Income</span>
            <span className="text-sm font-bold text-yellow-400">{fmt(totalIncome)}</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-zinc-800 last:border-0">
                  <td className="px-4 py-3 text-zinc-300">{r.person}</td>
                  <td className="px-4 py-3 text-zinc-500 capitalize">{r.income_type}</td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-100">{fmt(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

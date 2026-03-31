import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { getIncome, createIncome, deleteIncome, getYears, getTotals } from "../api";
import { MONTH_LABELS, currentYear, currentMonth, fmt } from "../utils";
import { useSettings } from "../contexts/SettingsContext";

const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full";
const selectCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none";

const emptyPayday = { label: "", date: "", p1_base: "", p1_commission: "", p2_base: "" };

// ── CPI data (Canada, 2020 = 100 base) ──────────────────────────────────────
const CPI_INDEX = { 2019: 96.5, 2020: 100, 2021: 103.4, 2022: 110.4, 2023: 114.7, 2024: 117.7, 2025: 120.4, 2026: 122.8 };
const CURRENT_CPI = 122.8;
const realIncome = (nominal, year) => nominal * (CURRENT_CPI / (CPI_INDEX[year] ?? CURRENT_CPI));

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-lg">
      <p className="font-medium text-zinc-300 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

export default function Income() {
  const { settings } = useSettings();
  const p1 = settings.person_1 || "Person 1";
  const p2 = settings.person_2 || "Person 2";
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [years, setYears] = useState([currentYear]);
  const [records, setRecords] = useState([]);
  const [payday1, setPayday1] = useState({ ...emptyPayday, label: "Payday 1" });
  const [payday2, setPayday2] = useState({ ...emptyPayday, label: "Payday 2" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Income history state
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
  }, []);

  const load = useCallback(() => {
    getIncome({ year, month }).then(setRecords);
  }, [year, month]);

  useEffect(() => { load(); setSaved(false); }, [load]);

  // Load income history for all years
  useEffect(() => {
    if (!years.length) return;
    setHistoryLoading(true);
    Promise.all(years.map((y) => getTotals(y, null, 12).then((t) => ({ year: y, income: t.total_income ?? 0 }))))
      .then((results) => setHistoryData(results.sort((a, b) => a.year - b.year)))
      .finally(() => setHistoryLoading(false));
  }, [years]);

  const savePayday = async (payday) => {
    if (!payday.date) return;
    const entries = [
      { person: p1, income_type: "base", amount: parseFloat(payday.p1_base) },
      { person: p1, income_type: "commission", amount: parseFloat(payday.p1_commission) },
      { person: p2, income_type: "base", amount: parseFloat(payday.p2_base) },
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
      // Refresh history after saving
      setHistoryLoading(true);
      Promise.all(years.map((y) => getTotals(y, null, 12).then((t) => ({ year: y, income: t.total_income ?? 0 }))))
        .then((results) => setHistoryData(results.sort((a, b) => a.year - b.year)))
        .finally(() => setHistoryLoading(false));
    } catch (err) {
      setError(err.message);
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

  // History chart + table data
  const chartData = historyData.map((d) => ({
    year: String(d.year),
    Income: d.income,
    "Real Income": Math.round(realIncome(d.income, d.year)),
  }));

  const tableRows = historyData.map((d, i) => {
    const prev = i > 0 ? historyData[i - 1].income : null;
    const yoyPct = prev && prev > 0 ? ((d.income - prev) / prev) * 100 : null;
    return { year: d.year, income: d.income, realIncome: realIncome(d.income, d.year), yoyPct };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Income</h1>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Payday entry form */}
        <form onSubmit={handleSave} className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-zinc-300">
            Log Paydays — {MONTH_LABELS[month]} {year}
          </h2>

          {[
            { fallback: "Payday 1", state: payday1, setState: setPayday1 },
            { fallback: "Payday 2", state: payday2, setState: setPayday2 },
          ].map(({ fallback, state, setState }) => (
            <div key={fallback} className="border border-zinc-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="bg-transparent border-b border-zinc-700 focus:border-yellow-400 text-xs font-bold text-yellow-400 uppercase tracking-widest w-28 focus:outline-none pb-0.5 transition-colors"
                  value={state.label}
                  placeholder={fallback}
                  onChange={(e) => setState({ ...state, label: e.target.value })}
                />
                <input type="date" className={`${inputCls} w-auto flex-1`}
                  value={state.date}
                  onChange={(e) => setState({ ...state, date: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">{p1} Base ($)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    className={inputCls} value={state.p1_base}
                    onChange={(e) => setState({ ...state, p1_base: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">{p1} Commission ($)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    className={inputCls} value={state.p1_commission}
                    onChange={(e) => setState({ ...state, p1_commission: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">{p2} Base ($)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00"
                    className={inputCls} value={state.p2_base}
                    onChange={(e) => setState({ ...state, p2_base: e.target.value })} />
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
                    <span className="text-sm text-zinc-300">
                      {r.person === "Person 1" ? p1 : r.person === "Person 2" ? p2 : r.person}
                    </span>
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

      {/* Income History */}
      {!historyLoading && historyData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Income History</h2>

          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#71717a" }}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
              <Bar dataKey="Income" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Real Income" fill="#22c55e" fillOpacity={0.4} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="text-left pb-2 pr-4 font-semibold">Year</th>
                  <th className="text-right pb-2 pr-4 font-semibold">Income</th>
                  <th className="text-right pb-2 pr-4 font-semibold">Real Income (2026 $)</th>
                  <th className="text-right pb-2 font-semibold">YoY Change</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.year} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                    <td className="py-2.5 pr-4 text-zinc-300 font-medium">{r.year}</td>
                    <td className="py-2.5 pr-4 text-right text-zinc-100">{fmt(r.income)}</td>
                    <td className="py-2.5 pr-4 text-right text-zinc-400">{fmt(Math.round(r.realIncome))}</td>
                    <td className="py-2.5 text-right">
                      {r.yoyPct === null ? (
                        <span className="text-zinc-600">—</span>
                      ) : (
                        <span className={r.yoyPct >= 0 ? "text-green-400" : "text-red-400"}>
                          {r.yoyPct >= 0 ? "+" : ""}{r.yoyPct.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

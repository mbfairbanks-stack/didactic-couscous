import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { getIncome, createIncome, updateIncome, deleteIncome, getYears, getTotals } from "../api";
import { MONTH_LABELS, currentYear, currentMonth, fmt } from "../utils";
import { useSettings } from "../contexts/SettingsContext";

const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full";
const selectCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none";
const smallInput = `${inputCls} text-xs py-1`;

const MATCH_RATE = 0.50;
const ESPP_RATE = 0.10;

const CPI_INDEX = { 2019: 96.5, 2020: 100, 2021: 103.4, 2022: 110.4, 2023: 114.7, 2024: 117.7, 2025: 120.4, 2026: 122.8 };
const CURRENT_CPI = 122.8;
const realIncome = (nominal, year) => nominal * (CURRENT_CPI / (CPI_INDEX[year] ?? CURRENT_CPI));

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs shadow-lg">
      <p className="font-medium text-zinc-300 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

const emptyPayday = () => ({
  _key: Math.random(),
  label: "",
  date: "",
  p1_base: "", p1_commission: "",
  p1_rrsp_employee: "", p1_rrsp_employer: "", p1_espp: "",
  p2_base: "",
  p2_rrsp_employee: "", p2_rrsp_employer: "",
});

// Convert existing DB records for a pay_date into payday form state
function recordsToPayday(dateKey, entries, p1Name, p2Name) {
  const find = (person, type) => entries.find((r) => r.person === person && r.income_type === type);
  const findByType = (person, type) => entries.find(
    (r) => (r.person === person || r.person === p1Name || r.person === p2Name) &&
            r.income_type === type && r.person === person
  );
  const p1b = find(p1Name, "base") || find("Person 1", "base");
  const p1c = find(p1Name, "commission") || find("Person 1", "commission");
  const p2b = find(p2Name, "base") || find("Person 2", "base");

  return {
    _key: Math.random(),
    label: "",
    date: dateKey,
    p1_base: p1b ? String(p1b.amount) : "",
    p1_commission: p1c ? String(p1c.amount) : "",
    p1_rrsp_employee: p1b ? String(p1b.rrsp_employee || "") : "",
    p1_rrsp_employer: p1b ? String(p1b.rrsp_employer || "") : "",
    p1_espp: p1b ? String(p1b.espp_deduction || "") : "",
    p2_base: p2b ? String(p2b.amount) : "",
    p2_rrsp_employee: p2b ? String(p2b.rrsp_employee || "") : "",
    p2_rrsp_employer: p2b ? String(p2b.rrsp_employer || "") : "",
    _existingRecords: entries,
  };
}

function PaydaySlot({ state, onChange, onRemove, p1, p2, canRemove, isEdit = false }) {
  const handleP1BaseChange = (val) => {
    const base = parseFloat(val) || 0;
    const commission = parseFloat(state.p1_commission) || 0;
    const gross = base + commission;
    onChange({
      ...state, p1_base: val,
      p1_espp: gross > 0 ? String((gross * ESPP_RATE).toFixed(2)) : state.p1_espp,
    });
  };

  const handleP1CommissionChange = (val) => {
    const base = parseFloat(state.p1_base) || 0;
    const commission = parseFloat(val) || 0;
    const gross = base + commission;
    onChange({
      ...state, p1_commission: val,
      p1_espp: gross > 0 ? String((gross * ESPP_RATE).toFixed(2)) : state.p1_espp,
    });
  };

  const handleP1RrspChange = (val) => {
    const v = parseFloat(val) || 0;
    onChange({
      ...state,
      p1_rrsp_employee: val,
      p1_rrsp_employer: v > 0 ? String((v * MATCH_RATE).toFixed(2)) : "",
    });
  };

  const handleP2RrspChange = (val) => {
    const v = parseFloat(val) || 0;
    onChange({
      ...state,
      p2_rrsp_employee: val,
      p2_rrsp_employer: v > 0 ? String((v * MATCH_RATE).toFixed(2)) : "",
    });
  };

  return (
    <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2">
        {!isEdit && (
          <input
            type="text"
            className="bg-transparent border-b border-zinc-700 focus:border-yellow-400 text-xs font-bold text-yellow-400 uppercase tracking-widest w-24 focus:outline-none pb-0.5 transition-colors"
            value={state.label}
            placeholder="Label"
            onChange={(e) => onChange({ ...state, label: e.target.value })}
          />
        )}
        <input type="date" className={`${inputCls} flex-1`}
          value={state.date}
          onChange={(e) => onChange({ ...state, date: e.target.value })} />
        {canRemove && !isEdit && (
          <button type="button" onClick={onRemove}
            className="text-zinc-600 hover:text-red-400 text-xs px-2 transition-colors">
            ✕
          </button>
        )}
      </div>

      {/* Person 1 */}
      <div className="bg-zinc-800/40 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{p1}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Base ($)</label>
            <input type="number" step="0.01" min="0" placeholder="0.00"
              className={smallInput} value={state.p1_base}
              onChange={(e) => handleP1BaseChange(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Commission ($)</label>
            <input type="number" step="0.01" min="0" placeholder="0.00"
              className={smallInput} value={state.p1_commission}
              onChange={(e) => handleP1CommissionChange(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-blue-400 block mb-1">RRSP ($)</label>
            <input type="number" step="0.01" min="0" placeholder="0.00"
              className={smallInput} value={state.p1_rrsp_employee}
              onChange={(e) => handleP1RrspChange(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-green-400 block mb-1">Match (auto 50%)</label>
            <input type="number" step="0.01" min="0" placeholder="auto"
              className={smallInput} value={state.p1_rrsp_employer}
              onChange={(e) => onChange({ ...state, p1_rrsp_employer: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-purple-400 block mb-1">ESPP (auto 10%)</label>
            <input type="number" step="0.01" min="0" placeholder="auto"
              className={smallInput} value={state.p1_espp}
              onChange={(e) => onChange({ ...state, p1_espp: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Person 2 */}
      <div className="bg-zinc-800/40 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{p2}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Base ($)</label>
            <input type="number" step="0.01" min="0" placeholder="0.00"
              className={smallInput} value={state.p2_base}
              onChange={(e) => onChange({ ...state, p2_base: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2 col-span-1">
            <div>
              <label className="text-xs text-blue-400 block mb-1">RRSP ($)</label>
              <input type="number" step="0.01" min="0" placeholder="0.00"
                className={smallInput} value={state.p2_rrsp_employee}
                onChange={(e) => handleP2RrspChange(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-green-400 block mb-1">Match (50%)</label>
              <input type="number" step="0.01" min="0" placeholder="auto"
                className={smallInput} value={state.p2_rrsp_employer}
                onChange={(e) => onChange({ ...state, p2_rrsp_employer: e.target.value })} />
            </div>
          </div>
        </div>
      </div>
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
  const [paydays, setPaydays] = useState([emptyPayday()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Edit modal
  const [editPayday, setEditPayday] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Income history
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
  }, []);

  const load = useCallback(() => {
    getIncome({ year, month }).then(setRecords);
  }, [year, month]);

  useEffect(() => { load(); setSaved(false); }, [load]);

  useEffect(() => {
    if (!years.length) return;
    setHistoryLoading(true);
    Promise.all(years.map((y) => getTotals(y, null, 12).then((t) => ({ year: y, income: t.total_income ?? 0 }))))
      .then((results) => setHistoryData(results.sort((a, b) => a.year - b.year)))
      .finally(() => setHistoryLoading(false));
  }, [years]);

  // Resolve person name for DB comparison (handles old data saved as "Person 1")
  const resolvePerson = (dbPerson) => {
    if (dbPerson === p1 || dbPerson === "Person 1") return p1;
    if (dbPerson === p2 || dbPerson === "Person 2") return p2;
    return dbPerson;
  };

  const savePaydayEntries = async (payday, existingRecords = []) => {
    const entries = [
      {
        person: p1, income_type: "base",
        amount: parseFloat(payday.p1_base) || 0,
        rrsp_employee: parseFloat(payday.p1_rrsp_employee) || 0,
        rrsp_employer: parseFloat(payday.p1_rrsp_employer) || 0,
        espp_deduction: parseFloat(payday.p1_espp) || 0,
      },
      {
        person: p1, income_type: "commission",
        amount: parseFloat(payday.p1_commission) || 0,
        rrsp_employee: 0, rrsp_employer: 0, espp_deduction: 0,
      },
      {
        person: p2, income_type: "base",
        amount: parseFloat(payday.p2_base) || 0,
        rrsp_employee: parseFloat(payday.p2_rrsp_employee) || 0,
        rrsp_employer: parseFloat(payday.p2_rrsp_employer) || 0,
        espp_deduction: 0,
      },
    ];

    for (const entry of entries) {
      const existing = existingRecords.find(
        (r) => resolvePerson(r.person) === entry.person && r.income_type === entry.income_type
      );
      const hasValue = entry.amount > 0 || entry.rrsp_employee > 0 || entry.espp_deduction > 0;
      if (existing) {
        if (hasValue) {
          await updateIncome(existing.id, { year, month, pay_date: payday.date, ...entry });
        } else {
          await deleteIncome(existing.id);
        }
      } else if (hasValue) {
        await createIncome({ year, month, pay_date: payday.date, ...entry });
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const valid = paydays.filter((p) => p.date);
    if (!valid.length) { setError("Enter at least one payday date."); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      for (const pd of valid) {
        await savePaydayEntries(pd);
      }
      setSaved(true);
      setPaydays([emptyPayday()]);
      load();
      setHistoryLoading(true);
      Promise.all(years.map((y) => getTotals(y, null, 12).then((t) => ({ year: y, income: t.total_income ?? 0 }))))
        .then((r) => setHistoryData(r.sort((a, b) => a.year - b.year)))
        .finally(() => setHistoryLoading(false));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editPayday.date) { setEditError("Date is required."); return; }
    setEditSaving(true); setEditError("");
    try {
      await savePaydayEntries(editPayday, editPayday._existingRecords || []);
      setEditPayday(null);
      load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeletePayday = async (entries) => {
    if (!confirm(`Delete all ${entries.length} records for ${entries[0].pay_date}?`)) return;
    for (const r of entries) await deleteIncome(r.id);
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
        <form onSubmit={handleSave} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300">
              Log Paydays — {MONTH_LABELS[month]} {year}
            </h2>
            <span className="text-xs text-zinc-600">{paydays.length} payday{paydays.length !== 1 ? "s" : ""}</span>
          </div>

          {paydays.map((pd, idx) => (
            <PaydaySlot
              key={pd._key}
              state={pd}
              onChange={(updated) => setPaydays((prev) => prev.map((p) => p._key === pd._key ? updated : p))}
              onRemove={() => setPaydays((prev) => prev.filter((p) => p._key !== pd._key))}
              canRemove={paydays.length > 1}
              p1={p1} p2={p2}
            />
          ))}

          <button
            type="button"
            onClick={() => setPaydays((prev) => [...prev, emptyPayday()])}
            className="w-full border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 text-sm py-2.5 rounded-lg transition-colors"
          >
            + Add Payday
          </button>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {saved && <p className="text-green-400 text-sm">Paydays saved for {MONTH_LABELS[month]} {year}.</p>}

          <button type="submit" disabled={saving}
            className="w-full bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300 disabled:opacity-40">
            {saving ? "Saving..." : `Save ${MONTH_LABELS[month]} ${year} Paydays`}
          </button>
        </form>

        {/* Recorded income for month */}
        {records.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-700 flex justify-between items-center bg-zinc-800">
              <span className="text-xs text-zinc-500 uppercase tracking-wide">{MONTH_LABELS[month]} {year} — Recorded</span>
              <span className="text-sm font-bold text-yellow-400">{fmt(totalIncome)}</span>
            </div>
            {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([dateKey, entries]) => {
              const dateTotal = entries.reduce((s, r) => s + r.amount, 0);
              const hasRrsp = entries.some((r) => (r.rrsp_employee || 0) > 0);
              const hasEspp = entries.some((r) => (r.espp_deduction || 0) > 0);
              const totalRrsp = entries.reduce((s, r) => s + (r.rrsp_employee || 0) + (r.rrsp_employer || 0), 0);
              const totalEspp = entries.reduce((s, r) => s + (r.espp_deduction || 0), 0);
              return (
                <div key={dateKey} className="border-b border-zinc-800 last:border-0">
                  <div className="px-4 py-2 bg-zinc-800/50 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-400">
                      {dateKey === "unspecified" ? "No date" : new Date(dateKey + "T12:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <div className="flex items-center gap-3">
                      {hasRrsp && <span className="text-xs text-blue-400">RRSP {fmt(totalRrsp)}</span>}
                      {hasEspp && <span className="text-xs text-purple-400">ESPP {fmt(totalEspp)}</span>}
                      <span className="text-xs text-zinc-400 font-medium">{fmt(dateTotal)}</span>
                      <button
                        onClick={() => setEditPayday(recordsToPayday(dateKey, entries, p1, p2))}
                        className="text-xs text-yellow-500 hover:text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/30 hover:border-yellow-400/50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeletePayday(entries)}
                        className="text-xs text-red-600 hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {entries.map((r) => (
                    <div key={r.id} className="px-4 py-1.5 flex items-center justify-between hover:bg-zinc-800 text-xs">
                      <span className="text-zinc-400">
                        {resolvePerson(r.person)}
                      </span>
                      <span className="text-zinc-600 capitalize">{r.income_type}</span>
                      {(r.rrsp_employee || 0) > 0 && (
                        <span className="text-blue-400">RRSP {fmt(r.rrsp_employee)}</span>
                      )}
                      {(r.rrsp_employer || 0) > 0 && (
                        <span className="text-green-400">+{fmt(r.rrsp_employer)}</span>
                      )}
                      {(r.espp_deduction || 0) > 0 && (
                        <span className="text-purple-400">ESPP {fmt(r.espp_deduction)}</span>
                      )}
                      <span className="text-zinc-100 font-medium">{fmt(r.amount)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Income History */}
      {!historyLoading && historyData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-6">
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

      {/* Edit Payday Modal */}
      {editPayday && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-1 text-zinc-100">Edit Payday</h2>
            <p className="text-xs text-zinc-500 mb-4">
              {editPayday.date ? new Date(editPayday.date + "T12:00:00").toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""}
            </p>
            {editError && <p className="text-red-400 text-sm mb-3">{editError}</p>}
            <form onSubmit={handleEditSave} className="space-y-4">
              <PaydaySlot
                state={editPayday}
                onChange={setEditPayday}
                canRemove={false}
                p1={p1} p2={p2}
                isEdit={true}
              />
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={editSaving}
                  className="flex-1 bg-yellow-400 text-black py-2.5 rounded-lg text-sm font-medium hover:bg-yellow-300 disabled:opacity-40">
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
                <button type="button" onClick={() => { setEditPayday(null); setEditError(""); }}
                  className="flex-1 border border-zinc-700 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800">
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

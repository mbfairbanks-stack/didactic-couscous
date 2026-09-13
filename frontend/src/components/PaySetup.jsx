import { useState, useEffect, useCallback } from "react";
import {
  getPaySchedules, savePaySchedule, deletePaySchedule, getIncomeProjection,
} from "../api";
import { useSettings } from "../contexts/SettingsContext";
import { MONTH_LABELS, currentYear, currentMonth, fmt } from "../utils";

const inputCls =
  "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

const FREQUENCIES = [
  { value: "biweekly", label: "Every 2 weeks", note: "26 pays a year — some months get 3" },
  { value: "semimonthly", label: "Twice a month", note: "24 pays — 15th and month-end" },
  { value: "weekly", label: "Weekly", note: "52 pays a year" },
  { value: "monthly", label: "Monthly", note: "12 pays a year" },
];

const blank = (person) => ({
  person,
  gross_per_pay: "",
  net_per_pay: "",
  frequency: "biweekly",
  anchor_date: "",
  rrsp_employee_per_pay: "",
  rrsp_employer_per_pay: "",
  espp_per_pay: "",
  is_active: true,
});

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function ScheduleForm({ person, existing, onSaved }) {
  const [form, setForm] = useState(() => (existing ? {
    ...existing,
    gross_per_pay: String(existing.gross_per_pay ?? ""),
    net_per_pay: String(existing.net_per_pay ?? ""),
    rrsp_employee_per_pay: String(existing.rrsp_employee_per_pay ?? ""),
    rrsp_employer_per_pay: String(existing.rrsp_employer_per_pay ?? ""),
    espp_per_pay: String(existing.espp_per_pay ?? ""),
    anchor_date: existing.anchor_date || "",
  } : blank(person)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (existing) setForm((f) => ({ ...f, ...existing, person }));
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const gross = num(form.gross_per_pay);
  const net = num(form.net_per_pay);
  const deductions = gross - net;
  const perYear = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }[form.frequency] || 26;
  const monthlyNet = (net * perYear) / 12;

  const save = async () => {
    if (!form.anchor_date && form.frequency === "biweekly") {
      setError("A recent payday is needed for every-2-weeks pay — it sets which months get three.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await savePaySchedule({
        person,
        gross_per_pay: gross,
        net_per_pay: net,
        frequency: form.frequency,
        anchor_date: form.anchor_date || null,
        rrsp_employee_per_pay: num(form.rrsp_employee_per_pay),
        rrsp_employer_per_pay: num(form.rrsp_employer_per_pay),
        espp_per_pay: num(form.espp_per_pay),
        is_active: true,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, placeholder, hint) => (
    <div>
      <label className="text-xs text-zinc-500 block mb-1">{label}</label>
      <input
        type="number" step="0.01" min="0" placeholder={placeholder}
        className={`${inputCls} w-full`}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
      {hint && <p className="text-[11px] text-zinc-600 mt-0.5">{hint}</p>}
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">{person}</h3>
        {existing && (
          <button
            onClick={async () => {
              if (!confirm(`Remove the pay schedule for ${person}?`)) return;
              await deletePaySchedule(existing.id);
              onSaved();
            }}
            className="text-xs text-red-600 hover:text-red-400"
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">How often</label>
          <select className={`${inputCls} w-full`} value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
            {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <p className="text-[11px] text-zinc-600 mt-0.5">
            {FREQUENCIES.find((f) => f.value === form.frequency)?.note}
          </p>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">
            A recent payday{form.frequency === "biweekly" ? "" : " (optional)"}
          </label>
          <input type="date" className={`${inputCls} w-full`} value={form.anchor_date}
            onChange={(e) => setForm({ ...form, anchor_date: e.target.value })} />
          <p className="text-[11px] text-zinc-600 mt-0.5">Sets which months land three pays.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field("gross_per_pay", "Gross per pay", "3,000.00", "Before anything comes off")}
        {field("net_per_pay", "Take-home per pay", "2,000.00", "What hits the bank")}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {field("rrsp_employee_per_pay", "RRSP per pay", "150.00", "Your contribution")}
        {field("rrsp_employer_per_pay", "Employer match", "75.00", "Not counted in the plan")}
        {field("espp_per_pay", "ESPP per pay", "100.00", "Stock purchase deduction")}
      </div>

      {gross > 0 && net > 0 && (
        <div className="bg-zinc-800/50 rounded-lg px-4 py-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-zinc-500">Deductions per pay</span>
            <span className="text-zinc-300 tabular-nums">
              {fmt(deductions)} ({gross > 0 ? Math.round((deductions / gross) * 100) : 0}%)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Take-home per month (average)</span>
            <span className="text-green-400 font-semibold tabular-nums">{fmt(monthlyNet)}</span>
          </div>
          {net > gross && (
            <p className="text-yellow-400">Take-home is larger than gross — check those two figures.</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || !gross}
          className="bg-yellow-400 text-black px-5 py-2 rounded text-sm font-medium hover:bg-yellow-300 disabled:opacity-40">
          {saving ? "Saving…" : existing ? "Update" : "Save schedule"}
        </button>
        {saved && <span className="text-green-400 text-sm">Saved!</span>}
      </div>
    </div>
  );
}

/** Recurring pay per person, plus what it projects for the current month. */
export default function PaySetup() {
  const { settings } = useSettings();
  const [schedules, setSchedules] = useState([]);
  const [projection, setProjection] = useState(null);

  const people = [settings.person_1, settings.person_2].filter(
    (p) => p && !/^Person [12]$/.test(p)
  );
  const names = people.length ? people : ["Person 1", "Person 2"];

  const load = useCallback(() => {
    getPaySchedules().then(setSchedules).catch(() => {});
    getIncomeProjection(currentYear, currentMonth).then(setProjection).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const byPerson = Object.fromEntries(schedules.map((s) => [s.person, s]));

  return (
    <div id="schedule" className="space-y-4 scroll-mt-20">
      <div>
        <h2 className="text-sm font-semibold text-zinc-300">Pay setup</h2>
        <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
          Recurring pay, so the bucket plan works before payday. Entered paycheques
          always win — this only fills in the pays that have not happened yet.
          Take-home is the number the plan divides up, so it is the one worth
          getting right.
        </p>
      </div>

      {projection && projection.gross > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
            {MONTH_LABELS[currentMonth]} {currentYear} projection
          </p>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-zinc-500">Gross</p>
              <p className="text-lg font-bold text-zinc-200 tabular-nums">{fmt(projection.gross)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Take-home</p>
              <p className="text-lg font-bold text-green-400 tabular-nums">{fmt(projection.net)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">To savings at source</p>
              <p className="text-lg font-bold text-violet-400 tabular-nums">
                {fmt(projection.payroll_rrsp_employee + projection.payroll_espp)}
              </p>
            </div>
          </div>
          {projection.people?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
              {projection.people.map((p) => (
                <div key={p.person} className="flex justify-between text-xs">
                  <span className="text-zinc-400">
                    {p.person}
                    <span className="text-zinc-600 ml-2">
                      {p.source === "recorded" ? `${p.recorded_pays} pay${p.recorded_pays === 1 ? "" : "s"} entered`
                        : p.source === "mixed" ? `${p.recorded_pays} of ${p.expected_pays} entered, rest projected`
                        : p.source === "schedule" ? `${p.expected_pays} pay${p.expected_pays === 1 ? "" : "s"} projected`
                        : "from recent months"}
                    </span>
                  </span>
                  <span className="text-zinc-300 tabular-nums">{fmt(p.net)} take-home</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {names.map((person) => (
        <ScheduleForm key={person} person={person} existing={byPerson[person]} onSaved={load} />
      ))}
    </div>
  );
}

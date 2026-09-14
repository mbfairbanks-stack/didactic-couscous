import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  updateSettings, savePaySchedule, saveBucketPlan, parseCsv, importCsvRows,
} from "../api";
import { useSettings } from "../contexts/SettingsContext";
import { BUCKETS, BUCKET_META } from "../constants";
import { fmt } from "../utils";

/**
 * Four steps, in the order the app needs them: who you are, what comes in,
 * how it should be divided, and what has been spent. Finishing leaves a
 * populated bucket plan rather than an empty shell.
 */
const STEPS = ["Household", "Pay", "Plan", "Transactions"];

const FREQUENCIES = [
  ["biweekly", "Every 2 weeks"],
  ["semimonthly", "Twice a month"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
];

const PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const DEFAULT_PLAN = { fixed: 55, short_term: 10, meaningful: 15, guilt_free: 20 };

const input =
  "w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400";

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const blankPerson = () => ({
  name: "", gross_per_pay: "", net_per_pay: "",
  frequency: "biweekly", anchor_date: "", rrsp: "", espp: "",
});

export default function Onboarding() {
  const navigate = useNavigate();
  const { refresh } = useSettings();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [household, setHousehold] = useState("");
  const [people, setPeople] = useState([blankPerson(), blankPerson()]);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState(null);
  const [parsing, setParsing] = useState(false);

  const setPerson = (i, patch) =>
    setPeople((ps) => ps.map((p, j) => (i === j ? { ...p, ...patch } : p)));

  const named = people.filter((p) => p.name.trim());
  const monthlyNet = named.reduce(
    (s, p) => s + (num(p.net_per_pay) * (PER_YEAR[p.frequency] || 26)) / 12, 0
  );
  const monthlyPayrollSavings = named.reduce(
    (s, p) => s + ((num(p.rrsp) + num(p.espp)) * (PER_YEAR[p.frequency] || 26)) / 12, 0
  );
  const planBase = monthlyNet + monthlyPayrollSavings;
  const planTotal = BUCKETS.reduce((s, b) => s + Number(plan[b] || 0), 0);

  const skip = async () => {
    await updateSettings({ onboarding_complete: "true" }).catch(() => {});
    await refresh();
    navigate("/buckets", { replace: true });
  };

  const parsePaste = async () => {
    if (!paste.trim()) return;
    setParsing(true);
    setError("");
    try {
      const res = await parseCsv({ csv_text: paste, format: "auto" });
      const rows = (res.rows || []).map((r) => ({
        ...r, category: r.suggested_category || "",
      }));
      setParsed(rows);
      if (!rows.length) setError("No transactions found in that paste. You can skip this and add them later.");
    } catch (e) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    setError("");
    try {
      await updateSettings({
        household_name: household.trim() || "My Budget",
        person_1: people[0].name.trim() || "Person 1",
        person_2: people[1].name.trim() || "Person 2",
        onboarding_complete: "true",
      });

      for (const p of named) {
        if (!num(p.gross_per_pay) && !num(p.net_per_pay)) continue;
        await savePaySchedule({
          person: p.name.trim(),
          gross_per_pay: num(p.gross_per_pay),
          net_per_pay: num(p.net_per_pay),
          frequency: p.frequency,
          anchor_date: p.anchor_date || null,
          rrsp_employee_per_pay: num(p.rrsp),
          rrsp_employer_per_pay: 0,
          espp_per_pay: num(p.espp),
          is_active: true,
        }).catch(() => {});
      }

      await saveBucketPlan(plan).catch(() => {});

      if (parsed?.length) {
        await importCsvRows({ rows: parsed.filter((r) => !r.is_duplicate) }).catch(() => {});
      }

      await refresh();
      navigate("/buckets", { replace: true });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const canAdvance =
    step === 1 ? true
    : step === 2 ? true
    : step === 3 ? planTotal > 0
    : true;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex gap-2">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
              i + 1 <= step ? "bg-yellow-400" : "bg-zinc-800"}`} />
          ))}
        </div>
        <div className="flex justify-between items-center">
          <p className="text-xs text-zinc-600">
            Step {step} of {STEPS.length} — {STEPS[step - 1]}
          </p>
          <button onClick={skip} className="text-xs text-zinc-600 hover:text-zinc-400">
            Skip setup →
          </button>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
          {step === 1 && (
            <>
              <div>
                <h1 className="text-xl font-bold text-zinc-100">Who is this for?</h1>
                <p className="text-sm text-zinc-500 mt-1">
                  This app splits your money into four buckets: fixed costs, short-term
                  savings, meaningful savings, and guilt-free spending. Three short
                  steps and it will be running.
                </p>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Household name</label>
                <input className={input} placeholder="The Smiths"
                  value={household} onChange={(e) => setHousehold(e.target.value)} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {people.map((p, i) => (
                  <div key={i}>
                    <label className="text-xs text-zinc-500 block mb-1">
                      {i === 0 ? "First person" : "Second person (optional)"}
                    </label>
                    <input className={input} placeholder={i === 0 ? "Alex" : "Sam"}
                      value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} />
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h1 className="text-xl font-bold text-zinc-100">What comes in?</h1>
                <p className="text-sm text-zinc-500 mt-1">
                  Take-home is the number the plan divides up, so it matters most.
                  You can change all of this later, and entered paycheques always
                  override these figures.
                </p>
              </div>
              {named.length === 0 && (
                <p className="text-sm text-yellow-400">
                  Go back and name at least one person to set up pay.
                </p>
              )}
              {people.map((p, i) => p.name.trim() && (
                <div key={i} className="bg-zinc-800/40 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{p.name}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">How often</label>
                      <select className={input} value={p.frequency}
                        onChange={(e) => setPerson(i, { frequency: e.target.value })}>
                        {FREQUENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">A recent payday</label>
                      <input type="date" className={input} value={p.anchor_date}
                        onChange={(e) => setPerson(i, { anchor_date: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Gross per pay</label>
                      <input type="number" step="0.01" className={input} placeholder="3,000"
                        value={p.gross_per_pay}
                        onChange={(e) => setPerson(i, { gross_per_pay: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-green-500 block mb-1">Take-home per pay</label>
                      <input type="number" step="0.01" className={input} placeholder="2,000"
                        value={p.net_per_pay}
                        onChange={(e) => setPerson(i, { net_per_pay: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-blue-400 block mb-1">RRSP per pay</label>
                      <input type="number" step="0.01" className={input} placeholder="0"
                        value={p.rrsp} onChange={(e) => setPerson(i, { rrsp: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-purple-400 block mb-1">ESPP per pay</label>
                      <input type="number" step="0.01" className={input} placeholder="0"
                        value={p.espp} onChange={(e) => setPerson(i, { espp: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
              {planBase > 0 && (
                <p className="text-sm text-zinc-400">
                  That is <span className="text-yellow-400 font-semibold">{fmt(planBase)}/mo</span> to
                  divide into buckets.
                </p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h1 className="text-xl font-bold text-zinc-100">How should it split?</h1>
                <p className="text-sm text-zinc-500 mt-1">
                  A share of everything coming in. The defaults are a reasonable
                  starting point — drag them to match your situation.
                </p>
              </div>
              <div className="space-y-3">
                {BUCKETS.map((b) => (
                  <div key={b}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${BUCKET_META[b].tone}`}>
                        {BUCKET_META[b].label}
                      </span>
                      <span className="text-xs text-zinc-400 tabular-nums">
                        {plan[b]}%{planBase > 0 && ` · ${fmt((planBase * plan[b]) / 100)}/mo`}
                      </span>
                    </div>
                    <input type="range" min={0} max={100} value={plan[b]}
                      onChange={(e) => setPlan({ ...plan, [b]: Number(e.target.value) })}
                      className="w-full accent-yellow-400" />
                    <p className="text-[11px] text-zinc-600">{BUCKET_META[b].blurb}</p>
                  </div>
                ))}
              </div>
              <p className={`text-sm ${Math.round(planTotal) === 100 ? "text-green-400" : "text-yellow-400"}`}>
                Total {planTotal}%{Math.round(planTotal) !== 100 && " — anything off 100% shows as unallocated"}
              </p>
            </>
          )}

          {step === 4 && (
            <>
              <div>
                <h1 className="text-xl font-bold text-zinc-100">Add some spending</h1>
                <p className="text-sm text-zinc-500 mt-1">
                  Paste a few rows from your bank or card statement so the buckets
                  have something in them. Optional — you can do this any time from
                  the Add page.
                </p>
              </div>
              <textarea
                rows={7}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-yellow-400/60"
                placeholder={"2026-01-15,Tim Hortons,4.75\n2026-01-16,Loblaws,142.55"}
                value={paste}
                onChange={(e) => { setPaste(e.target.value); setParsed(null); }}
              />
              {parsed ? (
                <p className="text-sm text-green-400">
                  {parsed.length} transaction{parsed.length === 1 ? "" : "s"} ready to import.
                </p>
              ) : (
                <button onClick={parsePaste} disabled={parsing || !paste.trim()}
                  className="bg-zinc-700 text-zinc-100 px-4 py-2 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-40">
                  {parsing ? "Reading…" : "Read it"}
                </button>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)}
                className="text-sm text-zinc-500 hover:text-zinc-300">
                Back
              </button>
            )}
            <div className="flex-1" />
            {step < STEPS.length ? (
              <button onClick={() => setStep(step + 1)} disabled={!canAdvance}
                className="bg-yellow-400 text-zinc-900 px-6 py-2 rounded-lg font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40">
                Next →
              </button>
            ) : (
              <button onClick={finish} disabled={saving}
                className="bg-yellow-400 text-zinc-900 px-6 py-2 rounded-lg font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40">
                {saving ? "Setting up…" : "Finish"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

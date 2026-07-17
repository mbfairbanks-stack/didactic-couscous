import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import {
  getRetirementSummary,
  getRetirementProfiles, upsertRetirementProfile, deleteRetirementProfile,
  getRsuGrants, createRsuGrant, updateRsuGrant, deleteRsuGrant,
  getRetentionBonuses, createRetentionBonus, updateRetentionBonus, deleteRetentionBonus,
  getRetirementGoals, createRetirementGoal, updateRetirementGoal, deleteRetirementGoal,
} from "../api";
import { project, findRetirementYear, rsuAfterTax, allocate } from "../lib/retirementEngine";
import { fmt, currentYear } from "../utils";
import { useAuth } from "../contexts/AuthContext";

const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50 w-full";
const labelCls = "block text-xs text-zinc-500 mb-1";
const cardCls = "bg-zinc-900 border border-zinc-800 rounded-xl p-4";

function Tab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
        active
          ? "bg-zinc-800 text-yellow-400 border-b-2 border-yellow-400"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
      }`}
    >
      {label}
    </button>
  );
}

function StatTile({ label, value, sub, color = "yellow" }) {
  const accent = { yellow: "text-yellow-400", green: "text-green-400", blue: "text-blue-400", purple: "text-purple-400", red: "text-red-400" };
  return (
    <div className={cardCls}>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent[color] ?? accent.yellow}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function ProgressBar({ pct, color = "bg-yellow-400" }) {
  return (
    <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ summary, projPoints }) {
  const p = summary?.profile;
  const retireYear = projPoints ? findRetirementYear(projPoints) : null;

  const alloc = p
    ? allocate(p, summary.monthly_surplus)
    : { rrsp: 0, tfsa: 0, taxable: 0, taxSavings: 0 };

  const lastPoint = projPoints?.[projPoints.length - 1];
  const targetPct = lastPoint?.target > 0
    ? Math.min(Math.round((summary?.investable_assets / lastPoint.target) * 100), 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile
          label="Years to Retirement"
          value={p ? `${Math.max(p.years_to_retirement, 0)} yrs` : "—"}
          sub={p ? `Target age ${p.target_retirement_age}` : "Set up inputs"}
          color="yellow"
        />
        <StatTile
          label="Investable Assets"
          value={fmt(summary?.investable_assets)}
          sub="Assets minus non-mortgage debt"
          color="green"
        />
        <StatTile
          label="Required Portfolio"
          value={p ? fmt(p.required_portfolio) : "—"}
          sub={p ? "at 4% withdrawal rate" : ""}
          color="blue"
        />
        <StatTile
          label="Monthly Surplus"
          value={fmt(summary?.monthly_surplus)}
          sub="Income minus expenses (12mo avg)"
          color="purple"
        />
      </div>

      {/* Progress to target */}
      {p && lastPoint?.target > 0 && (
        <div className={cardCls}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-zinc-300">Portfolio Progress to Retirement Target</p>
            <p className="text-sm font-bold text-yellow-400">{targetPct}%</p>
          </div>
          <ProgressBar pct={targetPct} />
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>{fmt(summary.investable_assets)} today</span>
            <span>{fmt(p.required_portfolio)} needed</span>
          </div>
          {retireYear && (
            <p className="text-xs text-green-400 mt-2">
              On track to reach target by {retireYear} at age {(p.current_age ?? 40) + (retireYear - currentYear)}
            </p>
          )}
        </div>
      )}

      {/* Monthly allocation waterfall */}
      {p && (
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Monthly Allocation Waterfall</h3>
          <div className="space-y-3">
            {[
              { label: "Available Surplus", value: summary.monthly_surplus, color: "bg-zinc-600", note: "12-month average" },
              { label: "→ RRSP", value: alloc.rrsp, color: "bg-blue-500", note: `saves ${fmt(alloc.taxSavings)}/mo in taxes` },
              { label: "→ TFSA", value: alloc.tfsa, color: "bg-green-500", note: "tax-free growth" },
              { label: "→ Non-registered", value: alloc.taxable, color: "bg-zinc-500", note: "after RRSP & TFSA room filled" },
            ].map(({ label, value, color, note }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">{label}</span>
                  <span className="text-zinc-200 font-medium">{fmt(value, 0)}/mo</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${summary.monthly_surplus > 0 ? Math.min((value / summary.monthly_surplus) * 100, 100) : 0}%` }}
                  />
                </div>
                {note && <p className="text-xs text-zinc-600 mt-0.5">{note}</p>}
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-800 flex gap-4 text-xs">
            <div>
              <p className="text-zinc-500">RRSP room/yr</p>
              <p className="text-zinc-200 font-medium">{fmt(p.rrsp_room)}</p>
            </div>
            <div>
              <p className="text-zinc-500">TFSA room/yr</p>
              <p className="text-zinc-200 font-medium">{fmt(p.tfsa_room)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Marginal rate</p>
              <p className="text-zinc-200 font-medium">{Math.round((p.marginal_rate ?? 0) * 100)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming vest events */}
      {summary?.upcoming_vests?.length > 0 && (
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Upcoming Vests (next 12 months)</h3>
          <div className="space-y-2">
            {summary.upcoming_vests.map((ev, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-zinc-300">{ev.name}</span>
                  <span className="text-xs text-zinc-600 ml-2">{ev.date}</span>
                </div>
                <div className="text-right">
                  {ev.type === "rsu" ? (
                    <span className="text-purple-400 font-medium">{ev.units} units · {fmt(ev.value)}</span>
                  ) : (
                    <span className="text-yellow-400 font-medium">{fmt(ev.gross_amount)} gross</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!p && (
        <div className="text-center py-8 text-zinc-500 text-sm">
          Set up your retirement inputs to see projections and allocation guidance.
        </div>
      )}
    </div>
  );
}

// ── Inputs Tab ────────────────────────────────────────────────────────────────
function InputsTab({ profiles, goals, onRefresh }) {
  const { demo } = useAuth();
  const thisYear = currentYear;
  const latest = profiles?.[0];

  const emptyForm = {
    year: thisYear,
    marginal_rate: "",
    rrsp_room: "",
    tfsa_room: "",
    current_age: "",
    target_retirement_age: "60",
    target_annual_income: "",
    expected_return: "0.06",
    expected_inflation: "0.025",
    cpp_monthly: "0",
    oas_monthly: "727",
    notes: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const [goalForm, setGoalForm] = useState({ label: "", target_amount: "", target_year: "" });
  const [savingGoal, setSavingGoal] = useState(false);

  const startEdit = (profile) => {
    setEditing(profile.id);
    setForm({
      year: profile.year,
      marginal_rate: String(Math.round(profile.marginal_rate * 100)),
      rrsp_room: String(profile.rrsp_room),
      tfsa_room: String(profile.tfsa_room),
      current_age: profile.current_age != null ? String(profile.current_age) : "",
      target_retirement_age: String(profile.target_retirement_age),
      target_annual_income: String(profile.target_annual_income),
      expected_return: String(profile.expected_return),
      expected_inflation: String(profile.expected_inflation),
      cpp_monthly: String(profile.cpp_monthly),
      oas_monthly: String(profile.oas_monthly),
      notes: profile.notes || "",
    });
  };

  const resetForm = () => { setForm(emptyForm); setEditing(null); setErr(null); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const body = {
        year: parseInt(form.year),
        marginal_rate: parseFloat(form.marginal_rate) / 100,
        rrsp_room: parseFloat(form.rrsp_room) || 0,
        tfsa_room: parseFloat(form.tfsa_room) || 0,
        current_age: form.current_age ? parseInt(form.current_age) : null,
        target_retirement_age: parseInt(form.target_retirement_age) || 60,
        target_annual_income: parseFloat(form.target_annual_income) || 0,
        expected_return: parseFloat(form.expected_return) || 0.06,
        expected_inflation: parseFloat(form.expected_inflation) || 0.025,
        cpp_monthly: parseFloat(form.cpp_monthly) || 0,
        oas_monthly: parseFloat(form.oas_monthly) || 0,
        notes: form.notes || null,
      };
      if (editing) {
        await upsertRetirementProfile(body);
      } else {
        await upsertRetirementProfile(body);
      }
      resetForm();
      onRefresh();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this profile?")) return;
    await deleteRetirementProfile(id);
    onRefresh();
  };

  const handleGoalSave = async (e) => {
    e.preventDefault();
    setSavingGoal(true);
    try {
      await createRetirementGoal({
        label: goalForm.label,
        target_amount: parseFloat(goalForm.target_amount),
        target_year: goalForm.target_year ? parseInt(goalForm.target_year) : null,
      });
      setGoalForm({ label: "", target_amount: "", target_year: "" });
      onRefresh();
    } catch (ex) {
      alert(ex.message);
    } finally {
      setSavingGoal(false);
    }
  };

  const handleGoalDelete = async (id) => {
    await deleteRetirementGoal(id);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Profile form */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">
          {editing ? `Editing ${form.year} Profile` : "Add / Update Annual Profile"}
          <span className="text-xs font-normal text-zinc-600 ml-2">— enter when you receive your NOA</span>
        </h3>
        <form onSubmit={handleSave}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <label className={labelCls}>Year</label>
              <input className={inputCls} type="number" value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} required />
            </div>
            <div>
              <label className={labelCls}>Marginal Tax Rate (%)</label>
              <input className={inputCls} type="number" step="0.1" placeholder="43.5"
                value={form.marginal_rate}
                onChange={(e) => setForm((f) => ({ ...f, marginal_rate: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>RRSP Room ($)</label>
              <input className={inputCls} type="number" step="0.01" placeholder="15000"
                value={form.rrsp_room}
                onChange={(e) => setForm((f) => ({ ...f, rrsp_room: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>TFSA Room ($)</label>
              <input className={inputCls} type="number" step="0.01" placeholder="7000"
                value={form.tfsa_room}
                onChange={(e) => setForm((f) => ({ ...f, tfsa_room: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Your Current Age</label>
              <input className={inputCls} type="number" placeholder="38"
                value={form.current_age}
                onChange={(e) => setForm((f) => ({ ...f, current_age: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Target Retirement Age</label>
              <input className={inputCls} type="number" placeholder="60"
                value={form.target_retirement_age}
                onChange={(e) => setForm((f) => ({ ...f, target_retirement_age: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Target Annual Income ($)</label>
              <input className={inputCls} type="number" step="1000" placeholder="100000"
                value={form.target_annual_income}
                onChange={(e) => setForm((f) => ({ ...f, target_annual_income: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>CPP Monthly ($)</label>
              <input className={inputCls} type="number" step="1" placeholder="1200"
                value={form.cpp_monthly}
                onChange={(e) => setForm((f) => ({ ...f, cpp_monthly: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>OAS Monthly ($)</label>
              <input className={inputCls} type="number" step="1" placeholder="727"
                value={form.oas_monthly}
                onChange={(e) => setForm((f) => ({ ...f, oas_monthly: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Expected Return (decimal)</label>
              <input className={inputCls} type="number" step="0.001" placeholder="0.06"
                value={form.expected_return}
                onChange={(e) => setForm((f) => ({ ...f, expected_return: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Inflation Rate (decimal)</label>
              <input className={inputCls} type="number" step="0.001" placeholder="0.025"
                value={form.expected_inflation}
                onChange={(e) => setForm((f) => ({ ...f, expected_inflation: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <input className={inputCls} placeholder="Optional"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          {err && <p className="text-xs text-red-400 mb-2">{err}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving || demo}
              className="px-4 py-1.5 bg-yellow-400 text-zinc-900 text-sm font-semibold rounded disabled:opacity-40">
              {saving ? "Saving…" : editing ? "Update" : "Save Profile"}
            </button>
            {editing && (
              <button type="button" onClick={resetForm}
                className="px-4 py-1.5 bg-zinc-700 text-zinc-300 text-sm rounded">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Profile history */}
      {profiles?.length > 0 && (
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Annual Profiles</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-1 pr-3">Year</th>
                  <th className="text-right pr-3">Marginal Rate</th>
                  <th className="text-right pr-3">RRSP Room</th>
                  <th className="text-right pr-3">TFSA Room</th>
                  <th className="text-right pr-3">Target Age</th>
                  <th className="text-right pr-3">Target Income</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-1.5 pr-3 font-medium text-zinc-200">{p.year}</td>
                    <td className="text-right pr-3 text-zinc-300">{Math.round(p.marginal_rate * 100)}%</td>
                    <td className="text-right pr-3 text-zinc-300">{fmt(p.rrsp_room)}</td>
                    <td className="text-right pr-3 text-zinc-300">{fmt(p.tfsa_room)}</td>
                    <td className="text-right pr-3 text-zinc-300">{p.target_retirement_age}</td>
                    <td className="text-right pr-3 text-zinc-300">{fmt(p.target_annual_income)}</td>
                    <td className="text-right pl-2 whitespace-nowrap">
                      <button onClick={() => startEdit(p)} className="text-zinc-500 hover:text-yellow-400 mr-2">Edit</button>
                      <button onClick={() => handleDelete(p.id)} className="text-zinc-600 hover:text-red-400" disabled={demo}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Goals section */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Retirement Goals & Milestones</h3>
        <form onSubmit={handleGoalSave} className="flex flex-wrap gap-3 mb-4">
          <input className={`${inputCls} flex-1 min-w-32`} placeholder="Goal label e.g. First Million"
            value={goalForm.label} onChange={(e) => setGoalForm((f) => ({ ...f, label: e.target.value }))} required />
          <input className={`${inputCls} w-36`} type="number" step="1000" placeholder="Target $"
            value={goalForm.target_amount} onChange={(e) => setGoalForm((f) => ({ ...f, target_amount: e.target.value }))} required />
          <input className={`${inputCls} w-28`} type="number" placeholder="Year"
            value={goalForm.target_year} onChange={(e) => setGoalForm((f) => ({ ...f, target_year: e.target.value }))} />
          <button type="submit" disabled={savingGoal || demo}
            className="px-4 py-1.5 bg-yellow-400 text-zinc-900 text-sm font-semibold rounded disabled:opacity-40">
            Add
          </button>
        </form>
        {goals?.length > 0 && (
          <div className="space-y-2">
            {goals.map((g) => (
              <div key={g.id} className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 text-sm">
                <div>
                  <span className="text-zinc-200">{g.label}</span>
                  {g.target_year && <span className="text-zinc-600 text-xs ml-2">by {g.target_year}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-yellow-400 font-medium">{fmt(g.target_amount)}</span>
                  <button onClick={() => handleGoalDelete(g.id)} className="text-zinc-600 hover:text-red-400 text-xs" disabled={demo}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── RSUs & Bonuses Tab ────────────────────────────────────────────────────────
function RsuBonusTab({ grants, bonuses, profile, onRefresh }) {
  const { demo } = useAuth();
  const marginalRate = profile?.marginal_rate ?? 0;

  const [grantForm, setGrantForm] = useState({
    name: "", grant_date: "", ticker: "", total_units: "", unvested_units: "", current_price: "", vest_schedule_json: "", notes: "",
  });
  const [editingGrant, setEditingGrant] = useState(null);
  const [savingGrant, setSavingGrant] = useState(false);

  const [bonusForm, setBonusForm] = useState({ name: "", gross_amount: "", vest_date: "", is_paid: false, notes: "" });
  const [editingBonus, setEditingBonus] = useState(null);
  const [savingBonus, setSavingBonus] = useState(false);

  const handleGrantSave = async (e) => {
    e.preventDefault();
    setSavingGrant(true);
    try {
      const body = {
        name: grantForm.name,
        grant_date: grantForm.grant_date || null,
        ticker: grantForm.ticker || null,
        total_units: parseFloat(grantForm.total_units) || 0,
        unvested_units: parseFloat(grantForm.unvested_units) || 0,
        current_price: parseFloat(grantForm.current_price) || 0,
        vest_schedule_json: grantForm.vest_schedule_json || null,
        notes: grantForm.notes || null,
      };
      if (editingGrant) {
        await updateRsuGrant(editingGrant, body);
      } else {
        await createRsuGrant(body);
      }
      setGrantForm({ name: "", grant_date: "", ticker: "", total_units: "", unvested_units: "", current_price: "", vest_schedule_json: "", notes: "" });
      setEditingGrant(null);
      onRefresh();
    } catch (ex) {
      alert(ex.message);
    } finally {
      setSavingGrant(false);
    }
  };

  const handleBonusSave = async (e) => {
    e.preventDefault();
    setSavingBonus(true);
    try {
      const body = {
        name: bonusForm.name,
        gross_amount: parseFloat(bonusForm.gross_amount) || 0,
        vest_date: bonusForm.vest_date || null,
        is_paid: bonusForm.is_paid,
        notes: bonusForm.notes || null,
      };
      if (editingBonus) {
        await updateRetentionBonus(editingBonus, body);
      } else {
        await createRetentionBonus(body);
      }
      setBonusForm({ name: "", gross_amount: "", vest_date: "", is_paid: false, notes: "" });
      setEditingBonus(null);
      onRefresh();
    } catch (ex) {
      alert(ex.message);
    } finally {
      setSavingBonus(false);
    }
  };

  const startEditGrant = (g) => {
    setEditingGrant(g.id);
    setGrantForm({
      name: g.name, grant_date: g.grant_date || "", ticker: g.ticker || "",
      total_units: String(g.total_units), unvested_units: String(g.unvested_units),
      current_price: String(g.current_price), vest_schedule_json: g.vest_schedule_json || "", notes: g.notes || "",
    });
  };

  const startEditBonus = (b) => {
    setEditingBonus(b.id);
    setBonusForm({
      name: b.name, gross_amount: String(b.gross_amount), vest_date: b.vest_date || "",
      is_paid: b.is_paid, notes: b.notes || "",
    });
  };

  // Parse vest schedule for display
  const parseSchedule = (json) => {
    try { return json ? JSON.parse(json) : []; } catch { return []; }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {/* RSU Grants */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">RSU Grants</h3>
        <form onSubmit={handleGrantSave} className="space-y-3 mb-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Grant Name</label>
              <input className={inputCls} placeholder="FY2024 RSU Grant" value={grantForm.name}
                onChange={(e) => setGrantForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className={labelCls}>Ticker</label>
              <input className={inputCls} placeholder="ACME" value={grantForm.ticker}
                onChange={(e) => setGrantForm((f) => ({ ...f, ticker: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Grant Date</label>
              <input className={inputCls} type="date" value={grantForm.grant_date}
                onChange={(e) => setGrantForm((f) => ({ ...f, grant_date: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Total Units</label>
              <input className={inputCls} type="number" step="0.001" placeholder="500" value={grantForm.total_units}
                onChange={(e) => setGrantForm((f) => ({ ...f, total_units: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Unvested Units</label>
              <input className={inputCls} type="number" step="0.001" placeholder="375" value={grantForm.unvested_units}
                onChange={(e) => setGrantForm((f) => ({ ...f, unvested_units: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Current Price ($)</label>
              <input className={inputCls} type="number" step="0.01" placeholder="45.00" value={grantForm.current_price}
                onChange={(e) => setGrantForm((f) => ({ ...f, current_price: e.target.value }))} />
            </div>
            <div className="sm:col-span-3">
              <label className={labelCls}>
                Vest Schedule (JSON) — e.g. <code className="text-yellow-400/80">[{`{"date":"2025-03-01","units":125}`}]</code>
              </label>
              <input className={inputCls} placeholder='[{"date":"2025-03-01","units":125}]' value={grantForm.vest_schedule_json}
                onChange={(e) => setGrantForm((f) => ({ ...f, vest_schedule_json: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingGrant || demo}
              className="px-4 py-1.5 bg-yellow-400 text-zinc-900 text-sm font-semibold rounded disabled:opacity-40">
              {savingGrant ? "Saving…" : editingGrant ? "Update Grant" : "Add Grant"}
            </button>
            {editingGrant && (
              <button type="button" onClick={() => { setEditingGrant(null); setGrantForm({ name: "", grant_date: "", ticker: "", total_units: "", unvested_units: "", current_price: "", vest_schedule_json: "", notes: "" }); }}
                className="px-4 py-1.5 bg-zinc-700 text-zinc-300 text-sm rounded">
                Cancel
              </button>
            )}
          </div>
        </form>

        {grants?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-1 pr-3">Grant</th>
                  <th className="text-right pr-3">Total Units</th>
                  <th className="text-right pr-3">Unvested</th>
                  <th className="text-right pr-3">Price</th>
                  <th className="text-right pr-3">Unvested Value</th>
                  <th className="text-right pr-3">After-tax Est.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => {
                  const unvestedVal = g.unvested_units * g.current_price;
                  const afterTax = rsuAfterTax(g.unvested_units, g.current_price, marginalRate);
                  return (
                    <tr key={g.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-1.5 pr-3">
                        <p className="font-medium text-zinc-200">{g.name}</p>
                        <p className="text-zinc-600">{g.ticker}{g.grant_date ? ` · ${g.grant_date}` : ""}</p>
                      </td>
                      <td className="text-right pr-3 text-zinc-300">{g.total_units}</td>
                      <td className="text-right pr-3 text-zinc-300">{g.unvested_units}</td>
                      <td className="text-right pr-3 text-zinc-300">{fmt(g.current_price, 2)}</td>
                      <td className="text-right pr-3 text-purple-400 font-medium">{fmt(unvestedVal)}</td>
                      <td className="text-right pr-3 text-green-400">{fmt(afterTax)}</td>
                      <td className="text-right pl-2 whitespace-nowrap">
                        <button onClick={() => startEditGrant(g)} className="text-zinc-500 hover:text-yellow-400 mr-2">Edit</button>
                        <button onClick={async () => { if (confirm("Delete?")) { await deleteRsuGrant(g.id); onRefresh(); } }}
                          className="text-zinc-600 hover:text-red-400" disabled={demo}>Del</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Vest schedule detail */}
        {grants?.some((g) => g.vest_schedule_json) && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Vest Schedule</p>
            <div className="space-y-1">
              {grants.flatMap((g) =>
                parseSchedule(g.vest_schedule_json).map((ev, i) => ({
                  key: `${g.id}-${i}`,
                  date: ev.date,
                  units: ev.units,
                  value: ev.units * g.current_price,
                  name: g.name,
                  past: ev.date < today,
                }))
              ).sort((a, b) => a.date.localeCompare(b.date)).map((ev) => (
                <div key={ev.key} className={`flex justify-between text-xs ${ev.past ? "opacity-40" : ""}`}>
                  <span className="text-zinc-500">{ev.date} · {ev.name}</span>
                  <span className="text-purple-400">{ev.units} units · {fmt(ev.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Retention Bonuses */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Retention Bonuses</h3>
        <form onSubmit={handleBonusSave} className="space-y-3 mb-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} placeholder="2024 Retention Bonus" value={bonusForm.name}
                onChange={(e) => setBonusForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className={labelCls}>Gross Amount ($)</label>
              <input className={inputCls} type="number" step="100" value={bonusForm.gross_amount}
                onChange={(e) => setBonusForm((f) => ({ ...f, gross_amount: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Vest Date</label>
              <input className={inputCls} type="date" value={bonusForm.vest_date}
                onChange={(e) => setBonusForm((f) => ({ ...f, vest_date: e.target.value }))} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={bonusForm.is_paid}
                  onChange={(e) => setBonusForm((f) => ({ ...f, is_paid: e.target.checked }))}
                  className="rounded bg-zinc-700 border-zinc-600" />
                Already paid
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingBonus || demo}
              className="px-4 py-1.5 bg-yellow-400 text-zinc-900 text-sm font-semibold rounded disabled:opacity-40">
              {savingBonus ? "Saving…" : editingBonus ? "Update" : "Add Bonus"}
            </button>
            {editingBonus && (
              <button type="button" onClick={() => { setEditingBonus(null); setBonusForm({ name: "", gross_amount: "", vest_date: "", is_paid: false, notes: "" }); }}
                className="px-4 py-1.5 bg-zinc-700 text-zinc-300 text-sm rounded">
                Cancel
              </button>
            )}
          </div>
        </form>

        {bonuses?.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-1 pr-3">Name</th>
                <th className="text-right pr-3">Gross</th>
                <th className="text-right pr-3">After-tax Est.</th>
                <th className="text-right pr-3">Vest Date</th>
                <th className="text-right pr-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bonuses.map((b) => {
                const afterTax = b.gross_amount * (1 - marginalRate);
                return (
                  <tr key={b.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${b.is_paid ? "opacity-50" : ""}`}>
                    <td className="py-1.5 pr-3 font-medium text-zinc-200">{b.name}</td>
                    <td className="text-right pr-3 text-zinc-300">{fmt(b.gross_amount)}</td>
                    <td className="text-right pr-3 text-green-400">{fmt(afterTax)}</td>
                    <td className="text-right pr-3 text-zinc-400">{b.vest_date || "—"}</td>
                    <td className="text-right pr-3">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${b.is_paid ? "bg-zinc-700 text-zinc-500" : "bg-yellow-400/20 text-yellow-400"}`}>
                        {b.is_paid ? "Paid" : "Pending"}
                      </span>
                    </td>
                    <td className="text-right pl-2 whitespace-nowrap">
                      <button onClick={() => startEditBonus(b)} className="text-zinc-500 hover:text-yellow-400 mr-2">Edit</button>
                      <button onClick={async () => { if (confirm("Delete?")) { await deleteRetentionBonus(b.id); onRefresh(); } }}
                        className="text-zinc-600 hover:text-red-400" disabled={demo}>Del</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Projection Tab ────────────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-lg">
      <p className="font-medium text-zinc-300 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

function ProjectionTab({ projPoints, summary, goals }) {
  const p = summary?.profile;
  const retireYear = projPoints ? findRetirementYear(projPoints) : null;

  if (!p) {
    return (
      <div className="text-center py-12 text-zinc-500 text-sm">
        Add a retirement profile in the Inputs tab to see your projection.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-zinc-300">Portfolio Projection to Retirement</h3>
          {retireYear && (
            <span className="text-xs text-green-400 font-medium">Target reachable in {retireYear}</span>
          )}
        </div>
        <p className="text-xs text-zinc-600 mb-4">
          Assumes {Math.round(p.expected_return * 100)}% annual return · {Math.round(p.expected_inflation * 100)}% inflation ·
          4% withdrawal rate · {fmt(summary.monthly_surplus)}/mo surplus
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={projPoints} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#facc15" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#facc15" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="tgtGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#52525b" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "#52525b" }}
              tickFormatter={(v) => `$${v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`}`}
              width={60}
            />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
            {retireYear && (
              <ReferenceLine x={retireYear} stroke="#4ade80" strokeDasharray="4 4"
                label={{ value: "Retire", fill: "#4ade80", fontSize: 10, position: "top" }} />
            )}
            <Area type="monotone" dataKey="balance" name="Projected Portfolio" stroke="#facc15" fill="url(#balGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="target" name="Required Portfolio" stroke="#60a5fa" fill="url(#tgtGrad)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Goals against projection */}
      {goals?.length > 0 && projPoints && (
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Goals vs Projection</h3>
          <div className="space-y-3">
            {goals.map((g) => {
              const hitYear = projPoints.find((pt) => pt.balance >= g.target_amount);
              const latestBalance = projPoints[projPoints.length - 1]?.balance ?? 0;
              const pct = Math.min(Math.round((summary.investable_assets / g.target_amount) * 100), 100);
              return (
                <div key={g.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-300">{g.label}</span>
                    <span className="text-zinc-400">
                      {fmt(g.target_amount)}{hitYear ? <span className="text-green-400 ml-2">→ {hitYear.year}</span> : <span className="text-zinc-600 ml-2">not reached</span>}
                    </span>
                  </div>
                  <ProgressBar pct={pct} color={pct >= 100 ? "bg-green-400" : "bg-yellow-400"} />
                  <p className="text-xs text-zinc-600 mt-0.5">{pct}% there · {fmt(summary.investable_assets)} today</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assumptions breakdown */}
      <div className={cardCls}>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Projection Assumptions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div><p className="text-zinc-500">Starting Assets</p><p className="text-zinc-200 font-medium">{fmt(summary.investable_assets)}</p></div>
          <div><p className="text-zinc-500">Monthly Addition</p><p className="text-zinc-200 font-medium">{fmt(summary.monthly_surplus)}</p></div>
          <div><p className="text-zinc-500">Annual Return</p><p className="text-zinc-200 font-medium">{Math.round(p.expected_return * 100)}%</p></div>
          <div><p className="text-zinc-500">Inflation</p><p className="text-zinc-200 font-medium">{Math.round(p.expected_inflation * 100)}%</p></div>
          <div><p className="text-zinc-500">Target Income/yr</p><p className="text-zinc-200 font-medium">{fmt(p.target_annual_income)}</p></div>
          <div><p className="text-zinc-500">CPP + OAS/yr</p><p className="text-zinc-200 font-medium">{fmt(p.govt_annual_income)}</p></div>
          <div><p className="text-zinc-500">Required Portfolio</p><p className="text-zinc-200 font-medium">{fmt(p.required_portfolio)}</p></div>
          <div><p className="text-zinc-500">Years Remaining</p><p className="text-zinc-200 font-medium">{Math.max(p.years_to_retirement, 0)} yrs</p></div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Inputs", "RSUs & Bonuses", "Projection"];

export default function Retirement() {
  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [grants, setGrants] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, g, b, gl] = await Promise.all([
        getRetirementSummary(),
        getRetirementProfiles(),
        getRsuGrants(),
        getRetentionBonuses(),
        getRetirementGoals(),
      ]);
      setSummary(s);
      setProfiles(p);
      setGrants(g);
      setBonuses(b);
      setGoals(gl);
    } catch (e) {
      console.error("Retirement load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build vest events for projection
  const vestEvents = [
    ...grants.flatMap((g) => {
      try {
        const schedule = g.vest_schedule_json ? JSON.parse(g.vest_schedule_json) : [];
        return schedule.map((ev) => ({
          year: parseInt(ev.date?.slice(0, 4)),
          value: (ev.units ?? 0) * (g.current_price ?? 0) * (1 - (summary?.profile?.marginal_rate ?? 0)),
        }));
      } catch { return []; }
    }),
    ...bonuses.filter((b) => !b.is_paid && b.vest_date).map((b) => ({
      year: parseInt(b.vest_date.slice(0, 4)),
      value: b.gross_amount * (1 - (summary?.profile?.marginal_rate ?? 0)),
    })),
  ];

  const projPoints = summary?.profile
    ? project(summary.profile, summary.investable_assets, summary.monthly_surplus, vestEvents, currentYear)
    : null;

  if (loading) {
    return <div className="text-zinc-600 text-sm py-12 text-center">Loading retirement data…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Retirement Planner</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Track your path to financial independence — RRSP/TFSA allocation, RSU vesting, and portfolio projections.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map((t, i) => (
          <Tab key={t} label={t} active={tab === i} onClick={() => setTab(i)} />
        ))}
      </div>

      <div className="pt-1">
        {tab === 0 && <OverviewTab summary={summary} projPoints={projPoints} />}
        {tab === 1 && <InputsTab profiles={profiles} goals={goals} onRefresh={load} />}
        {tab === 2 && <RsuBonusTab grants={grants} bonuses={bonuses} profile={summary?.profile} onRefresh={load} />}
        {tab === 3 && <ProjectionTab projPoints={projPoints} summary={summary} goals={goals} />}
      </div>
    </div>
  );
}

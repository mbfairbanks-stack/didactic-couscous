import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from "recharts";
import {
  getRetirementSummary,
  getRetirementProfiles, upsertRetirementProfile, deleteRetirementProfile,
  getRsuGrants, createRsuGrant, updateRsuGrant, deleteRsuGrant,
  getRetentionBonuses, createRetentionBonus, updateRetentionBonus, deleteRetentionBonus,
  getRetirementGoals, createRetirementGoal, updateRetirementGoal, deleteRetirementGoal,
} from "../api";
import { project, findRetirementYear, goalTimeline } from "../lib/retirementEngine";
import { fmt, currentYear } from "../utils";
import { useAuth } from "../contexts/AuthContext";

const card = "bg-zinc-900 border border-zinc-800 rounded-xl p-4";
const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50 w-full";
const labelCls = "block text-xs text-zinc-500 mb-1";

function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
        active ? "bg-zinc-800 text-yellow-400 border-b-2 border-yellow-400"
               : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
      }`}>
      {label}
    </button>
  );
}

function ProgressRing({ pct, size = 120, stroke = 10, color = "#facc15" }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

function Bar({ pct, color = "bg-yellow-400", height = "h-2" }) {
  return (
    <div className={`${height} bg-zinc-800 rounded-full overflow-hidden`}>
      <div className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

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

// ── Overview ──────────────────────────────────────────────────────────────────
function OverviewTab({ summary, projPoints, goals }) {
  const p = summary?.profile;
  if (!p) {
    return (
      <div className="text-center py-10 space-y-2">
        <p className="text-zinc-400 text-sm">No retirement profile yet.</p>
        <p className="text-zinc-600 text-xs">Switch to the Inputs tab to set your age, target, and return assumptions.</p>
      </div>
    );
  }

  const retireYear = projPoints ? findRetirementYear(projPoints) : null;
  const lastPt = projPoints?.[projPoints.length - 1];
  const targetPct = lastPt?.target > 0
    ? Math.min(Math.round((summary.investable_assets / lastPt.target) * 100), 100)
    : 0;
  const timeline = goals?.length && projPoints ? goalTimeline(goals, projPoints) : [];

  // Savings breakdown
  const monthlyRrsp = summary.payroll_monthly_rrsp ?? 0;
  const monthlyEspp = summary.payroll_monthly_espp ?? 0;
  const monthlyTotal = monthlyRrsp + monthlyEspp;
  const annualTotal = monthlyTotal * 12;
  const taxSavings = monthlyRrsp * (p.marginal_rate ?? 0);

  return (
    <div className="space-y-5">
      {/* Hero: ring + key numbers */}
      <div className={`${card} flex flex-col sm:flex-row items-center gap-6`}>
        <div className="relative shrink-0">
          <ProgressRing pct={targetPct} size={140} stroke={12} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-yellow-400">{targetPct}%</span>
            <span className="text-xs text-zinc-500">to target</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-4 w-full">
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Investable Portfolio</p>
            <p className="text-2xl font-bold text-zinc-100">{fmt(summary.investable_assets)}</p>
            <p className="text-xs text-zinc-600 mt-0.5">excl. house + non-mortgage debt</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Retirement Target</p>
            <p className="text-2xl font-bold text-blue-400">{fmt(p.required_portfolio)}</p>
            <p className="text-xs text-zinc-600 mt-0.5">{fmt(p.target_annual_income)}/yr at 4% SWR</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Years to Retirement</p>
            <p className="text-2xl font-bold text-yellow-400">{p.years_to_retirement}</p>
            <p className="text-xs text-zinc-600 mt-0.5">age {p.current_age} → {p.target_retirement_age}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">On Track For</p>
            {retireYear ? (
              <>
                <p className="text-2xl font-bold text-green-400">{retireYear}</p>
                <p className="text-xs text-zinc-600 mt-0.5">age {p.current_age + (retireYear - currentYear)}</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-zinc-500">—</p>
            )}
          </div>
        </div>
      </div>

      {/* Payroll savings auto-tracked */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Monthly Payroll Savings</h3>
        <p className="text-xs text-zinc-600 mb-4">Pulled automatically from your paycheque entries</p>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-400">RRSP (employee + employer match)</span>
              <span className="text-blue-400 font-medium">{fmt(monthlyRrsp)}/mo</span>
            </div>
            <Bar pct={monthlyTotal > 0 ? (monthlyRrsp / monthlyTotal) * 100 : 0} color="bg-blue-500" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-400">ESPP deductions</span>
              <span className="text-purple-400 font-medium">{fmt(monthlyEspp)}/mo</span>
            </div>
            <Bar pct={monthlyTotal > 0 ? (monthlyEspp / monthlyTotal) * 100 : 0} color="bg-purple-500" />
          </div>
          <div className="pt-2 border-t border-zinc-800 flex flex-wrap items-center gap-4 text-xs">
            <div>
              <span className="text-zinc-500">Total/mo </span>
              <span className="text-zinc-100 font-bold">{fmt(monthlyTotal)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Total/yr </span>
              <span className="text-zinc-100 font-bold">{fmt(annualTotal)}</span>
            </div>
            {taxSavings > 0 && (
              <div>
                <span className="text-zinc-500">RRSP tax savings/mo </span>
                <span className="text-green-400 font-bold">{fmt(taxSavings)}</span>
              </div>
            )}
          </div>
        </div>

        {/* YTD badges */}
        <div className="mt-4 pt-3 border-t border-zinc-800 grid grid-cols-3 gap-3 text-xs">
          <div className={`bg-zinc-800 rounded-lg p-2.5`}>
            <p className="text-zinc-500">RRSP YTD (employee)</p>
            <p className="text-blue-400 font-bold mt-0.5">{fmt(summary.ytd_rrsp_employee)}</p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-2.5">
            <p className="text-zinc-500">RRSP YTD (employer)</p>
            <p className="text-blue-300 font-bold mt-0.5">{fmt(summary.ytd_rrsp_employer)}</p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-2.5">
            <p className="text-zinc-500">ESPP YTD</p>
            <p className="text-purple-400 font-bold mt-0.5">{fmt(summary.ytd_espp)}</p>
          </div>
        </div>
      </div>

      {/* Milestone timeline */}
      {timeline.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-semibold text-zinc-300 mb-4">Goal Timeline</h3>
          <div className="relative pl-5">
            <div className="absolute left-2 top-1 bottom-1 w-px bg-zinc-700" />
            {timeline.map(({ goal, hitYear, hitAge }, i) => {
              const pct = Math.min(
                Math.round((summary.investable_assets / goal.target_amount) * 100),
                100
              );
              const done = pct >= 100;
              return (
                <div key={goal.id} className="relative mb-5 last:mb-0">
                  <div className={`absolute -left-3 top-1 w-2.5 h-2.5 rounded-full border-2 ${done ? "bg-green-400 border-green-400" : "bg-zinc-900 border-zinc-500"}`} />
                  <div className="flex items-start justify-between gap-4 mb-1">
                    <div>
                      <span className={`text-sm font-semibold ${done ? "text-green-400" : "text-zinc-200"}`}>{goal.label}</span>
                      <span className="text-xs text-zinc-500 ml-2">{fmt(goal.target_amount)}</span>
                    </div>
                    <div className="text-right shrink-0">
                      {hitYear ? (
                        <span className="text-xs font-medium text-zinc-300">{hitYear}{hitAge ? ` · age ${hitAge}` : ""}</span>
                      ) : (
                        <span className="text-xs text-zinc-600">not in window</span>
                      )}
                    </div>
                  </div>
                  <Bar pct={pct} color={done ? "bg-green-400" : "bg-yellow-400/70"} />
                  <p className="text-xs text-zinc-600 mt-0.5">{pct}% there</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming vest events */}
      {summary.upcoming_vests?.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Upcoming Vests (next 12 months)</h3>
          <div className="space-y-2">
            {summary.upcoming_vests.map((ev, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-zinc-800/50 last:border-0">
                <div>
                  <span className="text-zinc-300">{ev.name}</span>
                  <span className="text-xs text-zinc-600 ml-2">{ev.date}</span>
                </div>
                {ev.type === "rsu"
                  ? <span className="text-purple-400 font-medium">{ev.units} units · {fmt(ev.value)}</span>
                  : <span className="text-yellow-400 font-medium">{fmt(ev.gross_amount)} gross</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Projection Chart ──────────────────────────────────────────────────────────
function ProjectionTab({ projPoints, summary, goals }) {
  const p = summary?.profile;
  if (!p) {
    return (
      <div className="text-center py-10 text-zinc-500 text-sm">
        Add a retirement profile in the Inputs tab first.
      </div>
    );
  }

  const retireYear = projPoints ? findRetirementYear(projPoints) : null;

  // Milestone reference lines from goals
  const goalLines = (goals ?? []).map((g) => ({
    label: g.label,
    amount: g.target_amount,
  }));

  return (
    <div className="space-y-5">
      <div className={card}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-zinc-300">Portfolio Projection</h3>
            <p className="text-xs text-zinc-600 mt-0.5">
              {fmt(summary.payroll_monthly_rrsp + summary.payroll_monthly_espp)}/mo payroll savings ·{" "}
              {Math.round((p.expected_return ?? 0.06) * 100)}% return · house excluded
            </p>
          </div>
          {retireYear && (
            <span className="text-xs text-green-400 font-medium shrink-0 ml-4">Target reachable {retireYear}</span>
          )}
        </div>

        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={projPoints} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#facc15" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#facc15" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="tgtGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#52525b" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "#52525b" }}
              tickFormatter={(v) =>
                v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1_000 ? `$${Math.round(v / 1000)}k` : `$${v}`
              }
              width={64}
            />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
            {retireYear && (
              <ReferenceLine x={retireYear} stroke="#4ade80" strokeDasharray="4 3"
                label={{ value: "Retire", fill: "#4ade80", fontSize: 10, position: "insideTopRight" }} />
            )}
            <Area type="monotone" dataKey="balance" name="Projected Portfolio"
              stroke="#facc15" fill="url(#balGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="target" name="Required at Retirement"
              stroke="#60a5fa" fill="url(#tgtGrad)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Assumptions */}
      <div className={card}>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Assumptions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div><p className="text-zinc-500">Starting</p><p className="text-zinc-200 font-medium">{fmt(summary.investable_assets)}</p></div>
          <div><p className="text-zinc-500">Monthly savings</p><p className="text-zinc-200 font-medium">{fmt(summary.payroll_monthly_rrsp + summary.payroll_monthly_espp)}</p></div>
          <div><p className="text-zinc-500">Annual return</p><p className="text-zinc-200 font-medium">{Math.round((p.expected_return ?? 0) * 100)}%</p></div>
          <div><p className="text-zinc-500">Inflation</p><p className="text-zinc-200 font-medium">{Math.round((p.expected_inflation ?? 0) * 100)}%</p></div>
          <div><p className="text-zinc-500">Target income/yr</p><p className="text-zinc-200 font-medium">{fmt(p.target_annual_income)}</p></div>
          <div><p className="text-zinc-500">CPP + OAS/yr</p><p className="text-zinc-200 font-medium">{fmt(p.govt_annual_income)}</p></div>
          <div><p className="text-zinc-500">Required portfolio</p><p className="text-zinc-200 font-medium">{fmt(p.required_portfolio)}</p></div>
          <div><p className="text-zinc-500">Years remaining</p><p className="text-zinc-200 font-medium">{p.years_to_retirement}</p></div>
        </div>
      </div>
    </div>
  );
}

// ── Inputs ────────────────────────────────────────────────────────────────────
function InputsTab({ profiles, goals, onRefresh }) {
  const { demo } = useAuth();
  const latest = profiles?.[0];

  const blankForm = {
    year: currentYear,
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

  const [form, setForm] = useState(blankForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const [goalForm, setGoalForm] = useState({ label: "", target_amount: "", target_year: "" });
  const [savingGoal, setSavingGoal] = useState(false);

  const startEdit = (profile) => {
    setEditing(profile.id);
    setForm({
      year: profile.year,
      marginal_rate: String(Math.round((profile.marginal_rate ?? 0) * 100)),
      rrsp_room: String(profile.rrsp_room ?? ""),
      tfsa_room: String(profile.tfsa_room ?? ""),
      current_age: profile.current_age != null ? String(profile.current_age) : "",
      target_retirement_age: String(profile.target_retirement_age ?? 60),
      target_annual_income: String(profile.target_annual_income ?? ""),
      expected_return: String(profile.expected_return ?? 0.06),
      expected_inflation: String(profile.expected_inflation ?? 0.025),
      cpp_monthly: String(profile.cpp_monthly ?? 0),
      oas_monthly: String(profile.oas_monthly ?? 727),
      notes: profile.notes ?? "",
    });
  };

  const reset = () => { setForm(blankForm); setEditing(null); setErr(null); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await upsertRetirementProfile({
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
      });
      reset();
      onRefresh();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile form */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">
          {editing ? `Editing ${form.year}` : "Annual Profile"}
        </h3>
        <p className="text-xs text-zinc-600 mb-4">Update each year when your NOA arrives with new RRSP room</p>
        <form onSubmit={handleSave}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className={labelCls}>Year</label>
              <input className={inputCls} type="number" value={form.year} required
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Marginal Tax Rate (%)</label>
              <input className={inputCls} type="number" step="0.1" placeholder="43.5"
                value={form.marginal_rate}
                onChange={(e) => setForm((f) => ({ ...f, marginal_rate: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>RRSP Room ($) — from NOA</label>
              <input className={inputCls} type="number" step="1" placeholder="15000"
                value={form.rrsp_room}
                onChange={(e) => setForm((f) => ({ ...f, rrsp_room: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>TFSA Room ($)</label>
              <input className={inputCls} type="number" step="1" placeholder="7000"
                value={form.tfsa_room}
                onChange={(e) => setForm((f) => ({ ...f, tfsa_room: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Your Age</label>
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
              <input className={inputCls} type="number" step="1000" placeholder="120000"
                value={form.target_annual_income}
                onChange={(e) => setForm((f) => ({ ...f, target_annual_income: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>CPP Monthly at Retirement ($)</label>
              <input className={inputCls} type="number" step="1" placeholder="1300"
                value={form.cpp_monthly}
                onChange={(e) => setForm((f) => ({ ...f, cpp_monthly: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>OAS Monthly at Retirement ($)</label>
              <input className={inputCls} type="number" step="1" placeholder="727"
                value={form.oas_monthly}
                onChange={(e) => setForm((f) => ({ ...f, oas_monthly: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Expected Return (e.g. 0.06)</label>
              <input className={inputCls} type="number" step="0.005" placeholder="0.06"
                value={form.expected_return}
                onChange={(e) => setForm((f) => ({ ...f, expected_return: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Inflation Rate (e.g. 0.025)</label>
              <input className={inputCls} type="number" step="0.005" placeholder="0.025"
                value={form.expected_inflation}
                onChange={(e) => setForm((f) => ({ ...f, expected_inflation: e.target.value }))} />
            </div>
            <div>
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
              {saving ? "Saving…" : "Save"}
            </button>
            {editing && (
              <button type="button" onClick={reset}
                className="px-4 py-1.5 bg-zinc-700 text-zinc-300 text-sm rounded">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Profile history */}
      {profiles?.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">History</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-1 pr-3">Year</th>
                <th className="text-right pr-3">Rate</th>
                <th className="text-right pr-3">RRSP Room</th>
                <th className="text-right pr-3">TFSA Room</th>
                <th className="text-right pr-3">Target Income</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {profiles.map((pr) => (
                <tr key={pr.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/30">
                  <td className="py-1.5 pr-3 font-medium text-zinc-200">{pr.year}</td>
                  <td className="text-right pr-3 text-zinc-300">{Math.round((pr.marginal_rate ?? 0) * 100)}%</td>
                  <td className="text-right pr-3 text-zinc-300">{fmt(pr.rrsp_room)}</td>
                  <td className="text-right pr-3 text-zinc-300">{fmt(pr.tfsa_room)}</td>
                  <td className="text-right pr-3 text-zinc-300">{fmt(pr.target_annual_income)}</td>
                  <td className="text-right">
                    <button onClick={() => startEdit(pr)} className="text-zinc-500 hover:text-yellow-400 mr-2">Edit</button>
                    <button onClick={async () => { if (confirm("Delete?")) { await deleteRetirementProfile(pr.id); onRefresh(); } }}
                      className="text-zinc-600 hover:text-red-400" disabled={demo}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Goals */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Goals & Milestones</h3>
        <form onSubmit={async (e) => {
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
          } catch (ex) { alert(ex.message); }
          finally { setSavingGoal(false); }
        }} className="flex flex-wrap gap-3 mb-4">
          <input className={`${inputCls} flex-1 min-w-40`} placeholder="e.g. First Million"
            value={goalForm.label} onChange={(e) => setGoalForm((f) => ({ ...f, label: e.target.value }))} required />
          <input className={`${inputCls} w-36`} type="number" step="50000" placeholder="Target $"
            value={goalForm.target_amount} onChange={(e) => setGoalForm((f) => ({ ...f, target_amount: e.target.value }))} required />
          <button type="submit" disabled={savingGoal || demo}
            className="px-4 py-1.5 bg-yellow-400 text-zinc-900 text-sm font-semibold rounded disabled:opacity-40">
            Add
          </button>
        </form>
        {goals?.length > 0 && (
          <div className="space-y-2">
            {goals.map((g) => (
              <div key={g.id} className="flex items-center justify-between py-1 border-b border-zinc-800/40 text-sm">
                <span className="text-zinc-200">{g.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-yellow-400 font-medium">{fmt(g.target_amount)}</span>
                  <button onClick={async () => { await deleteRetirementGoal(g.id); onRefresh(); }}
                    className="text-zinc-600 hover:text-red-400 text-xs" disabled={demo}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── RSUs & Bonuses ────────────────────────────────────────────────────────────
function RsuBonusTab({ grants, bonuses, profile, onRefresh }) {
  const { demo } = useAuth();
  const marginalRate = profile?.marginal_rate ?? 0;

  const [gForm, setGForm] = useState({ name: "", grant_date: "", ticker: "", total_units: "", unvested_units: "", current_price: "", vest_schedule_json: "", notes: "" });
  const [editG, setEditG] = useState(null);
  const [savingG, setSavingG] = useState(false);

  const [bForm, setBForm] = useState({ name: "", gross_amount: "", vest_date: "", is_paid: false, notes: "" });
  const [editB, setEditB] = useState(null);
  const [savingB, setSavingB] = useState(false);

  const saveGrant = async (e) => {
    e.preventDefault();
    setSavingG(true);
    try {
      const body = {
        name: gForm.name, grant_date: gForm.grant_date || null, ticker: gForm.ticker || null,
        total_units: parseFloat(gForm.total_units) || 0, unvested_units: parseFloat(gForm.unvested_units) || 0,
        current_price: parseFloat(gForm.current_price) || 0,
        vest_schedule_json: gForm.vest_schedule_json || null, notes: gForm.notes || null,
      };
      if (editG) await updateRsuGrant(editG, body); else await createRsuGrant(body);
      setGForm({ name: "", grant_date: "", ticker: "", total_units: "", unvested_units: "", current_price: "", vest_schedule_json: "", notes: "" });
      setEditG(null);
      onRefresh();
    } catch (ex) { alert(ex.message); }
    finally { setSavingG(false); }
  };

  const saveBonus = async (e) => {
    e.preventDefault();
    setSavingB(true);
    try {
      const body = { name: bForm.name, gross_amount: parseFloat(bForm.gross_amount) || 0, vest_date: bForm.vest_date || null, is_paid: bForm.is_paid, notes: bForm.notes || null };
      if (editB) await updateRetentionBonus(editB, body); else await createRetentionBonus(body);
      setBForm({ name: "", gross_amount: "", vest_date: "", is_paid: false, notes: "" });
      setEditB(null);
      onRefresh();
    } catch (ex) { alert(ex.message); }
    finally { setSavingB(false); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const parseSchedule = (json) => { try { return json ? JSON.parse(json) : []; } catch { return []; } };

  return (
    <div className="space-y-6">
      {/* RSU Grants */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">RSU Grants</h3>
        <form onSubmit={saveGrant} className="space-y-3 mb-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div><label className={labelCls}>Name</label>
              <input className={inputCls} placeholder="FY2025 RSU" value={gForm.name} required onChange={(e) => setGForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><label className={labelCls}>Ticker</label>
              <input className={inputCls} placeholder="ACME" value={gForm.ticker} onChange={(e) => setGForm((f) => ({ ...f, ticker: e.target.value }))} /></div>
            <div><label className={labelCls}>Grant Date</label>
              <input className={inputCls} type="date" value={gForm.grant_date} onChange={(e) => setGForm((f) => ({ ...f, grant_date: e.target.value }))} /></div>
            <div><label className={labelCls}>Total Units</label>
              <input className={inputCls} type="number" step="1" value={gForm.total_units} onChange={(e) => setGForm((f) => ({ ...f, total_units: e.target.value }))} /></div>
            <div><label className={labelCls}>Unvested Units</label>
              <input className={inputCls} type="number" step="1" value={gForm.unvested_units} onChange={(e) => setGForm((f) => ({ ...f, unvested_units: e.target.value }))} /></div>
            <div><label className={labelCls}>Current Price ($)</label>
              <input className={inputCls} type="number" step="0.01" value={gForm.current_price} onChange={(e) => setGForm((f) => ({ ...f, current_price: e.target.value }))} /></div>
            <div className="sm:col-span-3">
              <label className={labelCls}>Vest Schedule (JSON) — <code className="text-yellow-400/80">[{`{"date":"2025-03-01","units":125}`}]</code></label>
              <input className={inputCls} value={gForm.vest_schedule_json} onChange={(e) => setGForm((f) => ({ ...f, vest_schedule_json: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingG || demo}
              className="px-4 py-1.5 bg-yellow-400 text-zinc-900 text-sm font-semibold rounded disabled:opacity-40">
              {savingG ? "Saving…" : editG ? "Update" : "Add Grant"}
            </button>
            {editG && <button type="button" onClick={() => { setEditG(null); setGForm({ name: "", grant_date: "", ticker: "", total_units: "", unvested_units: "", current_price: "", vest_schedule_json: "", notes: "" }); }}
              className="px-4 py-1.5 bg-zinc-700 text-zinc-300 text-sm rounded">Cancel</button>}
          </div>
        </form>

        {grants?.length > 0 && (
          <>
            <table className="w-full text-xs mb-4">
              <thead><tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-1 pr-3">Grant</th>
                <th className="text-right pr-3">Unvested</th>
                <th className="text-right pr-3">Price</th>
                <th className="text-right pr-3">Value</th>
                <th />
              </tr></thead>
              <tbody>{grants.map((g) => (
                <tr key={g.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/30">
                  <td className="py-1.5 pr-3"><p className="text-zinc-200 font-medium">{g.name}</p><p className="text-zinc-600">{g.ticker}{g.grant_date ? ` · ${g.grant_date}` : ""}</p></td>
                  <td className="text-right pr-3 text-zinc-300">{g.unvested_units}</td>
                  <td className="text-right pr-3 text-zinc-300">{fmt(g.current_price, 2)}</td>
                  <td className="text-right pr-3 text-purple-400 font-medium">{fmt(g.unvested_units * g.current_price)}</td>
                  <td className="text-right">
                    <button onClick={() => { setEditG(g.id); setGForm({ name: g.name, grant_date: g.grant_date || "", ticker: g.ticker || "", total_units: String(g.total_units), unvested_units: String(g.unvested_units), current_price: String(g.current_price), vest_schedule_json: g.vest_schedule_json || "", notes: g.notes || "" }); }}
                      className="text-zinc-500 hover:text-yellow-400 mr-2">Edit</button>
                    <button onClick={async () => { if (confirm("Delete?")) { await deleteRsuGrant(g.id); onRefresh(); } }}
                      className="text-zinc-600 hover:text-red-400" disabled={demo}>Del</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>

            {/* Vest schedule */}
            {grants.some((g) => g.vest_schedule_json) && (
              <div className="border-t border-zinc-800 pt-3">
                <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wide mb-2">Vest Schedule</p>
                <div className="space-y-1">
                  {grants.flatMap((g) =>
                    parseSchedule(g.vest_schedule_json).map((ev, i) => ({
                      key: `${g.id}-${i}`, date: ev.date, units: ev.units,
                      value: ev.units * g.current_price, name: g.name, past: ev.date < today,
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
          </>
        )}
      </div>

      {/* Retention Bonuses */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Retention Bonuses</h3>
        <form onSubmit={saveBonus} className="space-y-3 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className={labelCls}>Name</label>
              <input className={inputCls} placeholder="2024 Retention" value={bForm.name} required onChange={(e) => setBForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><label className={labelCls}>Gross Amount ($)</label>
              <input className={inputCls} type="number" step="100" value={bForm.gross_amount} onChange={(e) => setBForm((f) => ({ ...f, gross_amount: e.target.value }))} /></div>
            <div><label className={labelCls}>Vest Date</label>
              <input className={inputCls} type="date" value={bForm.vest_date} onChange={(e) => setBForm((f) => ({ ...f, vest_date: e.target.value }))} /></div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={bForm.is_paid} onChange={(e) => setBForm((f) => ({ ...f, is_paid: e.target.checked }))} className="rounded" />
                Paid
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingB || demo}
              className="px-4 py-1.5 bg-yellow-400 text-zinc-900 text-sm font-semibold rounded disabled:opacity-40">
              {savingB ? "Saving…" : editB ? "Update" : "Add Bonus"}
            </button>
            {editB && <button type="button" onClick={() => { setEditB(null); setBForm({ name: "", gross_amount: "", vest_date: "", is_paid: false, notes: "" }); }}
              className="px-4 py-1.5 bg-zinc-700 text-zinc-300 text-sm rounded">Cancel</button>}
          </div>
        </form>

        {bonuses?.length > 0 && (
          <table className="w-full text-xs">
            <thead><tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left py-1 pr-3">Name</th>
              <th className="text-right pr-3">Gross</th>
              <th className="text-right pr-3">Vest Date</th>
              <th className="text-right pr-3">Status</th>
              <th />
            </tr></thead>
            <tbody>{bonuses.map((b) => (
              <tr key={b.id} className={`border-b border-zinc-800/40 hover:bg-zinc-800/30 ${b.is_paid ? "opacity-50" : ""}`}>
                <td className="py-1.5 pr-3 font-medium text-zinc-200">{b.name}</td>
                <td className="text-right pr-3 text-zinc-300">{fmt(b.gross_amount)}</td>
                <td className="text-right pr-3 text-zinc-400">{b.vest_date || "—"}</td>
                <td className="text-right pr-3">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${b.is_paid ? "bg-zinc-700 text-zinc-500" : "bg-yellow-400/20 text-yellow-400"}`}>
                    {b.is_paid ? "Paid" : "Pending"}
                  </span>
                </td>
                <td className="text-right">
                  <button onClick={() => { setEditB(b.id); setBForm({ name: b.name, gross_amount: String(b.gross_amount), vest_date: b.vest_date || "", is_paid: b.is_paid, notes: b.notes || "" }); }}
                    className="text-zinc-500 hover:text-yellow-400 mr-2">Edit</button>
                  <button onClick={async () => { if (confirm("Delete?")) { await deleteRetentionBonus(b.id); onRefresh(); } }}
                    className="text-zinc-600 hover:text-red-400" disabled={demo}>Del</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Projection", "Inputs", "RSUs & Bonuses"];

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

  // Build vest events for projection (after-tax estimate using marginal rate)
  const marginalRate = summary?.profile?.marginal_rate ?? 0;
  const vestEvents = [
    ...grants.flatMap((g) => {
      try {
        const schedule = g.vest_schedule_json ? JSON.parse(g.vest_schedule_json) : [];
        return schedule.map((ev) => ({
          year: parseInt(ev.date?.slice(0, 4)),
          value: (ev.units ?? 0) * (g.current_price ?? 0) * (1 - marginalRate),
        }));
      } catch { return []; }
    }),
    ...bonuses.filter((b) => !b.is_paid && b.vest_date).map((b) => ({
      year: parseInt(b.vest_date.slice(0, 4)),
      value: b.gross_amount,  // commissions/bonuses already taxed at source
    })),
  ];

  const projPoints = summary?.profile
    ? project(
        summary.profile,
        summary.investable_assets,
        summary.payroll_monthly_rrsp ?? 0,
        summary.payroll_monthly_espp ?? 0,
        vestEvents,
        currentYear,
      )
    : null;

  if (loading) return <div className="text-zinc-600 text-sm py-12 text-center">Loading…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Retirement</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Portfolio progress · payroll savings pulled automatically from your paycheques
        </p>
      </div>

      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map((t, i) => (
          <Tab key={t} label={t} active={tab === i} onClick={() => setTab(i)} />
        ))}
      </div>

      <div className="pt-1">
        {tab === 0 && <OverviewTab summary={summary} projPoints={projPoints} goals={goals} />}
        {tab === 1 && <ProjectionTab projPoints={projPoints} summary={summary} goals={goals} />}
        {tab === 2 && <InputsTab profiles={profiles} goals={goals} onRefresh={load} />}
        {tab === 3 && <RsuBonusTab grants={grants} bonuses={bonuses} profile={summary?.profile} onRefresh={load} />}
      </div>
    </div>
  );
}

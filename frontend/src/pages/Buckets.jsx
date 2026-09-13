import { useState, useEffect, useCallback, useRef } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { usePeriod } from "../hooks/usePeriod";
import {
  getBucketSummary, getBucketTrend, getBucketPlan, saveBucketPlan,
  getSavingsGoals, getYears,
} from "../api";
import { BUCKETS, BUCKET_META, BUCKET_SURFACE } from "../constants";
import { MONTH_LABELS, currentYear, currentMonth, fmt } from "../utils";

const QUARTERS = { 1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12] };
const HALVES = { 1: [1, 6], 2: [7, 12] };

function periodRange(mode, month, quarter, half) {
  if (mode === "month") return [month, month];
  if (mode === "quarter") return QUARTERS[quarter];
  if (mode === "half") return HALVES[half];
  return [1, 12];
}

function periodLabel(mode, year, month, quarter, half) {
  if (mode === "month") return `${MONTH_LABELS[month]} ${year}`;
  if (mode === "quarter") return `Q${quarter} ${year}`;
  if (mode === "half") return `H${half} ${year}`;
  return `${year}`;
}

// Landing within 5% of target counts as on plan — a $55 miss on a $4,620
// target is not a problem, and colouring it red teaches people to ignore red.
const TOLERANCE = 0.05;

function bucketStatus(bucket, variance, target) {
  if (target <= 0) return "none";
  if (Math.abs(variance) <= target * TOLERANCE) return "on";
  const over = variance > 0;
  return (BUCKET_META[bucket].overIsBad ? !over : over) ? "good" : "bad";
}

// ── Verdict pill ────────────────────────────────────────────────────────────
function Verdict({ bucket, variance, target, hasPlan }) {
  if (!hasPlan) {
    return <span className="text-xs text-zinc-600 whitespace-nowrap">no target yet</span>;
  }
  const status = bucketStatus(bucket, variance, target);
  if (status === "on") {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap bg-zinc-800 text-zinc-400">
        on plan
      </span>
    );
  }
  const label = variance > 0
    ? `${fmt(variance)} over plan`
    : `${fmt(Math.abs(variance))} under plan`;
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap ${
        status === "good" ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"
      }`}
    >
      {label}
    </span>
  );
}

// ── One bucket card ─────────────────────────────────────────────────────────
function BucketCard({ data, months, hasPlan, children, detail = true }) {
  const meta = BUCKET_META[data.bucket];
  const [open, setOpen] = useState(false);
  const pct = data.target_monthly > 0
    ? Math.min((data.actual_monthly / data.target_monthly) * 100, 100)
    : 0;
  const status = bucketStatus(data.bucket, data.variance / months, data.target_monthly);

  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-5 ring-1 ${meta.ring}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-widest ${meta.tone}`}>
            {meta.label}
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">{meta.blurb}</p>
        </div>
        <Verdict bucket={data.bucket} variance={data.variance / months}
          target={data.target_monthly} hasPlan={hasPlan} />
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-bold text-zinc-100 tabular-nums">
          {fmt(data.actual_monthly)}
        </span>
        <span className="text-sm text-zinc-500">/mo</span>
        <span className="text-sm text-zinc-600 ml-auto tabular-nums">
          {hasPlan ? <>target {fmt(data.target_monthly)} · </> : null}{data.target_pct.toFixed(0)}%
        </span>
      </div>

      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-1">
        <div
          className={`h-full rounded-full transition-all ${status === "bad" ? "bg-red-500" : meta.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-zinc-600 tabular-nums">
        {hasPlan
          ? `${data.actual_pct.toFixed(0)}% of everything coming in`
          : "Record this month's income to see how this compares to plan"}
      </p>

      {children}

      {detail && data.categories.length > 0 && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {open ? "▾" : "▸"} {data.categories.length} {data.categories.length === 1 ? "line" : "lines"}
          </button>
          {open && (
            <div className="mt-2 space-y-1 border-t border-zinc-800 pt-2">
              {data.categories.map((c) => (
                <div key={c.category} className="flex justify-between text-xs">
                  <span className="text-zinc-400 truncate mr-2">{c.category}</span>
                  <span className="text-zinc-300 tabular-nums">{fmt(c.amount / months)}/mo</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Plan editor ─────────────────────────────────────────────────────────────
function PlanEditor({ plan, planBase, months, onSaved, onClose }) {
  const [draft, setDraft] = useState(plan);
  const [saving, setSaving] = useState(false);
  const total = BUCKETS.reduce((s, b) => s + Number(draft[b] || 0), 0);
  const base = planBase / months;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Edit the plan</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl">✕</button>
        </div>
        <p className="text-sm text-zinc-500">
          Each bucket as a share of everything coming in — take-home pay plus payroll
          RRSP and ESPP. At {fmt(base)}/mo, these percentages mean:
        </p>
        <div className="space-y-3">
          {BUCKETS.map((b) => {
            const meta = BUCKET_META[b];
            return (
              <div key={b} className="flex items-center gap-3">
                <span className={`text-xs font-medium w-36 shrink-0 ${meta.tone}`}>{meta.label}</span>
                <input
                  type="range" min={0} max={100} step={1}
                  value={draft[b]}
                  onChange={(e) => setDraft({ ...draft, [b]: Number(e.target.value) })}
                  className="flex-1 accent-yellow-400"
                />
                <input
                  type="number" min={0} max={100}
                  value={draft[b]}
                  onChange={(e) => setDraft({ ...draft, [b]: Number(e.target.value) })}
                  className="w-14 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 text-right"
                />
                <span className="text-xs text-zinc-500 w-20 text-right tabular-nums">
                  {fmt(base * draft[b] / 100)}
                </span>
              </div>
            );
          })}
        </div>
        <div className={`text-sm ${Math.round(total) === 100 ? "text-green-400" : "text-yellow-400"}`}>
          Total: {total.toFixed(0)}%
          {Math.round(total) !== 100 && (
            <span className="text-zinc-500"> — {total > 100 ? "over" : "under"} 100%, the
              leftover shows as unallocated</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await saveBucketPlan(draft);
                onSaved();
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className="bg-yellow-400 text-zinc-900 px-5 py-2 rounded-lg font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save plan"}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Trend chart ─────────────────────────────────────────────────────────────
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs shadow-lg">
      <p className="font-medium text-zinc-300 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="text-zinc-200 tabular-nums">{fmt(p.value)}</span>
        </p>
      ))}
      <p className="flex justify-between gap-4 mt-1.5 pt-1.5 border-t border-zinc-800 text-zinc-300">
        <span>Total</span><span className="tabular-nums">{fmt(total)}</span>
      </p>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function Buckets() {
  const { year, setYear, month, setMonth } = usePeriod();
  const [mode, setMode] = useState("month");
  const [quarter, setQuarter] = useState(Math.ceil(currentMonth / 3));
  const [half, setHalf] = useState(currentMonth <= 6 ? 1 : 2);
  const [years, setYears] = useState([currentYear]);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [goals, setGoals] = useState([]);
  const [planMeta, setPlanMeta] = useState(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [error, setError] = useState("");
  // Auto-snapping to a period with data happens once, on arrival — after that
  // an empty month is the user's own choice and we leave it alone.
  const snapped = useRef(false);

  const [m0, m1] = periodRange(mode, month, quarter, half);
  const label = periodLabel(mode, year, month, quarter, half);

  const load = useCallback(() => {
    setError("");
    const params = mode === "month"
      ? { year, month }
      : { year, startMonth: m0, endMonth: m1 };
    Promise.all([
      getBucketSummary(params).then(setSummary),
      getBucketTrend(year).then((rows) => {
        setTrend(rows);
        // The stored month can point somewhere empty — the calendar moved on,
        // or the year was just snapped backwards. Land on real data instead.
        if (!snapped.current && mode === "month" && rows.length && !rows.some((r) => r.month === month)) {
          snapped.current = true;
          setMonth(Math.max(...rows.map((r) => r.month)));
        }
      }).catch(() => setTrend([])),
      getSavingsGoals().then(setGoals).catch(() => setGoals([])),
      getBucketPlan().then(setPlanMeta).catch(() => {}),
    ]).catch((e) => setError(e.message));
  }, [year, month, mode, m0, m1]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getYears().then((y) => {
      const available = y.length ? y : [currentYear];
      setYears(available);
      // The stored period can point at a year with no data (a new calendar
      // year, or a fresh install). Fall back to the most recent year we have.
      if (!available.includes(year)) {
        snapped.current = false;   // a new year needs its own month snap
        setYear(Math.max(...available));
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = summary?.months ?? 1;
  const byBucket = Object.fromEntries((summary?.buckets ?? []).map((b) => [b.bucket, b]));
  // Without income for the period, every target is $0 and the variance pills lie.
  const hasPlan = (summary?.plan_base ?? 0) > 0;
  const hasActivity = hasPlan || (summary?.allocated ?? 0) > 0;

  const gf = byBucket.guilt_free;
  const guiltFreeNote = (() => {
    if (!hasPlan || !gf) {
      return "Once income is recorded for this period, this is the only number here that needs checking.";
    }
    const status = bucketStatus("guilt_free", gf.variance / months, gf.target_monthly);
    if (status === "on") {
      return "Right on plan. Nothing to look at — what it went to is nobody's business but yours.";
    }
    if (status === "good") {
      return `Inside plan with ${fmt(Math.abs(gf.variance) / months)}/mo to spare. No need to look at what it went to.`;
    }
    return `Over plan by ${fmt(gf.variance / months)}/mo. Either raise the target and fund it from another bucket, or bring the total down — your call which purchases.`;
  })();

  const trendData = trend.map((row) => ({
    name: MONTH_LABELS[row.month],
    ...Object.fromEntries(BUCKETS.map((b) => [BUCKET_META[b].short, row[b]])),
  }));

  const MODES = [["month", "Month"], ["quarter", "Quarter"], ["half", "Half"], ["annual", "Year"]];
  const selectCls = "bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-100";

  return (
    <div className="space-y-6">
      {/* Header + period controls */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Buckets</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Where the money goes — {label}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex gap-0.5 bg-zinc-800 p-0.5 rounded-lg">
            {MODES.map(([val, lbl]) => (
              <button key={val} onClick={() => setMode(val)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === val ? "bg-yellow-400 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
                }`}>
                {lbl}
              </button>
            ))}
          </div>
          {mode === "month" && (
            <select className={selectCls} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_LABELS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          )}
          {mode === "quarter" && (
            <select className={selectCls} value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          )}
          {mode === "half" && (
            <select className={selectCls} value={half} onChange={(e) => setHalf(Number(e.target.value))}>
              <option value={1}>H1 (Jan–Jun)</option>
              <option value={2}>H2 (Jul–Dec)</option>
            </select>
          )}
          <select className={selectCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl px-4 py-3 text-sm text-red-400">
          Failed to load: {error}
        </div>
      )}

      {summary && !hasActivity && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl p-8 text-center">
          <p className="text-zinc-300 font-medium">Nothing recorded for {label}</p>
          <p className="text-zinc-600 text-sm mt-1 max-w-md mx-auto">
            Paste in some transactions and add this period's pay, and the four
            buckets fill themselves in.
          </p>
          <div className="flex gap-2 justify-center mt-4">
            <NavLink to="/add"
              className="bg-yellow-400 text-zinc-900 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-300">
              Paste transactions
            </NavLink>
            <NavLink to="/income"
              className="border border-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm hover:bg-zinc-800">
              Add income
            </NavLink>
          </div>
        </div>
      )}

      {summary && hasActivity && (
        <>
          {/* Plan base headline */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                  Coming in
                </p>
                <p className="text-2xl font-bold text-zinc-100 tabular-nums mt-0.5">
                  {fmt(summary.plan_base_monthly)}<span className="text-sm text-zinc-500 font-normal">/mo</span>
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {fmt(summary.income.take_home / months)} take-home
                  {summary.income.payroll_rrsp_employee + summary.income.payroll_espp > 0 && (
                    <> + {fmt((summary.income.payroll_rrsp_employee + summary.income.payroll_espp) / months)} straight to savings</>
                  )}
                </p>
              </div>
              <button
                onClick={() => setEditingPlan(true)}
                className="text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-400/30 rounded px-3 py-1.5"
              >
                Edit plan
              </button>
            </div>

            {/* Plan vs actual, as one bar */}
            {summary.plan_base > 0 && (
              <div className="space-y-2">
                {[["Plan", BUCKETS.map((b) => byBucket[b]?.target_amount ?? 0)],
                  ["Actual", BUCKETS.map((b) => byBucket[b]?.actual ?? 0)]].map(([rowLabel, values]) => {
                  const shown = values.reduce((s, v) => s + v, 0);
                  const scale = Math.max(summary.plan_base, shown) || 1;
                  return (
                    <div key={rowLabel}>
                      <div className="flex justify-between text-xs text-zinc-500 mb-1">
                        <span>{rowLabel}</span>
                        <span className="tabular-nums">{fmt(shown / months)}/mo</span>
                      </div>
                      <div className="flex h-5 rounded-md overflow-hidden bg-zinc-800 gap-0.5">
                        {BUCKETS.map((b, i) => (
                          <div key={b} title={`${BUCKET_META[b].label}: ${fmt(values[i] / months)}/mo`}
                            style={{ width: `${(values[i] / scale) * 100}%`, background: BUCKET_META[b].fill }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  {BUCKETS.map((b) => (
                    <span key={b} className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: BUCKET_META[b].fill }} />
                      {BUCKET_META[b].short}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {Math.abs(summary.unallocated) > 1 && (
              <p className="text-xs text-zinc-500 mt-3 pt-3 border-t border-zinc-800">
                <span className={summary.unallocated > 0 ? "text-zinc-300" : "text-red-400"}>
                  {fmt(Math.abs(summary.unallocated) / months)}/mo {summary.unallocated > 0 ? "unallocated" : "overspent"}
                </span>
                {summary.unallocated > 0
                  ? " — money that landed in none of the four buckets. Most likely it is sitting in chequing, or it was saved without being recorded."
                  : " — more went out than came in this period."}
              </p>
            )}
          </div>

          {summary.unmapped_categories.length > 0 && (
            <div className="bg-zinc-900 border border-yellow-400/20 rounded-xl p-4 text-sm">
              <p className="text-yellow-400 font-medium text-xs uppercase tracking-wide mb-1">
                {summary.unmapped_categories.length} unbucketed {summary.unmapped_categories.length === 1 ? "category" : "categories"}
              </p>
              <p className="text-zinc-500 text-xs mb-2">
                Counted as guilt-free for now. Assign them so fixed costs stay honest.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {summary.unmapped_categories.slice(0, 10).map((c) => (
                  <span key={c.category} className="text-xs bg-zinc-800 text-zinc-300 rounded px-2 py-0.5">
                    {c.category} {fmt(c.amount)}
                  </span>
                ))}
              </div>
              <NavLink to="/settings#buckets" className="text-xs text-yellow-400 hover:text-yellow-300 mt-2 inline-block">
                Assign buckets →
              </NavLink>
            </div>
          )}

          {/* The four buckets, in the order they deserve attention */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {byBucket.fixed && <BucketCard data={byBucket.fixed} months={months} hasPlan={hasPlan} />}

            {byBucket.short_term && (
              <BucketCard data={byBucket.short_term} months={months} hasPlan={hasPlan}>
                {goals.length > 0 ? (
                  <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
                    {goals.slice(0, 4).map((g) => (
                      <div key={g.id}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-zinc-400 truncate mr-2">{g.name}</span>
                          <span className="text-zinc-300 tabular-nums">
                            {fmt(g.current_amount)} <span className="text-zinc-600">/ {fmt(g.target_amount)}</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full"
                            style={{ width: `${Math.min(g.progress_pct, 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-600">
                    No goals yet. Short-term savings without a named destination tends to
                    get spent — <NavLink to="/net-worth" className="text-yellow-400 hover:text-yellow-300">add one</NavLink>.
                  </p>
                )}
              </BucketCard>
            )}

            {byBucket.meaningful && (
              <BucketCard data={byBucket.meaningful} months={months} hasPlan={hasPlan}>
                {summary.income.payroll_rrsp_employer > 0 && (
                  <p className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
                    Plus {fmt(summary.income.payroll_rrsp_employer / months)}/mo employer match —
                    not counted above, but it is real money going in.
                  </p>
                )}
              </BucketCard>
            )}

            {byBucket.guilt_free && (
              /* Deliberately no line-item breakdown: the whole point of this
                 bucket is that only the total matters. */
              <BucketCard data={byBucket.guilt_free} months={months} hasPlan={hasPlan} detail={false}>
                <p className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
                  {guiltFreeNote}
                </p>
              </BucketCard>
            )}
          </div>

          {/* Trend */}
          {trendData.length > 1 && (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                {year} by month
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trendData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<TrendTooltip />} cursor={{ fill: "#ffffff08" }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
                  {BUCKETS.map((b, i) => (
                    <Bar
                      key={b}
                      dataKey={BUCKET_META[b].short}
                      stackId="buckets"
                      fill={BUCKET_META[b].fill}
                      stroke={BUCKET_SURFACE}
                      strokeWidth={2}
                      radius={i === BUCKETS.length - 1 ? [3, 3, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {editingPlan && planMeta && summary && (
        <PlanEditor
          plan={planMeta.plan}
          planBase={summary.plan_base}
          months={months}
          onSaved={load}
          onClose={() => setEditingPlan(false)}
        />
      )}
    </div>
  );
}

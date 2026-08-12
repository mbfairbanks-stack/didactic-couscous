import { useState, useEffect, useRef } from "react";
import { getBucketSummary, upsertBucketTarget } from "../api";
import { MONTH_LABELS, currentYear, currentMonth, fmtCents as fmt } from "../utils";

const BUCKET_ORDER = ["fixed", "meaningful", "short_term", "hard_limit"];

const BUCKET_ACCENT = {
  fixed:      "text-blue-400",
  meaningful: "text-purple-400",
  short_term: "text-emerald-400",
  hard_limit: "text-yellow-400",
};

const BUCKET_BAR = {
  fixed:      "bg-blue-400",
  meaningful: "bg-purple-400",
  short_term: "bg-emerald-400",
  hard_limit: "bg-yellow-400",
};

function ProgressBar({ actual, target, bucketKey }) {
  if (!target) return <div className="h-1.5 bg-zinc-800 rounded-full" />;
  const pct = Math.min((actual / target) * 100, 100);
  const over = actual > target;
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${over ? "bg-red-500" : BUCKET_BAR[bucketKey]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PctTargetEditor({ bucketKey, year, netIncome, currentPct, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const toDollar = (pct) =>
    netIncome > 0 && pct > 0 ? fmt((netIncome * pct) / 100) : null;

  const startEdit = () => {
    setDraft(currentPct != null ? String(currentPct) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const save = async () => {
    const val = parseFloat(draft);
    if (isNaN(val) || val < 0 || val > 100) { setEditing(false); return; }
    setSaving(true);
    try {
      await upsertBucketTarget({ bucket: bucketKey, year, pct: val });
      onSaved();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    const draftPct = parseFloat(draft);
    const draftDollar = toDollar(draftPct);
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number" min="0" max="100" step="1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-14 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
          disabled={saving}
        />
        <span className="text-xs text-zinc-500">%</span>
        {draftDollar && <span className="text-xs text-zinc-600">= {draftDollar}</span>}
      </div>
    );
  }

  if (currentPct != null) {
    const dollar = toDollar(currentPct);
    return (
      <button onClick={startEdit} className="text-xs text-right hover:text-zinc-300 transition-colors" title="Click to edit">
        <span className="text-zinc-400">{currentPct}%</span>
        {dollar && <span className="text-zinc-600 ml-1">= {dollar}</span>}
      </button>
    );
  }

  return (
    <button onClick={startEdit} className="text-xs text-zinc-600 hover:text-yellow-400 transition-colors">
      + Set % of income
    </button>
  );
}

function CategoryBreakdown({ categories }) {
  const entries = Object.entries(categories || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <p className="text-xs text-zinc-600 py-1">No transactions this month.</p>;
  return (
    <ul className="space-y-1 mt-2">
      {entries.map(([cat, amt]) => (
        <li key={cat} className="flex justify-between text-xs">
          <span className="text-zinc-400 truncate">{cat}</span>
          <span className="text-zinc-300 ml-3 shrink-0">{fmt(amt)}</span>
        </li>
      ))}
    </ul>
  );
}

function SinkingFunds({ funds, month }) {
  const entries = Object.entries(funds || {});
  if (!entries.length) return null;
  return (
    <div className="mt-4 pt-3 border-t border-zinc-800">
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Sinking Funds — YTD</p>
      <ul className="space-y-3">
        {entries.map(([cat, sf]) => {
          const over = sf.ytd_remaining != null && sf.ytd_remaining < 0;
          const pct  = sf.ytd_target ? Math.min((sf.ytd_spent / sf.ytd_target) * 100, 100) : 0;
          return (
            <li key={cat}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300 font-medium">{cat}</span>
                <span className={sf.ytd_remaining != null ? (over ? "text-red-400" : "text-emerald-400") : "text-zinc-500"}>
                  {sf.ytd_remaining != null
                    ? `${over ? "" : "+"}${fmt(sf.ytd_remaining)} ${over ? "over" : "remaining"}`
                    : "no target"}
                </span>
              </div>
              {sf.ytd_target != null && (
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-1">
                  <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-400"}`}
                    style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="flex justify-between text-xs text-zinc-600">
                <span>{fmt(sf.ytd_spent)} spent</span>
                {sf.ytd_target != null && (
                  <span>of {fmt(sf.ytd_target)} ({sf.monthly_target && `$${sf.monthly_target}/mo`})</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PayPeriod({ hl }) {
  if (!hl.period_start) {
    return (
      <div className="mt-4 pt-3 border-t border-zinc-800">
        <p className="text-xs text-zinc-600">No pay dates found — add income entries to enable pay-period tracking.</p>
      </div>
    );
  }

  const start = new Date(hl.period_start + "T00:00:00");
  const end   = new Date(hl.period_end   + "T00:00:00");
  const fmt2  = (d) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  const pct   = hl.period_target ? Math.min((hl.period_actual / hl.period_target) * 100, 100) : 0;
  const over  = hl.period_remaining != null && hl.period_remaining < 0;

  return (
    <div className="mt-4 pt-3 border-t border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wide">This Pay Period</p>
        <span className="text-xs text-zinc-500">{fmt2(start)} – {fmt2(end)}</span>
      </div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-lg font-semibold text-zinc-100">{fmt(hl.period_actual)}</span>
        <span className="text-xs text-zinc-500">
          {hl.period_target != null ? `of ${fmt(hl.period_target)}` : "no target"}
        </span>
      </div>
      {hl.period_target != null && (
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${over ? "bg-red-500" : "bg-yellow-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {hl.period_remaining != null && (
        <p className={`text-xs ${over ? "text-red-400" : "text-zinc-400"}`}>
          {over ? `${fmt(Math.abs(hl.period_remaining))} over` : `${fmt(hl.period_remaining)} remaining`}
        </p>
      )}
    </div>
  );
}

function BucketCard({ bucketKey, data, year, month, netIncome, onTargetSaved }) {
  const [expanded, setExpanded] = useState(false);
  const remaining = data.target != null ? data.target - data.actual : null;
  const over = remaining != null && remaining < 0;
  const accent = BUCKET_ACCENT[bucketKey];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h2 className={`text-sm font-semibold uppercase tracking-wide ${accent}`}>{data.label}</h2>
        <PctTargetEditor
          bucketKey={bucketKey}
          year={year}
          netIncome={netIncome}
          currentPct={data.pct}
          onSaved={onTargetSaved}
        />
      </div>

      {/* Actual */}
      <div>
        <div className="text-3xl font-bold text-zinc-100 tracking-tight">{fmt(data.actual)}</div>
        {remaining != null && (
          <p className={`text-sm mt-0.5 ${over ? "text-red-400" : "text-zinc-400"}`}>
            {over ? `${fmt(Math.abs(remaining))} over budget` : `${fmt(remaining)} remaining`}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <ProgressBar actual={data.actual} target={data.target} bucketKey={bucketKey} />

      {/* Pay period (Hard Limit only) */}
      {bucketKey === "hard_limit" && <PayPeriod hl={data} />}

      {bucketKey === "short_term" && <SinkingFunds funds={data.sinking_funds} month={month} />}

      {/* Category breakdown toggle */}
      {Object.keys(data.categories || {}).length > 0 && (
        <div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
          >
            <span>{expanded ? "▲" : "▼"}</span>
            <span>{expanded ? "Hide" : "Show"} breakdown</span>
          </button>
          {expanded && <CategoryBreakdown categories={data.categories} />}
        </div>
      )}
    </div>
  );
}

export default function Buckets() {
  const [year, setYear]   = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    getBucketSummary(year, month)
      .then(setData)
      .catch((e) => setError(e.message || "Failed to load buckets"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-zinc-100">Buckets</h1>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
          >
            {MONTH_LABELS.map((label, i) => (
              <option key={i + 1} value={i + 1}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 h-44 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          {data.net_income > 0 && (
            <p className="text-xs text-zinc-500">
              Net income this month: <span className="text-zinc-300 font-medium">{fmt(data.net_income)}</span>
              <span className="ml-2 text-zinc-600">— set each bucket as a % below</span>
            </p>
          )}
          {data.net_income === 0 && (
            <p className="text-xs text-zinc-600">
              No income recorded for {MONTH_LABELS[month - 1]} {year} — add income entries to enable % targets.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {BUCKET_ORDER.map((key) => (
              <BucketCard
                key={key}
                bucketKey={key}
                data={data[key]}
                year={year}
                month={month}
                netIncome={data.net_income}
                onTargetSaved={load}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

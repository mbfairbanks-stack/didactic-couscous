import { useState, useEffect, useCallback } from "react";
import {
  getBucketMapping, saveBucketMapping, getHouseRules, saveHouseRules,
} from "../api";
import { BUCKETS, BUCKET_META } from "../constants";

const inputCls =
  "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

/**
 * Which bucket each category counts toward. This is the one mapping the whole
 * app reads from, so it lives next to the category list rather than buried.
 */
export function BucketMapping({ onSaved }) {
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState({});   // name -> bucket
  const [filter, setFilter] = useState("");
  const [showLegacy, setShowLegacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    getBucketMapping()
      .then((d) => { setRows(d.categories); setDirty({}); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const bucketOf = (row) => dirty[row.name] ?? row.bucket;

  const visible = rows.filter((r) => {
    if (r.is_hidden) return false;
    if (!showLegacy && r.is_legacy && !r.unregistered) return false;
    if (filter && !r.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const counts = Object.fromEntries(
    BUCKETS.map((b) => [b, visible.filter((r) => bucketOf(r) === b).length])
  );
  const pendingCount = Object.keys(dirty).length;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveBucketMapping(
        Object.entries(dirty).map(([name, bucket]) => ({ name, bucket }))
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      load();
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="buckets" className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden scroll-mt-20">
      <div className="px-5 py-4 border-b border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-300">Buckets</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Which bucket each category counts toward. Fixed costs and the savings
          buckets are the ones the app pays attention to — anything in guilt-free
          is only ever shown as part of one total.
        </p>
      </div>

      <div className="px-5 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-3">
        <input
          className={`${inputCls} flex-1 min-w-40`}
          placeholder="Filter categories…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={showLegacy} className="accent-yellow-400"
            onChange={(e) => setShowLegacy(e.target.checked)} />
          Show legacy
        </label>
      </div>

      <div className="px-5 py-3 border-b border-zinc-800 flex flex-wrap gap-4">
        {BUCKETS.map((b) => (
          <span key={b} className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: BUCKET_META[b].fill }} />
            {BUCKET_META[b].label}
            <span className="text-zinc-600">({counts[b]})</span>
          </span>
        ))}
      </div>

      {error && (
        <div className="mx-5 mt-3 bg-red-900/20 border border-red-700/50 rounded p-3 text-sm text-red-400">{error}</div>
      )}

      <div className="max-h-[26rem] overflow-y-auto divide-y divide-zinc-800">
        {visible.map((row) => {
          const current = bucketOf(row);
          return (
            <div key={row.name} className="flex items-center gap-3 px-5 py-2">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: BUCKET_META[current]?.fill }} />
              <span className="text-sm text-zinc-300 flex-1 truncate">
                {row.name}
                {row.unregistered && (
                  <span className="ml-2 text-xs text-yellow-600">only on transactions</span>
                )}
                {row.is_legacy && !row.unregistered && (
                  <span className="ml-2 text-xs text-zinc-600">legacy</span>
                )}
              </span>
              <select
                className={`${inputCls} text-xs w-44`}
                value={current}
                onChange={(e) =>
                  setDirty((d) => ({ ...d, [row.name]: e.target.value }))
                }
              >
                {BUCKETS.map((b) => (
                  <option key={b} value={b}>{BUCKET_META[b].label}</option>
                ))}
              </select>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="px-5 py-6 text-sm text-zinc-600 text-center">No categories match.</p>
        )}
      </div>

      <div className="px-5 py-4 border-t border-zinc-700 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || pendingCount === 0}
          className="bg-yellow-400 text-black px-5 py-2 rounded text-sm font-medium hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : pendingCount ? `Save ${pendingCount} change${pendingCount === 1 ? "" : "s"}` : "Save"}
        </button>
        {pendingCount > 0 && (
          <button onClick={() => setDirty({})} className="text-xs text-zinc-500 hover:text-zinc-300">
            Reset
          </button>
        )}
        {saved && <span className="text-green-400 text-sm">Saved!</span>}
      </div>
    </div>
  );
}

const STANCE_LABELS = {
  avalanche: "Avalanche — highest interest rate first",
  snowball: "Snowball — smallest balance first",
  minimums: "Minimums only — put the rest into savings",
  unsure: "Not decided — let the AI compare them",
};

const RULES_PLACEHOLDER = `One per line. For example:

Mortgage renews March 2027 — do not suggest refinancing before then.
We are not moving. Ignore anything that depends on selling the house.
Car is paid off and we are keeping it.
Daycare ends September 2027, freeing up $1,400/mo.`;

/** Standing context handed to the AI on every run. */
export function HouseRules() {
  const [form, setForm] = useState({ house_rules: "", debt_stance: "unsure" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getHouseRules()
      .then((d) => setForm({ house_rules: d.house_rules || "", debt_stance: d.debt_stance || "unsure" }))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveHouseRules(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="insights" className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 scroll-mt-20">
      <div>
        <h2 className="text-sm font-semibold text-zinc-300">AI house rules</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Standing context sent with every insights run, so you stop re-explaining
          the same constraints. The AI treats these as settled and will not argue
          with them or recommend anything they rule out.
        </p>
      </div>

      <div>
        <label className="text-xs text-zinc-500 block mb-1">Debt payoff stance</label>
        <select
          className={`${inputCls} w-full`}
          value={form.debt_stance}
          onChange={(e) => setForm({ ...form, debt_stance: e.target.value })}
        >
          {Object.entries(STANCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <p className="text-xs text-zinc-600 mt-1">
          Pick one and the AI applies it instead of re-litigating strategy every run.
        </p>
      </div>

      <div>
        <label className="text-xs text-zinc-500 block mb-1">House rules</label>
        <textarea
          rows={7}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50 resize-y leading-relaxed"
          placeholder={RULES_PLACEHOLDER}
          value={form.house_rules}
          onChange={(e) => setForm({ ...form, house_rules: e.target.value })}
        />
        <p className="text-xs text-zinc-600 mt-1">
          {form.house_rules.length}/4000 characters.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="bg-yellow-400 text-black px-5 py-2 rounded text-sm font-medium hover:bg-yellow-300 disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-green-400 text-sm">Saved!</span>}
      </div>
    </div>
  );
}

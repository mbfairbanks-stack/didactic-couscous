import { useState, useEffect, useCallback, useRef } from "react";
import {
  getBucketMapping, saveBucketMapping, getHouseRules, saveHouseRules,
} from "../api";
import { BUCKETS, BUCKET_META } from "../constants";
import { fmt } from "../utils";

const inputCls =
  "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

/**
 * Which bucket each category counts toward. This is the one mapping the whole
 * app reads from, so it lives next to the category list rather than buried.
 */
export function BucketMapping({ onSaved }) {
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState({});     // name -> bucket
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [showLegacy, setShowLegacy] = useState(false);
  const [showUnused, setShowUnused] = useState(true);
  const [spendWindow, setSpendWindow] = useState(12);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const lastClicked = useRef(null);
  // mousedown fires before click and reliably carries the modifier keys;
  // reading shiftKey off the click or change event proved unreliable.
  const shiftHeld = useRef(false);

  const load = useCallback(() => {
    getBucketMapping()
      .then((d) => {
        setRows(d.categories);
        setSpendWindow(d.months);
        setDirty({});
        setSelected(new Set());
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const bucketOf = (row) => dirty[row.name] ?? row.bucket;

  const visible = rows.filter((r) => {
    if (r.is_hidden) return false;
    if (!showLegacy && r.is_legacy && !r.unregistered) return false;
    if (!showUnused && !r.total) return false;
    if (bucketFilter !== "all" && bucketOf(r) !== bucketFilter) return false;
    if (filter && !r.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const counts = Object.fromEntries(
    BUCKETS.map((b) => [b, rows.filter((r) => !r.is_hidden && bucketOf(r) === b).length])
  );
  const pendingCount = Object.keys(dirty).length;
  const selectedRows = visible.filter((r) => selected.has(r.name));
  const selectedTotal = selectedRows.reduce((s, r) => s + (r.total || 0), 0);

  // Shift-click selects the range, the way a file list does.
  const toggle = (row, index, shiftKey) => {
    // Read the anchor before the updater runs. React defers state updaters, so
    // assigning lastClicked first would collapse every range to a single row.
    const anchor = lastClicked.current;
    lastClicked.current = index;

    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchor !== null && visible[anchor]) {
        const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
        const turnOn = !next.has(row.name);
        for (let i = from; i <= to; i++) {
          if (turnOn) next.add(visible[i].name);
          else next.delete(visible[i].name);
        }
      } else if (next.has(row.name)) {
        next.delete(row.name);
      } else {
        next.add(row.name);
      }
      return next;
    });
  };

  const moveSelected = (bucket) => {
    if (!bucket || !selected.size) return;
    setDirty((d) => {
      const next = { ...d };
      for (const name of selected) next[name] = bucket;
      return next;
    });
    setSelected(new Set());
  };

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

  const allVisibleSelected = visible.length > 0 && selectedRows.length === visible.length;

  return (
    <div id="buckets" className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden scroll-mt-20">
      <div className="px-5 py-4 border-b border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-300">Buckets</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Which bucket each category counts toward. Tick several and move them in
          one go — shift-click selects a range. Sorted by what each one actually
          costs{spendWindow ? ` over the last ${spendWindow} months` : " (all time)"}, so the
          categories that matter come first.
        </p>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 border-b border-zinc-800 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className={`${inputCls} flex-1 min-w-40`}
            placeholder="Filter categories…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={showUnused} className="accent-yellow-400"
              onChange={(e) => setShowUnused(e.target.checked)} />
            Show unused
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={showLegacy} className="accent-yellow-400"
              onChange={(e) => setShowLegacy(e.target.checked)} />
            Show legacy
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setBucketFilter("all")}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${
              bucketFilter === "all" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            All ({rows.filter((r) => !r.is_hidden).length})
          </button>
          {BUCKETS.map((b) => (
            <button key={b} onClick={() => setBucketFilter(b)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors ${
                bucketFilter === b ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              <span className="w-2 h-2 rounded-sm" style={{ background: BUCKET_META[b].fill }} />
              {BUCKET_META[b].short} ({counts[b]})
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 bg-red-900/20 border border-red-700/50 rounded p-3 text-sm text-red-400">{error}</div>
      )}

      {/* Bulk move bar — only in the way when something is selected */}
      {selected.size > 0 && (
        <div className="px-5 py-3 bg-yellow-400/10 border-b border-yellow-400/20 flex flex-wrap items-center gap-3">
          <span className="text-sm text-zinc-200">
            <strong>{selected.size}</strong> selected
            {selectedTotal > 0 && (
              <span className="text-zinc-400"> · {fmt(selectedTotal)} of spending</span>
            )}
          </span>
          <select
            className={`${inputCls} text-xs`}
            value=""
            onChange={(e) => moveSelected(e.target.value)}
          >
            <option value="">Move all to…</option>
            {BUCKETS.map((b) => (
              <option key={b} value={b}>{BUCKET_META[b].label}</option>
            ))}
          </select>
          <button onClick={() => setSelected(new Set())}
            className="text-xs text-zinc-500 hover:text-zinc-300">
            Clear selection
          </button>
        </div>
      )}

      {/* Select-all header */}
      <div className="px-5 py-2 border-b border-zinc-800 flex items-center gap-3 text-xs text-zinc-500">
        <input
          type="checkbox"
          className="accent-yellow-400"
          checked={allVisibleSelected}
          ref={(el) => {
            if (el) el.indeterminate = selectedRows.length > 0 && !allVisibleSelected;
          }}
          onChange={(e) =>
            setSelected(e.target.checked ? new Set(visible.map((r) => r.name)) : new Set())
          }
        />
        <span className="flex-1">
          {visible.length} shown
          {bucketFilter !== "all" && ` in ${BUCKET_META[bucketFilter].label}`}
        </span>
        <span className="w-24 text-right">Spend</span>
        <span className="w-44">Bucket</span>
      </div>

      <div className="max-h-[28rem] overflow-y-auto divide-y divide-zinc-800">
        {visible.map((row, i) => {
          const current = bucketOf(row);
          const changed = dirty[row.name] && dirty[row.name] !== row.bucket;
          return (
            <div key={row.name}
              className={`flex items-center gap-3 px-5 py-2 ${changed ? "bg-yellow-400/5" : ""}`}>
              <input
                type="checkbox"
                className="accent-yellow-400 shrink-0"
                checked={selected.has(row.name)}
                onChange={() => {}}
                onMouseDown={(e) => { shiftHeld.current = e.shiftKey; }}
                onClick={() => toggle(row, i, shiftHeld.current)}
              />
              <span className="w-2 h-2 rounded-sm shrink-0"
                style={{ background: BUCKET_META[current]?.fill }} />
              <span className="text-sm text-zinc-300 flex-1 truncate">
                {row.name}
                {row.unregistered && (
                  <span className="ml-2 text-xs text-yellow-600">only on transactions</span>
                )}
                {row.is_legacy && !row.unregistered && (
                  <span className="ml-2 text-xs text-zinc-600">legacy</span>
                )}
              </span>
              <span className={`w-24 text-right text-xs tabular-nums ${
                row.total ? "text-zinc-400" : "text-zinc-700"
              }`}>
                {row.total ? fmt(row.total) : "—"}
              </span>
              <select
                className={`${inputCls} text-xs w-44 shrink-0`}
                value={current}
                onChange={(e) => setDirty((d) => ({ ...d, [row.name]: e.target.value }))}
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
            Discard changes
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

import { useState, useEffect, useRef, useCallback } from "react";
import { NavLink } from "react-router-dom";
import {
  parseCsv, importCsvRows, getCategories, getCategoryDefinitions,
  upsertMerchantRule, toast,
} from "../api";
import { BUCKETS, BUCKET_META, getCategoryBucket, updateCategoryGroups } from "../constants";
import { fmt, fmtCents } from "../utils";

const FORMATS = [
  { value: "auto", label: "Auto-detect" },
  { value: "amex", label: "AMEX" },
  { value: "td_visa", label: "TD Visa" },
  { value: "rbc_visa", label: "RBC Visa" },
  { value: "cibc_visa", label: "CIBC Visa" },
];

const PLACEHOLDER = `Paste rows straight from your bank or card statement, e.g.

2026-01-15,Tim Hortons,4.75
2026-01-16,Amazon.ca,53.20

…or the block format AMEX copies:

19 May 26
COUNTRY PAWS DOGPLEX LONDON
$6.10`;

const inputCls =
  "bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-yellow-400/50";
const selectCls =
  "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

function BucketPill({ bucket }) {
  const meta = BUCKET_META[bucket] ?? BUCKET_META.guilt_free;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-500 whitespace-nowrap">
      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: meta.fill }} />
      {meta.short}
    </span>
  );
}

export default function AddTransactions() {
  const [text, setText] = useState("");
  const [format, setFormat] = useState("auto");
  const [source, setSource] = useState("");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [categories, setCategories] = useState([]);
  const [corrections, setCorrections] = useState({});
  const [rememberRules, setRememberRules] = useState(true);
  const textRef = useRef(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
    getCategoryDefinitions().then(updateCategoryGroups).catch(() => {});
    textRef.current?.focus();
  }, []);

  const parse = useCallback(async () => {
    if (!text.trim()) { setError("Nothing to parse — paste some rows first."); return; }
    setParsing(true);
    setError("");
    setResult(null);
    try {
      const res = await parseCsv({ csv_text: text, format, source: source || undefined });
      const parsed = (res.rows || []).map((r) => ({
        ...r,
        category: r.suggested_category || r.category || "",
        source: source || "",
      }));
      setRows(parsed);
      if (!parsed.length) {
        setError("No transactions found in that paste. Try picking the card format explicitly.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  }, [text, format, source]);

  // Cmd/Ctrl+Enter parses straight from the textarea.
  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); parse(); }
  };

  const updateRow = (idx, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    if (field === "category") {
      setCorrections((prev) => ({ ...prev, [idx]: { merchant: rows[idx].merchant, category: value } }));
    }
  };

  const setAllInSelection = (category) => {
    setRows((prev) => prev.map((r) => (r.category ? r : { ...r, category })));
  };

  const keptRows = rows?.filter((r) => !r.is_duplicate) ?? [];
  const uncategorised = keptRows.filter((r) => !r.category).length;
  const duplicates = rows?.filter((r) => r.is_duplicate).length ?? 0;

  const bucketTotals = BUCKETS.map((b) => ({
    bucket: b,
    total: keptRows
      .filter((r) => r.category && getCategoryBucket(r.category) === b)
      .reduce((s, r) => s + Number(r.amount || 0), 0),
  })).filter((x) => x.total > 0);

  const doImport = async () => {
    if (!keptRows.length) return;
    setImporting(true);
    try {
      const res = await importCsvRows({ rows: keptRows });
      setResult(res);
      if (rememberRules) {
        const rules = Object.values(corrections).filter((c) => c.merchant && c.category);
        if (rules.length) {
          await Promise.allSettled(rules.map((c) => upsertMerchantRule(c.merchant, c.category)));
        }
      }
      setCorrections({});
      setRows(null);
      setText("");
      textRef.current?.focus();
    } catch (e) {
      setError(e.message);
      toast(e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Add transactions</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Paste rows from your statement. Categories are guessed from your history —
          fix the ones that matter and import.
        </p>
      </div>

      {/* Paste box — the whole point of the page, so it comes first and is big. */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-3">
        <textarea
          ref={textRef}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-yellow-400/60 resize-y leading-relaxed"
          rows={10}
          placeholder={PLACEHOLDER}
          value={text}
          onChange={(e) => { setText(e.target.value); setRows(null); setResult(null); setError(""); }}
          onKeyDown={onKeyDown}
        />
        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={parse}
            disabled={parsing || !text.trim()}
            className="bg-yellow-400 text-zinc-900 px-5 py-2 rounded-lg font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {parsing ? "Reading…" : "Read it"}
          </button>
          <span className="text-xs text-zinc-600">or press ⌘/Ctrl + Enter</span>
          <div className="ml-auto flex gap-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Format</label>
              <select className={selectCls} value={format} onChange={(e) => setFormat(e.target.value)}>
                {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Card label</label>
              <input
                type="text" placeholder="amex, visa…"
                className={`${selectCls} w-28`}
                value={source} onChange={(e) => setSource(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 text-sm text-red-400">{error}</div>
      )}

      {result && (
        <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 text-sm text-green-400 flex items-center justify-between flex-wrap gap-2">
          <span>
            Imported <strong>{result.imported}</strong> transaction{result.imported !== 1 ? "s" : ""}.
            {result.skipped_duplicates > 0 && (
              <span className="text-zinc-400"> {result.skipped_duplicates} already existed and were skipped.</span>
            )}
          </span>
          <NavLink to="/buckets" className="text-yellow-400 hover:text-yellow-300 text-xs">
            See the buckets →
          </NavLink>
        </div>
      )}

      {/* Review table */}
      {rows && rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-zinc-400">
              <strong className="text-zinc-100">{keptRows.length}</strong> to import
              {duplicates > 0 && <span className="text-zinc-600"> · {duplicates} already imported</span>}
              {uncategorised > 0 && (
                <span className="text-yellow-400"> · {uncategorised} need a category</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {uncategorised > 0 && (
                <select
                  className={inputCls}
                  value=""
                  onChange={(e) => e.target.value && setAllInSelection(e.target.value)}
                >
                  <option value="">Set all blanks to…</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <button onClick={() => { setRows(null); setCorrections({}); }}
                className="text-xs text-zinc-600 hover:text-zinc-400">
                Discard
              </button>
            </div>
          </div>

          {/* What this paste does to each bucket, before committing to it */}
          {bucketTotals.length > 0 && (
            <div className="flex flex-wrap gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
              {bucketTotals.map(({ bucket, total }) => (
                <div key={bucket} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: BUCKET_META[bucket].fill }} />
                  <span className="text-xs text-zinc-500">{BUCKET_META[bucket].label}</span>
                  <span className="text-sm font-semibold text-zinc-200 tabular-nums">{fmt(total)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-800 text-left text-zinc-500 border-b border-zinc-700">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Merchant</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Bucket</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}
                    className={`border-b border-zinc-800 last:border-0 ${
                      row.is_duplicate ? "opacity-40" : "hover:bg-zinc-800/50"
                    } ${!row.category && !row.is_duplicate ? "bg-yellow-400/5" : ""}`}>
                    <td className="px-3 py-1.5 text-zinc-400 whitespace-nowrap">{row.date}</td>
                    <td className="px-3 py-1.5 text-zinc-200 max-w-[220px]">
                      <div className="truncate" title={row.merchant}>{row.merchant}</div>
                      {row.is_duplicate && (
                        <span className="text-xs text-yellow-600 font-medium">already imported</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-zinc-300 tabular-nums whitespace-nowrap">
                      {fmtCents(row.amount)}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        className={`${inputCls} w-40 ${!row.category ? "border-yellow-400/50" : ""}`}
                        value={row.category}
                        onChange={(e) => updateRow(idx, "category", e.target.value)}
                      >
                        <option value="">— pick one —</option>
                        {row.category && !categories.includes(row.category) && (
                          <option value={row.category}>{row.category}</option>
                        )}
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      {row.category ? <BucketPill bucket={getCategoryBucket(row.category)} /> : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button onClick={() => setRows((p) => p.filter((_, i) => i !== idx))}
                        className="text-red-600 hover:text-red-400" title="Remove row">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={doImport}
              disabled={importing || keptRows.length === 0}
              className="bg-yellow-400 text-zinc-900 px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importing ? "Importing…" : `Import ${keptRows.length}`}
            </button>
            {duplicates > 0 && (
              <button
                onClick={() => setRows((p) => p.filter((r) => !r.is_duplicate))}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline"
              >
                Hide the {duplicates} already-imported {duplicates === 1 ? "row" : "rows"}
              </button>
            )}
            <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
              <input type="checkbox" checked={rememberRules} className="accent-yellow-400"
                onChange={(e) => setRememberRules(e.target.checked)} />
              Remember my category fixes for these merchants
            </label>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-600">
        Got a CSV file, a PDF statement, or a spreadsheet instead?{" "}
        <NavLink to="/import" className="text-yellow-400 hover:text-yellow-300">File import →</NavLink>
      </p>
    </div>
  );
}

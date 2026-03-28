import { useState, useRef } from "react";
import { importFile, exportUrl, getYears, deduplicate, cleanupSummary } from "../api";
import { useEffect } from "react";

const MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const currentYear = new Date().getFullYear();

export default function Import() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [exportYear, setExportYear] = useState(currentYear);
  const [exportMonth, setExportMonth] = useState("");
  const [years, setYears] = useState([currentYear]);
  const [deduping, setDeduping] = useState(false);
  const [dedupResult, setDedupResult] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);
  const fileRef = useRef();

  const handleDeduplicate = async () => {
    setDeduping(true);
    setDedupResult(null);
    try {
      const res = await deduplicate();
      setDedupResult(res.duplicates_removed);
    } catch (e) {
      setError(e.message);
    } finally {
      setDeduping(false);
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await cleanupSummary();
      setCleanResult(res.removed);
    } catch (e) {
      setError(e.message);
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".xlsx")) setFile(f);
    else setError("Please drop an .xlsx file");
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const res = await importFile(file);
      setResult(res);
      setFile(null);
      getYears().then((y) => setYears(y.length ? y : [currentYear]));
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const selectCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-100">Import / Export</h1>

      {/* Import section */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Import Spreadsheet</h2>
        <p className="text-sm text-zinc-500">
          Upload your FY24, FY25, or FY26 budget xlsx file. Transactions and income will be imported automatically.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragging
              ? "border-yellow-400 bg-yellow-400/5"
              : "border-zinc-700 hover:border-yellow-400/40 hover:bg-zinc-800"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { setFile(e.target.files[0]); setError(""); }}
          />
          {file ? (
            <div>
              <p className="text-yellow-400 font-medium">{file.name}</p>
              <p className="text-xs text-zinc-600 mt-1">{(file.size / 1024).toFixed(0)} KB — click to change</p>
            </div>
          ) : (
            <div>
              <p className="text-zinc-400 font-medium">Drop xlsx file here</p>
              <p className="text-xs text-zinc-600 mt-1">or click to browse</p>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 text-sm text-red-400">{error}</div>
        )}

        {result && (
          <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 text-sm space-y-1">
            <p className="font-semibold text-green-400">Import complete!</p>
            <p className="text-green-500">Transactions imported: <strong>{result.transactions_imported}</strong></p>
            <p className="text-green-500">Income records imported: <strong>{result.income_imported}</strong></p>
            <p className="text-green-500">Records updated: <strong>{result.records_updated}</strong></p>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!file || importing}
          className="bg-yellow-400 text-black px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {importing ? "Importing..." : "Import File"}
        </button>
      </div>

      {/* Deduplicate section */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Remove Duplicates</h2>
        <p className="text-sm text-zinc-500">
          Scans all transactions and removes exact duplicates — same date, merchant, amount, category, and month.
          Safe to run after re-importing a file.
        </p>
        {dedupResult !== null && (
          <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-sm text-green-400">
            {dedupResult === 0 ? "No duplicates found." : `Removed ${dedupResult} duplicate transaction${dedupResult !== 1 ? "s" : ""}.`}
          </div>
        )}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleDeduplicate}
            disabled={deduping}
            className="bg-zinc-700 text-zinc-100 px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deduping ? "Scanning..." : "Remove Duplicates"}
          </button>
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="bg-red-900/40 text-red-400 border border-red-700/50 px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-red-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cleaning ? "Cleaning..." : "Fix Bad Summary Rows"}
          </button>
        </div>
        {cleanResult !== null && (
          <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-sm text-green-400">
            {cleanResult === 0 ? "No bad rows found." : `Removed ${cleanResult} bad summary row${cleanResult !== 1 ? "s" : ""}.`}
          </div>
        )}
      </div>

      {/* Export section */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Export to Excel</h2>
        <p className="text-sm text-zinc-500">
          Download your budget data as an xlsx file with transactions and monthly summary.
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Year</label>
            <select className={selectCls} value={exportYear} onChange={(e) => setExportYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Month (optional)</label>
            <select className={selectCls} value={exportMonth} onChange={(e) => setExportMonth(e.target.value)}>
              <option value="">Full year</option>
              {MONTH_LABELS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <a
            href={exportUrl(exportYear, exportMonth || undefined)}
            download
            className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium text-sm hover:bg-green-500"
          >
            Download Excel
          </a>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-4 text-sm space-y-1">
        <p className="font-semibold text-yellow-400">Supported formats</p>
        <ul className="list-disc list-inside space-y-0.5 text-zinc-400">
          <li>FY24 — "CC - Jan 24" sheets with VISA/AMEX side-by-side layout</li>
          <li>FY25 — "Jan-2025 (CC)" sheets with single-card layout</li>
          <li>FY26 — "Jan - 2026 (CC)" sheets with single-card layout</li>
        </ul>
        <p className="mt-2 text-zinc-500">Income is imported from the Summary or Balance Sheet tab automatically.</p>
      </div>
    </div>
  );
}

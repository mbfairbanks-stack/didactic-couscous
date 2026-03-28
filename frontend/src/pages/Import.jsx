import { useState, useRef, useEffect } from "react";
import { importFile, exportUrl, getYears, deduplicate, cleanupSummary, parseCsv, importCsvRows } from "../api";
import { MONTH_LABELS, currentYear } from "../utils";

const CARD_FORMATS = [
  { value: "auto", label: "Auto-detect" },
  { value: "amex", label: "AMEX" },
  { value: "td_visa", label: "TD Visa" },
  { value: "rbc_visa", label: "RBC Visa" },
  { value: "cibc_visa", label: "CIBC Visa" },
];

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

  // CSV paste state
  const [csvText, setCsvText] = useState("");
  const [csvFormat, setCsvFormat] = useState("auto");
  const [csvSource, setCsvSource] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState(null);
  const [parseError, setParseError] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState(null);

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

  const handleParse = async () => {
    if (!csvText.trim()) return;
    setParsing(true);
    setParseError("");
    setParsedRows(null);
    setCsvResult(null);
    try {
      const res = await parseCsv({ csv_text: csvText, format: csvFormat, source: csvSource || undefined });
      setParsedRows(res.rows);
      if (!res.rows.length) setParseError("No transactions found in the pasted data.");
    } catch (e) {
      setParseError(e.message);
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (idx, field, value) => {
    setParsedRows((rows) => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRow = (idx) => {
    setParsedRows((rows) => rows.filter((_, i) => i !== idx));
  };

  const handleCsvImport = async () => {
    if (!parsedRows?.length) return;
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const res = await importCsvRows({ rows: parsedRows });
      setCsvResult(res);
      setParsedRows(null);
      setCsvText("");
      getYears().then((y) => setYears(y.length ? y : [currentYear]));
    } catch (e) {
      setParseError(e.message);
    } finally {
      setCsvImporting(false);
    }
  };

  const selectCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";
  const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-yellow-400/50";

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-zinc-100">Import / Export</h1>

      {/* Import section */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Import Spreadsheet</h2>
        <p className="text-sm text-zinc-500">
          Upload your FY24, FY25, or FY26 budget xlsx file. Transactions and income will be imported automatically.
        </p>

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

      {/* CSV Paste Import */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Paste Credit Card CSV</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Copy rows directly from your AMEX, TD, RBC, or CIBC statement and paste below.
            Categories are suggested based on your transaction history.
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Format</label>
            <select className={selectCls} value={csvFormat} onChange={(e) => setCsvFormat(e.target.value)}>
              {CARD_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Source label (optional)</label>
            <input
              type="text"
              placeholder="e.g. amex, visa"
              className={`${selectCls} w-36`}
              value={csvSource}
              onChange={(e) => setCsvSource(e.target.value)}
            />
          </div>
        </div>

        <textarea
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-xs font-mono text-zinc-300 focus:outline-none focus:border-yellow-400/50 resize-y"
          rows={6}
          placeholder={"Paste CSV rows here, e.g.:\n2026-01-15,Tim Hortons,4.75\n2026-01-16,Amazon.ca,53.20\n..."}
          value={csvText}
          onChange={(e) => { setCsvText(e.target.value); setParsedRows(null); setCsvResult(null); setParseError(""); }}
        />

        {parseError && (
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 text-sm text-red-400">{parseError}</div>
        )}

        {csvResult && (
          <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-sm text-green-400">
            Imported <strong>{csvResult.imported}</strong> transactions.
          </div>
        )}

        {!parsedRows ? (
          <button
            onClick={handleParse}
            disabled={!csvText.trim() || parsing}
            className="bg-zinc-700 text-zinc-100 px-5 py-2 rounded-lg font-medium text-sm hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {parsing ? "Parsing..." : "Parse & Review"}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">{parsedRows.length} transactions — review categories before importing</p>
              <button onClick={() => setParsedRows(null)} className="text-xs text-zinc-600 hover:text-zinc-400">Clear</button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-zinc-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-zinc-800 text-left text-zinc-500 border-b border-zinc-700">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Merchant</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/50">
                      <td className="px-3 py-1.5 text-zinc-400">{row.date}</td>
                      <td className="px-3 py-1.5 text-zinc-200 max-w-[180px] truncate">{row.merchant}</td>
                      <td className="px-3 py-1.5 text-right text-zinc-300">${Number(row.amount).toFixed(2)}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          className={`${inputCls} w-32`}
                          value={row.category}
                          onChange={(e) => updateRow(idx, "category", e.target.value)}
                        />
                        {row.suggested && row.suggested !== row.category && (
                          <span className="ml-1 text-zinc-600 italic">← {row.suggested}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          className={`${inputCls} w-20`}
                          value={row.source || ""}
                          onChange={(e) => updateRow(idx, "source", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => removeRow(idx)} className="text-red-600 hover:text-red-400">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={handleCsvImport}
              disabled={csvImporting || parsedRows.length === 0}
              className="bg-yellow-400 text-black px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {csvImporting ? "Importing..." : `Import ${parsedRows.length} Transactions`}
            </button>
          </div>
        )}
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
          <li>CSV paste — AMEX, TD Visa, RBC Visa, CIBC Visa (auto-detected or manually selected)</li>
        </ul>
        <p className="mt-2 text-zinc-500">Income is imported from the Summary or Balance Sheet tab automatically.</p>
      </div>
    </div>
  );
}

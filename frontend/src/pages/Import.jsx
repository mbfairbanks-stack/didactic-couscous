import { useState, useRef } from "react";
import { importFile, exportUrl, getYears } from "../api";
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
  const fileRef = useRef();

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
      // Refresh years list
      getYears().then((y) => setYears(y.length ? y : [currentYear]));
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Import / Export</h1>

      {/* Import section */}
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Import Spreadsheet</h2>
        <p className="text-sm text-gray-500">
          Upload your FY24, FY25, or FY26 budget xlsx file. Transactions and income will be imported automatically.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragging ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
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
              <p className="text-blue-600 font-medium">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(0)} KB — click to change</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-500 font-medium">Drop xlsx file here</p>
              <p className="text-xs text-gray-400 mt-1">or click to browse</p>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-1">
            <p className="font-semibold text-green-700">Import complete!</p>
            <p className="text-green-600">Transactions imported: <strong>{result.transactions_imported}</strong></p>
            <p className="text-green-600">Income records imported: <strong>{result.income_imported}</strong></p>
            <p className="text-green-600">Records updated: <strong>{result.records_updated}</strong></p>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!file || importing}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {importing ? "Importing..." : "Import File"}
        </button>
      </div>

      {/* Export section */}
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Export to Excel</h2>
        <p className="text-sm text-gray-500">
          Download your budget data as an xlsx file with transactions and monthly summary.
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Year</label>
            <select
              className="border rounded px-3 py-1.5 text-sm"
              value={exportYear}
              onChange={(e) => setExportYear(Number(e.target.value))}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Month (optional)</label>
            <select
              className="border rounded px-3 py-1.5 text-sm"
              value={exportMonth}
              onChange={(e) => setExportMonth(e.target.value)}
            >
              <option value="">Full year</option>
              {MONTH_LABELS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <a
            href={exportUrl(exportYear, exportMonth || undefined)}
            download
            className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium text-sm hover:bg-green-700"
          >
            Download Excel
          </a>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 space-y-1">
        <p className="font-semibold">Supported formats</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-600">
          <li>FY24 — "CC - Jan 24" sheets with VISA/AMEX side-by-side layout</li>
          <li>FY25 — "Jan-2025 (CC)" sheets with single-card layout</li>
          <li>FY26 — "Jan - 2026 (CC)" sheets with single-card layout</li>
        </ul>
        <p className="mt-2">Income is imported from the Summary or Balance Sheet tab automatically.</p>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { streamInsights, getYears } from "../api";

const MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

// Minimal markdown renderer for bold (**text**), headers (##), and lists
function renderMarkdown(text) {
  const lines = text.split("\n");
  const elements = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="text-lg font-bold mt-5 mb-2 text-gray-800">
          {inlineFormat(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="text-base font-semibold mt-4 mb-1.5 text-gray-700">
          {inlineFormat(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={key++} className="ml-4 list-disc text-gray-700 leading-relaxed">
          {inlineFormat(line.slice(2))}
        </li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const content = line.replace(/^\d+\.\s/, "");
      elements.push(
        <li key={key++} className="ml-4 list-decimal text-gray-700 leading-relaxed">
          {inlineFormat(content)}
        </li>
      );
    } else if (line.startsWith("---")) {
      elements.push(<hr key={key++} className="my-4 border-gray-200" />);
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-2" />);
    } else {
      elements.push(
        <p key={key++} className="text-gray-700 leading-relaxed">
          {inlineFormat(line)}
        </p>
      );
    }
  }
  return elements;
}

function inlineFormat(text) {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function Insights() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [years, setYears] = useState([currentYear]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
  }, []);

  // Auto-scroll as content streams in
  useEffect(() => {
    if (loading) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [text, loading]);

  const handleGenerate = async () => {
    setText("");
    setError("");
    setLoading(true);
    try {
      await streamInsights(
        year,
        month,
        (chunk) => setText((prev) => prev + chunk),
        () => setLoading(false),
        (err) => { setError(err); setLoading(false); }
      );
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">AI Insights</h1>

      {/* Controls */}
      <div className="bg-white border rounded-xl p-5 flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Year</label>
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Month</label>
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTH_LABELS.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyzing...
            </>
          ) : "Generate Insights"}
        </button>
        <p className="text-xs text-gray-400 self-center">
          Powered by Claude — analysis may take 10–20 seconds
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Error:</strong> {error}
          {error.includes("ANTHROPIC_API_KEY") && (
            <p className="mt-1 text-red-600">
              Set the <code className="bg-red-100 px-1 rounded">ANTHROPIC_API_KEY</code> environment
              variable before starting the backend server.
            </p>
          )}
        </div>
      )}

      {/* Streaming output */}
      {text && (
        <div className="bg-white border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {MONTH_LABELS[month]} {year} — Financial Analysis
            </h2>
            {!loading && (
              <button
                onClick={() => navigator.clipboard.writeText(text)}
                className="text-xs text-gray-400 hover:text-gray-600 border rounded px-2 py-1"
              >
                Copy
              </button>
            )}
          </div>
          <div className="prose-sm space-y-0.5">
            {renderMarkdown(text)}
          </div>
          {loading && (
            <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5 mt-1" />
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {!text && !loading && !error && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 text-center text-gray-400 text-sm">
          Select a month and click Generate Insights to get AI-powered analysis of your spending.
        </div>
      )}
    </div>
  );
}

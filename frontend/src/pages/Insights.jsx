import { useState, useEffect, useRef } from "react";
import { streamInsights, getYears } from "../api";
import { MONTH_LABELS, currentYear, currentMonth } from "../utils";

function inlineFormat(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-yellow-400">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMarkdown(text) {
  const lines = text.split("\n");
  const elements = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="text-base font-bold mt-5 mb-2 text-yellow-400 border-b border-zinc-800 pb-1">
          {inlineFormat(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="text-sm font-semibold mt-4 mb-1.5 text-zinc-200">
          {inlineFormat(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={key++} className="ml-4 list-disc text-zinc-400 leading-relaxed text-sm">
          {inlineFormat(line.slice(2))}
        </li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(
        <li key={key++} className="ml-4 list-decimal text-zinc-400 leading-relaxed text-sm">
          {inlineFormat(line.replace(/^\d+\.\s/, ""))}
        </li>
      );
    } else if (line.startsWith("---")) {
      elements.push(<hr key={key++} className="my-4 border-zinc-800" />);
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-2" />);
    } else {
      elements.push(
        <p key={key++} className="text-zinc-400 leading-relaxed text-sm">
          {inlineFormat(line)}
        </p>
      );
    }
  }
  return elements;
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

  const selectCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-zinc-100">AI Insights</h1>

      {/* Controls */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Year</label>
          <select className={selectCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Month</label>
          <select className={selectCls} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_LABELS.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-yellow-400 text-black px-5 py-2 rounded-lg text-sm font-medium hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              Analyzing...
            </>
          ) : "Generate Insights"}
        </button>
        <p className="text-xs text-zinc-600 self-center">Powered by Claude — takes 10–20 seconds</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 text-sm text-red-400">
          <strong>Error:</strong> {error}
          {error.includes("ANTHROPIC_API_KEY") && (
            <p className="mt-1 text-red-500">
              Set the <code className="bg-red-900/40 px-1 rounded">ANTHROPIC_API_KEY</code> environment
              variable before starting the backend server.
            </p>
          )}
        </div>
      )}

      {/* Streaming output */}
      {text && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              {MONTH_LABELS[month]} {year} — Financial Analysis
            </h2>
            {!loading && (
              <button
                onClick={() => navigator.clipboard.writeText(text)}
                className="text-xs text-zinc-600 hover:text-zinc-400 border border-zinc-700 rounded px-2 py-1 hover:border-zinc-600"
              >
                Copy
              </button>
            )}
          </div>
          <div className="space-y-0.5">
            {renderMarkdown(text)}
          </div>
          {loading && (
            <span className="inline-block w-2 h-4 bg-yellow-400 animate-pulse ml-0.5 mt-1" />
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {!text && !loading && !error && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl p-10 text-center text-zinc-600 text-sm">
          Select a month and click Generate Insights to get AI-powered analysis of your spending.
        </div>
      )}
    </div>
  );
}

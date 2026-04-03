import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { getDebts } from "../api";
import { fmt } from "../utils";

const STORAGE_KEY = "networth_assets";

const DEFAULT_ASSETS = [
  { id: 1, name: "Checking", balance: 0 },
  { id: 2, name: "Savings", balance: 0 },
  { id: 3, name: "RRSP", balance: 0 },
  { id: 4, name: "TFSA", balance: 0 },
];

function loadAssets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_ASSETS.map((a) => ({ ...a }));
}

function saveAssets(assets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
}

let nextId = Date.now();

export default function NetWorth() {
  const [assets, setAssets] = useState(loadAssets);
  const [debts, setDebts] = useState([]);
  const [debtsLoading, setDebtsLoading] = useState(true);
  const [debtsError, setDebtsError] = useState("");

  useEffect(() => {
    getDebts()
      .then(setDebts)
      .catch((e) => setDebtsError(e.message))
      .finally(() => setDebtsLoading(false));
  }, []);

  // Persist assets to localStorage whenever they change
  useEffect(() => {
    saveAssets(assets);
  }, [assets]);

  const updateAsset = (id, field, value) => {
    setAssets((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: field === "balance" ? value : value } : a))
    );
  };

  const addAsset = () => {
    setAssets((prev) => [...prev, { id: ++nextId, name: "", balance: 0 }]);
  };

  const removeAsset = (id) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  };

  const totalAssets = assets.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
  const totalLiabilities = debts.reduce((s, d) => s + (parseFloat(d.current_balance) || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  const chartData = [
    { name: "Assets", value: totalAssets },
    { name: "Liabilities", value: totalLiabilities },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Net Worth</h1>

      {/* Net Worth Headline */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col items-center gap-2">
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Net Worth</p>
        <p className={`text-5xl font-bold ${netWorth >= 0 ? "text-green-400" : "text-red-400"}`}>
          {fmt(netWorth, 2)}
        </p>
        <div className="flex gap-8 mt-3 text-sm">
          <span className="text-zinc-400">
            Assets: <span className="text-green-400 font-semibold">{fmt(totalAssets, 2)}</span>
          </span>
          <span className="text-zinc-400">
            Liabilities: <span className="text-red-400 font-semibold">{fmt(totalLiabilities, 2)}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
            <span className="text-sm font-bold text-green-400 uppercase tracking-widest">Assets</span>
            <span className="text-sm font-semibold text-zinc-300">{fmt(totalAssets, 2)}</span>
          </div>
          <div className="p-4 space-y-2">
            {assets.map((asset) => (
              <div key={asset.id} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Account name"
                  value={asset.name}
                  onChange={(e) => updateAsset(asset.id, "name", e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={asset.balance}
                  onChange={(e) => updateAsset(asset.id, "balance", e.target.value)}
                  className="w-36 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 text-right placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50"
                />
                <button
                  onClick={() => removeAsset(asset.id)}
                  className="text-zinc-600 hover:text-red-400 text-sm px-1"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={addAsset}
              className="mt-2 w-full border border-dashed border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
            >
              + Add account
            </button>
          </div>
          <div className="px-4 py-3 bg-zinc-800/50 border-t border-zinc-700 flex justify-between text-sm">
            <span className="text-zinc-500">Total Assets</span>
            <span className="font-semibold text-green-400">{fmt(totalAssets, 2)}</span>
          </div>
        </div>

        {/* Liabilities Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
            <span className="text-sm font-bold text-red-400 uppercase tracking-widest">Liabilities</span>
            <span className="text-sm font-semibold text-zinc-300">{fmt(totalLiabilities, 2)}</span>
          </div>
          {debtsLoading ? (
            <p className="text-center text-zinc-600 py-10 text-sm">Loading debts...</p>
          ) : debtsError ? (
            <p className="text-center text-red-400 py-10 text-sm">{debtsError}</p>
          ) : debts.length === 0 ? (
            <p className="text-center text-zinc-600 py-10 text-sm">No debts found</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-600">
                  <th className="px-4 py-2 font-medium">Debt</th>
                  <th className="px-4 py-2 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((debt) => (
                  <tr key={debt.id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800">
                    <td className="px-4 py-2.5 text-zinc-200">{debt.name}</td>
                    <td className="px-4 py-2.5 text-right text-red-400 font-medium">
                      {fmt(debt.current_balance, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-4 py-3 bg-zinc-800/50 border-t border-zinc-700 flex justify-between text-sm">
            <span className="text-zinc-500">Total Liabilities</span>
            <span className="font-semibold text-red-400">{fmt(totalLiabilities, 2)}</span>
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">Assets vs Liabilities</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barCategoryGap="40%">
            <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={(v) => "$" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} />
            <Tooltip
              contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
              labelStyle={{ color: "#a1a1aa" }}
              formatter={(value) => [fmt(value, 2), ""]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              <Cell fill="#4ade80" />
              <Cell fill="#f87171" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

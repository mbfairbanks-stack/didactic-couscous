import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { getAssets, createAsset, updateAsset, deleteAsset, syncSavingsAssets, getDebts, getSavingsSummary } from "../api";
import { fmt } from "../utils";
import { currentYear } from "../utils";

const TYPE_COLORS = {
  rrsp: "text-blue-400", espp: "text-purple-400", tfsa: "text-green-400",
  cash: "text-yellow-400", property: "text-orange-400", other: "text-zinc-400",
};
const TYPE_BAR_COLORS = {
  rrsp: "#60a5fa", espp: "#c084fc", tfsa: "#4ade80",
  cash: "#facc15", property: "#fb923c", other: "#71717a",
};
const TYPE_LABELS = {
  rrsp: "RRSP", espp: "ESPP", tfsa: "TFSA", cash: "Cash", property: "Property", other: "Other",
};
// Which asset types are auto-synced from savings data
const AUTO_SYNC_TYPES = new Set(["rrsp", "espp"]);

export default function NetWorth() {
  const [assets, setAssets] = useState([]);
  const [debts, setDebts] = useState([]);
  const [savingsSummary, setSavingsSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [adding, setAdding] = useState(false);
  const [newAsset, setNewAsset] = useState({ name: "", asset_type: "other", balance: "" });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getAssets().then(setAssets),
      getDebts().then(setDebts),
      getSavingsSummary(currentYear).then(setSavingsSummary).catch(() => {}),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError("");
    try {
      const result = await syncSavingsAssets();
      setSyncResult(result);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const startEdit = (asset) => {
    setEditingId(asset.id);
    setEditDraft({ name: asset.name, balance: String(asset.balance), asset_type: asset.asset_type });
  };

  const commitEdit = async (id) => {
    try {
      const asset = assets.find((a) => a.id === id);
      await updateAsset(id, { ...asset, name: editDraft.name, balance: parseFloat(editDraft.balance) || 0, asset_type: editDraft.asset_type });
      setEditingId(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await createAsset({ name: newAsset.name, asset_type: newAsset.asset_type, balance: parseFloat(newAsset.balance) || 0 });
      setNewAsset({ name: "", asset_type: "other", balance: "" });
      setAdding(false);
      load();
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this asset?")) return;
    try {
      await deleteAsset(id);
      load();
    } catch (e) { setError(e.message); }
  };

  const totalAssets = assets.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
  const totalLiabilities = debts.reduce((s, d) => s + (parseFloat(d.current_balance) || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  // Detect stale auto-sync assets (balance = 0 but tracked data exists)
  const rrspAssets = assets.filter((a) => a.asset_type === "rrsp");
  const esppAssets = assets.filter((a) => a.asset_type === "espp");
  const rrspIsStale = rrspAssets.some((a) => a.balance === 0) && savingsSummary?.rrsp_total_ytd > 0;
  const esppIsStale = esppAssets.some((a) => a.balance === 0) && savingsSummary?.espp_current_value > 0;
  const needsSync = rrspIsStale || esppIsStale;

  const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

  // Chart: one bar per asset type
  const assetsByType = Object.entries(
    assets.reduce((acc, a) => {
      acc[a.asset_type] = (acc[a.asset_type] || 0) + (a.balance || 0);
      return acc;
    }, {})
  ).map(([type, value]) => ({ name: TYPE_LABELS[type] || type, value, type }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-zinc-100">Net Worth</h1>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            needsSync
              ? "border-yellow-500/60 text-yellow-400 hover:bg-yellow-400/10 bg-yellow-400/5"
              : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
          } disabled:opacity-40`}
        >
          {syncing ? "Syncing..." : needsSync ? "⚠ Sync RRSP & ESPP" : "Sync RRSP & ESPP"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {syncResult && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-300">
          Synced: RRSP → {fmt(syncResult.rrsp_total)}, ESPP stock → {fmt(syncResult.espp_value)}
          {syncResult.updated.length === 0 && " (no tracked data found — add paycheques on the Income tab first)"}
        </div>
      )}

      {needsSync && !syncResult && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-4 py-3 text-xs text-yellow-400">
          {rrspIsStale && "RRSP asset shows $0 but contributions are tracked. "}
          {esppIsStale && "ESPP asset shows $0 but stock holdings are tracked. "}
          Click "Sync RRSP & ESPP" to update.
        </div>
      )}

      {/* Headline */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col items-center gap-2">
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Net Worth</p>
        <p className={`text-5xl font-bold ${netWorth >= 0 ? "text-green-400" : "text-red-400"}`}>
          {fmt(netWorth, 2)}
        </p>
        <div className="flex gap-8 mt-3 text-sm">
          <span className="text-zinc-400">Assets: <span className="text-green-400 font-semibold">{fmt(totalAssets, 2)}</span></span>
          <span className="text-zinc-400">Liabilities: <span className="text-red-400 font-semibold">{fmt(totalLiabilities, 2)}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
            <span className="text-sm font-bold text-green-400 uppercase tracking-widest">Assets</span>
            <div className="flex gap-2 items-center">
              <span className="text-sm font-semibold text-zinc-300">{fmt(totalAssets, 2)}</span>
              <button onClick={() => setAdding(true)} className="text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-400/30 px-2 py-1 rounded hover:bg-yellow-400/10">
                + Add
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-8 space-y-2 px-4">
              {[1,2,3,4].map(i => <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {assets.map((asset) => {
                const isEditing = editingId === asset.id;
                const colorCls = TYPE_COLORS[asset.asset_type] || "text-zinc-400";
                const isStale = asset.balance === 0 && AUTO_SYNC_TYPES.has(asset.asset_type);
                return (
                  <div key={asset.id} className={`flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800/40 ${isStale ? "bg-yellow-900/5" : ""}`}>
                    {isEditing ? (
                      <>
                        <input className={`${inputCls} flex-1`} value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                        <select className={`${inputCls} w-24`} value={editDraft.asset_type}
                          onChange={(e) => setEditDraft({ ...editDraft, asset_type: e.target.value })}>
                          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <input type="number" step="0.01" className={`${inputCls} w-28 text-right`}
                          value={editDraft.balance}
                          onChange={(e) => setEditDraft({ ...editDraft, balance: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(asset.id); if (e.key === "Escape") setEditingId(null); }} />
                        <button onClick={() => commitEdit(asset.id)} className="text-yellow-400 text-xs hover:text-yellow-300">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-zinc-600 text-xs hover:text-zinc-400">✕</button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="text-zinc-200 text-sm">{asset.name}</span>
                          <span className={`text-xs ml-2 ${colorCls}`}>{TYPE_LABELS[asset.asset_type]}</span>
                          {AUTO_SYNC_TYPES.has(asset.asset_type) && (
                            <span className="text-xs ml-1.5 text-zinc-600">auto-sync</span>
                          )}
                        </div>
                        <span className={`text-sm font-semibold tabular-nums ${isStale ? "text-yellow-600" : "text-zinc-100"}`}>
                          {fmt(asset.balance, 2)}
                          {isStale && <span className="text-yellow-600 ml-1 text-xs">⚠</span>}
                        </span>
                        <button onClick={() => startEdit(asset)} className="text-zinc-600 hover:text-zinc-300 text-xs px-1">Edit</button>
                        <button onClick={() => handleDelete(asset.id)} className="text-zinc-700 hover:text-red-400 text-xs px-1">✕</button>
                      </>
                    )}
                  </div>
                );
              })}

              {adding && (
                <form onSubmit={handleAdd} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/30">
                  <input autoFocus required placeholder="Account name" className={`${inputCls} flex-1`}
                    value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} />
                  <select className={`${inputCls} w-24`} value={newAsset.asset_type}
                    onChange={(e) => setNewAsset({ ...newAsset, asset_type: e.target.value })}>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input type="number" step="0.01" placeholder="0.00" className={`${inputCls} w-28 text-right`}
                    value={newAsset.balance} onChange={(e) => setNewAsset({ ...newAsset, balance: e.target.value })} />
                  <button type="submit" className="text-yellow-400 text-xs hover:text-yellow-300">Add</button>
                  <button type="button" onClick={() => setAdding(false)} className="text-zinc-600 text-xs hover:text-zinc-400">✕</button>
                </form>
              )}
            </div>
          )}

          <div className="px-4 py-3 bg-zinc-800/50 border-t border-zinc-700 flex justify-between text-sm">
            <span className="text-zinc-500">Total Assets</span>
            <span className="font-semibold text-green-400">{fmt(totalAssets, 2)}</span>
          </div>
        </div>

        {/* Liabilities */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
            <span className="text-sm font-bold text-red-400 uppercase tracking-widest">Liabilities</span>
            <span className="text-sm font-semibold text-zinc-300">{fmt(totalLiabilities, 2)}</span>
          </div>
          {loading ? (
            <p className="text-center text-zinc-600 py-10 text-sm">Loading...</p>
          ) : debts.length === 0 ? (
            <p className="text-center text-zinc-600 py-10 text-sm">No debts — add them on the Debts page</p>
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
                    <td className="px-4 py-2.5 text-right text-red-400 font-medium">{fmt(debt.current_balance, 2)}</td>
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

      {/* Asset breakdown chart */}
      {assetsByType.length > 0 && totalAssets > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">Asset Breakdown</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={assetsByType} barCategoryGap="35%">
              <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => "$" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(value) => [fmt(value, 2), ""]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {assetsByType.map((entry) => (
                  <Cell key={entry.type} fill={TYPE_BAR_COLORS[entry.type] || "#71717a"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 justify-center">
            {assetsByType.map((entry) => (
              <div key={entry.type} className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: TYPE_BAR_COLORS[entry.type] || "#71717a" }} />
                {entry.name}: <span className="text-zinc-200 font-medium">{fmt(entry.value)}</span>
                <span className="text-zinc-600">({totalAssets > 0 ? Math.round(entry.value / totalAssets * 100) : 0}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

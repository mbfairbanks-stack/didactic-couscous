import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, Legend } from "recharts";
import { getAssets, createAsset, updateAsset, deleteAsset, syncSavingsAssets, getDebts, getSavingsSummary, getNetWorthHistory, snapshotNetWorth, deleteNetWorthSnapshot, getSavingsGoals, createSavingsGoal, updateSavingsGoal, deleteSavingsGoal } from "../api";
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
  const [newAsset, setNewAsset] = useState({ name: "", asset_type: "other", balance: "", liquidity: "liquid" });
  const [history, setHistory] = useState([]);
  const [goals, setGoals] = useState([]);
  const [goalForm, setGoalForm] = useState({ name: "", target_amount: "", current_amount: "", target_date: "", notes: "" });
  const [editGoalId, setEditGoalId] = useState(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);

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

  const loadHistory = async () => {
    try {
      const h = await getNetWorthHistory();
      setHistory(h);
    } catch (e) { /* ignore */ }
  };

  const loadGoals = async () => {
    try {
      const g = await getSavingsGoals();
      setGoals(g);
    } catch (e) { /* ignore */ }
  };

  const takeSnapshot = async () => {
    setSnapshotting(true);
    try {
      await snapshotNetWorth();
      await loadHistory();
    } finally {
      setSnapshotting(false);
    }
  };

  const removeSnapshot = async (id) => {
    await deleteNetWorthSnapshot(id);
    loadHistory();
  };

  const saveGoal = async () => {
    const body = {
      name: goalForm.name,
      target_amount: parseFloat(goalForm.target_amount),
      current_amount: parseFloat(goalForm.current_amount) || 0,
      target_date: goalForm.target_date || null,
      notes: goalForm.notes || null,
    };
    if (editGoalId) {
      await updateSavingsGoal(editGoalId, body);
    } else {
      await createSavingsGoal(body);
    }
    setGoalForm({ name: "", target_amount: "", current_amount: "", target_date: "", notes: "" });
    setEditGoalId(null);
    setShowGoalForm(false);
    loadGoals();
  };

  const startEditGoal = (g) => {
    setEditGoalId(g.id);
    setGoalForm({
      name: g.name,
      target_amount: String(g.target_amount),
      current_amount: String(g.current_amount),
      target_date: g.target_date || "",
      notes: g.notes || "",
    });
    setShowGoalForm(true);
  };

  const removeGoal = async (id) => {
    if (!confirm("Delete this savings goal?")) return;
    await deleteSavingsGoal(id);
    loadGoals();
  };

  useEffect(() => {
    loadHistory();
    loadGoals();
  }, []);

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
    setEditDraft({ name: asset.name, balance: String(asset.balance), asset_type: asset.asset_type, auto_sync: asset.auto_sync, liquidity: asset.liquidity || "liquid" });
  };

  const commitEdit = async (id) => {
    try {
      const asset = assets.find((a) => a.id === id);
      await updateAsset(id, { ...asset, name: editDraft.name, balance: parseFloat(editDraft.balance) || 0, asset_type: editDraft.asset_type, auto_sync: editDraft.auto_sync, liquidity: editDraft.liquidity });
      setEditingId(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const toggleAutoSync = async (asset) => {
    try {
      await updateAsset(asset.id, { ...asset, auto_sync: !asset.auto_sync });
      load();
    } catch (e) { setError(e.message); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await createAsset({ name: newAsset.name, asset_type: newAsset.asset_type, balance: parseFloat(newAsset.balance) || 0, liquidity: newAsset.liquidity });
      setNewAsset({ name: "", asset_type: "other", balance: "", liquidity: "liquid" });
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

  const liquidAssets = assets.filter((a) => (a.liquidity || "liquid") === "liquid");
  const illiquidAssets = assets.filter((a) => a.liquidity === "illiquid");
  const nonMortgageDebts = debts.filter((d) => d.debt_type !== "mortgage");
  const totalLiquidAssets = liquidAssets.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
  const totalNonMortgageDebts = nonMortgageDebts.reduce((s, d) => s + (parseFloat(d.current_balance) || 0), 0);
  const liquidNetWorth = totalLiquidAssets - totalNonMortgageDebts;

  // Mortgage equity cards
  const mortgageEquities = debts.filter((d) => d.debt_type === "mortgage" && d.equity != null);

  // Detect stale auto-sync assets (balance = 0 but tracked data exists)
  const rrspIsStale = assets.some((a) => a.auto_sync && a.asset_type === "rrsp" && a.balance === 0) && savingsSummary?.rrsp_total_ytd > 0;
  const esppIsStale = assets.some((a) => a.auto_sync && a.asset_type === "espp" && a.balance === 0) && savingsSummary?.espp_current_value > 0;
  const needsSync = rrspIsStale || esppIsStale;

  const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

  // Chart: one bar per asset type
  const assetsByType = Object.entries(
    assets.reduce((acc, a) => {
      acc[a.asset_type] = (acc[a.asset_type] || 0) + (a.balance || 0);
      return acc;
    }, {})
  ).map(([type, value]) => ({ name: TYPE_LABELS[type] || type, value, type }));

  const renderAssetRow = (asset) => {
    const isEditing = editingId === asset.id;
    const colorCls = TYPE_COLORS[asset.asset_type] || "text-zinc-400";
    const isStale = asset.auto_sync && asset.balance === 0 && (savingsSummary?.rrsp_total_ytd > 0 || savingsSummary?.espp_current_value > 0);
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
            <select className={`${inputCls} w-24`} value={editDraft.liquidity}
              onChange={(e) => setEditDraft({ ...editDraft, liquidity: e.target.value })}>
              <option value="liquid">Liquid</option>
              <option value="illiquid">Illiquid</option>
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
            </div>
            <button
              onClick={() => toggleAutoSync(asset)}
              title={asset.auto_sync ? "Payroll sync on — click to disable" : "Enable payroll sync for this asset"}
              className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                asset.auto_sync
                  ? "border-yellow-500/50 text-yellow-400 bg-yellow-400/10"
                  : "border-zinc-700 text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {asset.auto_sync ? "payroll sync" : "manual"}
            </button>
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
  };

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
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm">
          {syncResult.updated.length > 0 ? (
            <p className="text-green-400">
              Synced: {syncResult.updated.map((a) => `${a.name} → ${fmt(a.balance)}`).join(", ")}
            </p>
          ) : (
            <p className="text-zinc-500">Nothing to sync — mark an asset as "payroll sync" first, or add paycheques on the Income tab.</p>
          )}
        </div>
      )}

      {needsSync && !syncResult && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-4 py-3 text-xs text-yellow-400">
          {rrspIsStale && "RRSP asset shows $0 but contributions are tracked. "}
          {esppIsStale && "ESPP asset shows $0 but stock holdings are tracked. "}
          Click "Sync RRSP & ESPP" to update.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col items-center gap-2">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Liquid Net Worth</p>
          <p className={`text-4xl font-bold ${liquidNetWorth >= 0 ? "text-green-400" : "text-red-400"}`}>
            {fmt(liquidNetWorth, 2)}
          </p>
          <div className="flex gap-6 mt-2 text-xs">
            <span className="text-zinc-400">Liquid assets: <span className="text-green-400 font-semibold">{fmt(totalLiquidAssets, 2)}</span></span>
            <span className="text-zinc-400">Non-mortgage debts: <span className="text-red-400 font-semibold">{fmt(totalNonMortgageDebts, 2)}</span></span>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col items-center gap-2">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Total Net Worth</p>
          <p className={`text-4xl font-bold ${netWorth >= 0 ? "text-green-400" : "text-red-400"}`}>
            {fmt(netWorth, 2)}
          </p>
          <div className="flex gap-6 mt-2 text-xs">
            <span className="text-zinc-400">Assets: <span className="text-green-400 font-semibold">{fmt(totalAssets, 2)}</span></span>
            <span className="text-zinc-400">Liabilities: <span className="text-red-400 font-semibold">{fmt(totalLiabilities, 2)}</span></span>
          </div>
        </div>
      </div>

      {/* Net Worth History */}
      <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-yellow-400 font-semibold">Net Worth History</h2>
          <button
            onClick={takeSnapshot}
            disabled={snapshotting}
            className="bg-yellow-400 text-zinc-900 px-3 py-1 rounded text-sm font-semibold hover:bg-yellow-300 disabled:opacity-50"
          >
            {snapshotting ? "Saving…" : "Take Snapshot"}
          </button>
        </div>
        {history.length >= 2 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#facc15" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#facc15" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="lnwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="snapshot_date" tick={{ fontSize: 11, fill: "#a1a1aa" }} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(v, name) => [`$${v.toLocaleString("en-CA")}`, name === "net_worth" ? "Net Worth" : "Liquid NW"]}
              />
              <Legend formatter={(v) => v === "net_worth" ? "Net Worth" : "Liquid NW"} />
              <Area type="monotone" dataKey="net_worth" stroke="#facc15" fill="url(#nwGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="liquid_net_worth" stroke="#60a5fa" fill="url(#lnwGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-4">Take at least 2 snapshots to see your net worth trajectory.</p>
        )}
        {history.length > 0 && (
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {[...history].reverse().map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs text-zinc-400">
                <span>{s.snapshot_date}</span>
                <span className="text-yellow-400 font-mono">${s.net_worth.toLocaleString("en-CA")}</span>
                <button onClick={() => removeSnapshot(s.id)} className="hover:text-red-400 ml-2">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Savings Goals */}
      <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-yellow-400 font-semibold">Savings Goals</h2>
          <button
            onClick={() => { setShowGoalForm(!showGoalForm); setEditGoalId(null); setGoalForm({ name: "", target_amount: "", current_amount: "", target_date: "", notes: "" }); }}
            className="bg-yellow-400 text-zinc-900 px-3 py-1 rounded text-sm font-semibold hover:bg-yellow-300"
          >
            {showGoalForm ? "Cancel" : "+ Goal"}
          </button>
        </div>

        {showGoalForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Goal Name</label>
                <input className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400" value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="Emergency Fund" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Target Amount ($)</label>
                <input className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400" type="number" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} placeholder="10000" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Current Amount ($)</label>
                <input className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400" type="number" value={goalForm.current_amount} onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Target Date</label>
                <input className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400" type="date" value={goalForm.target_date} onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} />
              </div>
            </div>
            <button onClick={saveGoal} className="bg-yellow-400 text-zinc-900 px-6 py-2 rounded text-sm font-semibold hover:bg-yellow-300">
              {editGoalId ? "Save Changes" : "Add Goal"}
            </button>
          </div>
        )}

        {goals.length === 0 && !showGoalForm ? (
          <p className="text-zinc-500 text-sm text-center py-2">No savings goals yet.</p>
        ) : (
          <div className="space-y-3">
            {goals.map((g) => (
              <div key={g.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-100 font-medium">{g.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 font-mono text-xs">${g.current_amount.toLocaleString("en-CA")} / ${g.target_amount.toLocaleString("en-CA")}</span>
                    <button onClick={() => startEditGoal(g)} className="text-xs text-zinc-400 hover:text-yellow-400">Edit</button>
                    <button onClick={() => removeGoal(g.id)} className="text-xs text-zinc-400 hover:text-red-400">✕</button>
                  </div>
                </div>
                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(g.progress_pct, 100)}%`,
                      background: g.progress_pct >= 100 ? "#4ade80" : "#facc15",
                    }}
                  />
                </div>
                <p className="text-xs text-zinc-500">{g.progress_pct}%{g.target_date ? ` · target ${g.target_date}` : ""}</p>
              </div>
            ))}
          </div>
        )}
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
              {/* Liquid group */}
              {liquidAssets.length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-zinc-800/30">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Liquid</span>
                  </div>
                  {liquidAssets.map(renderAssetRow)}
                </>
              )}

              {/* Illiquid group */}
              {illiquidAssets.length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-zinc-800/30">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Illiquid</span>
                  </div>
                  {illiquidAssets.map(renderAssetRow)}
                </>
              )}

              {/* Mortgage equity cards */}
              {mortgageEquities.length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-zinc-800/30">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Home Equity</span>
                  </div>
                  {mortgageEquities.map((debt) => (
                    <div key={`equity-${debt.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800/40">
                      <div className="flex-1 min-w-0">
                        <span className="text-zinc-200 text-sm">{debt.name}</span>
                        <span className="text-xs ml-2 text-orange-400">Home Equity</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-zinc-100">{fmt(debt.equity, 2)}</span>
                    </div>
                  ))}
                </>
              )}

              {adding && (
                <form onSubmit={handleAdd} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/30 flex-wrap">
                  <input autoFocus required placeholder="Account name" className={`${inputCls} flex-1 min-w-32`}
                    value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} />
                  <select className={`${inputCls} w-24`} value={newAsset.asset_type}
                    onChange={(e) => setNewAsset({ ...newAsset, asset_type: e.target.value })}>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <select className={`${inputCls} w-24`} value={newAsset.liquidity}
                    onChange={(e) => setNewAsset({ ...newAsset, liquidity: e.target.value })}>
                    <option value="liquid">Liquid</option>
                    <option value="illiquid">Illiquid</option>
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

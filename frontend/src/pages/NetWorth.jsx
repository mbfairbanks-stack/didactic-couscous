import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, Legend,
} from "recharts";
import {
  getAssets, createAsset, updateAsset, deleteAsset, syncSavingsAssets,
  getDebts, getSavingsSummary, getNetWorthHistory, snapshotNetWorth,
  deleteNetWorthSnapshot, getSavingsGoals, createSavingsGoal,
  updateSavingsGoal, deleteSavingsGoal, getMilestones, createMilestone,
  deleteMilestone, getEmergencyFund,
  getIncome, getEsppPurchases, createEsppPurchase, updateEsppPurchase,
  deleteEsppPurchase, getYears,
} from "../api";
import { fmt, currentYear, MONTH_LABELS } from "../utils";
import { useSettings } from "../contexts/SettingsContext";

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

const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";
const inputClsLg = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50";

const RRSP_MAX = 8400;

function ProgressBar({ pct, color = "bg-yellow-400" }) {
  return (
    <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function Tab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
        active
          ? "bg-zinc-800 text-yellow-400 border-b-2 border-yellow-400"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
      }`}
    >
      {label}
    </button>
  );
}

// ── Emergency Fund Card ───────────────────────────────────────────────────────
function EmergencyFundCard() {
  const [data, setData] = useState(null);
  const [target, setTarget] = useState(6);

  useEffect(() => {
    getEmergencyFund().then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  const targetAmount = data.targets[`${target}_months`] || 0;
  const pct = targetAmount > 0 ? Math.min((data.liquid_cash / targetAmount) * 100, 100) : 0;
  const covered = data.months_covered ?? 0;
  const shortfall = Math.max(targetAmount - data.liquid_cash, 0);

  const status =
    covered >= 9 ? { label: "Excellent", color: "text-green-400", barColor: "bg-green-400" }
    : covered >= 6 ? { label: "Healthy", color: "text-green-400", barColor: "bg-green-400" }
    : covered >= 3 ? { label: "Adequate", color: "text-yellow-400", barColor: "bg-yellow-400" }
    : { label: "Under-funded", color: "text-red-400", barColor: "bg-red-400" };

  return (
    <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-yellow-400 font-semibold">Emergency Fund</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Based on liquid cash assets vs avg monthly expenses</p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {[3, 6, 9].map((m) => (
            <button
              key={m}
              onClick={() => setTarget(m)}
              className={`px-2.5 py-1 rounded transition-colors ${
                target === m
                  ? "bg-yellow-400 text-zinc-900 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 border border-zinc-700"
              }`}
            >
              {m}mo
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-zinc-500 mb-0.5">Liquid Cash</p>
          <p className="text-lg font-bold text-zinc-100">{fmt(data.liquid_cash)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-0.5">{target}-Month Target</p>
          <p className="text-lg font-bold text-zinc-100">{fmt(targetAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-0.5">Status</p>
          <p className={`text-lg font-bold ${status.color}`}>{status.label}</p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-zinc-500">
          <span>{covered.toFixed(1)} months covered · avg expenses {fmt(data.avg_monthly_expenses)}/mo</span>
          <span className="font-medium text-zinc-300">{pct.toFixed(0)}%</span>
        </div>
        <ProgressBar pct={pct} color={status.barColor} />
        {shortfall > 0 && (
          <p className="text-xs text-zinc-500">
            {fmt(shortfall)} more needed to reach {target}-month target
          </p>
        )}
      </div>

      <div className="flex gap-4 text-xs">
        {[
          { mo: 3, label: "Starter" },
          { mo: 6, label: "Healthy" },
          { mo: 9, label: "Robust" },
        ].map(({ mo, label }) => {
          const amt = data.targets[`${mo}_months`];
          const done = data.liquid_cash >= amt;
          return (
            <div key={mo} className="flex items-center gap-1">
              <span className={done ? "text-green-400" : "text-zinc-600"}>{done ? "✓" : "○"}</span>
              <span className={done ? "text-zinc-300" : "text-zinc-600"}>{label} ({mo}mo)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NetWorth() {
  const { settings } = useSettings();
  const [tab, setTab] = useState("overview");

  // ── Assets / liabilities ──
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

  // ── History / goals / milestones ──
  const [history, setHistory] = useState([]);
  const [goals, setGoals] = useState([]);
  const [goalForm, setGoalForm] = useState({ name: "", target_amount: "", current_amount: "", target_date: "", notes: "" });
  const [editGoalId, setEditGoalId] = useState(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [milestones, setMilestones] = useState([]);
  const [milestoneForm, setMilestoneForm] = useState({ label: "", target_amount: "" });
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);

  // ── Savings (RRSP / ESPP) ──
  const p1 = settings.person_1 || "Person 1";
  const [savingsYear, setSavingsYear] = useState(currentYear);
  const [years, setYears] = useState([currentYear]);
  const [incomeRecords, setIncomeRecords] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const emptyPurchase = {
    purchase_date: new Date().toISOString().slice(0, 10),
    period_start: "", period_end: "",
    total_deducted: "", shares_purchased: "",
    purchase_price: "", market_price: "",
    notes: "",
    alloc_rrsp: "", alloc_tfsa: "", alloc_other: "", alloc_other_label: "",
  };
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchase);
  const [editPurchaseId, setEditPurchaseId] = useState(null);
  const [savingPurchase, setSavingPurchase] = useState(false);

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

  const loadHistory = async () => {
    try { setHistory(await getNetWorthHistory()); } catch {}
  };
  const loadGoals = async () => {
    try { setGoals(await getSavingsGoals()); } catch {}
  };
  const loadMilestones = async () => {
    try { setMilestones(await getMilestones()); } catch {}
  };

  const loadSavingsTab = useCallback(() => {
    Promise.all([
      getIncome({ year: savingsYear }).then(setIncomeRecords).catch(() => setIncomeRecords([])),
      getEsppPurchases().then(setPurchases).catch(() => setPurchases([])),
    ]);
  }, [savingsYear]);

  useEffect(() => { load(); loadHistory(); loadGoals(); loadMilestones(); }, [load]);
  useEffect(() => { getYears().then((y) => setYears(y.length ? y : [currentYear])).catch(() => {}); }, []);
  useEffect(() => { if (tab === "savings") loadSavingsTab(); }, [tab, loadSavingsTab]);

  // ── Snapshot / Goals / Milestones actions ──
  const takeSnapshot = async () => {
    setSnapshotting(true);
    try { await snapshotNetWorth(); await loadHistory(); } finally { setSnapshotting(false); }
  };
  const removeSnapshot = async (id) => { await deleteNetWorthSnapshot(id); loadHistory(); };

  const saveGoal = async () => {
    const body = {
      name: goalForm.name,
      target_amount: parseFloat(goalForm.target_amount),
      current_amount: parseFloat(goalForm.current_amount) || 0,
      target_date: goalForm.target_date || null,
      notes: goalForm.notes || null,
    };
    if (editGoalId) await updateSavingsGoal(editGoalId, body);
    else await createSavingsGoal(body);
    setGoalForm({ name: "", target_amount: "", current_amount: "", target_date: "", notes: "" });
    setEditGoalId(null);
    setShowGoalForm(false);
    loadGoals();
  };
  const startEditGoal = (g) => {
    setEditGoalId(g.id);
    setGoalForm({ name: g.name, target_amount: String(g.target_amount), current_amount: String(g.current_amount), target_date: g.target_date || "", notes: g.notes || "" });
    setShowGoalForm(true);
  };
  const removeGoal = async (id) => { if (!confirm("Delete this savings goal?")) return; await deleteSavingsGoal(id); loadGoals(); };

  const saveMilestone = async () => {
    if (!milestoneForm.label || !milestoneForm.target_amount) return;
    await createMilestone({ label: milestoneForm.label, target_amount: parseFloat(milestoneForm.target_amount) });
    setMilestoneForm({ label: "", target_amount: "" });
    setShowMilestoneForm(false);
    loadMilestones();
  };
  const removeMilestone = async (id) => { await deleteMilestone(id); loadMilestones(); };

  // ── Assets actions ──
  const handleSync = async () => {
    setSyncing(true); setSyncResult(null); setError("");
    try { setSyncResult(await syncSavingsAssets()); load(); }
    catch (e) { setError(e.message); }
    finally { setSyncing(false); }
  };
  const startEdit = (asset) => {
    setEditingId(asset.id);
    setEditDraft({ name: asset.name, balance: String(asset.balance), asset_type: asset.asset_type, auto_sync: asset.auto_sync, liquidity: asset.liquidity || "liquid" });
  };
  const commitEdit = async (id) => {
    try {
      const asset = assets.find((a) => a.id === id);
      await updateAsset(id, { ...asset, name: editDraft.name, balance: parseFloat(editDraft.balance) || 0, asset_type: editDraft.asset_type, auto_sync: editDraft.auto_sync, liquidity: editDraft.liquidity });
      setEditingId(null); load();
    } catch (e) { setError(e.message); }
  };
  const toggleAutoSync = async (asset) => {
    try { await updateAsset(asset.id, { ...asset, auto_sync: !asset.auto_sync }); load(); }
    catch (e) { setError(e.message); }
  };
  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await createAsset({ name: newAsset.name, asset_type: newAsset.asset_type, balance: parseFloat(newAsset.balance) || 0, liquidity: newAsset.liquidity });
      setNewAsset({ name: "", asset_type: "other", balance: "", liquidity: "liquid" }); setAdding(false); load();
    } catch (e) { setError(e.message); }
  };
  const handleDelete = async (id) => {
    if (!confirm("Remove this asset?")) return;
    try { await deleteAsset(id); load(); }
    catch (e) { setError(e.message); }
  };

  // ── ESPP actions ──
  const handlePurchaseSubmit = async (e) => {
    e.preventDefault(); setSavingPurchase(true); setError("");
    const allocObj = {
      rrsp: parseFloat(purchaseForm.alloc_rrsp) || 0,
      tfsa: parseFloat(purchaseForm.alloc_tfsa) || 0,
      other: parseFloat(purchaseForm.alloc_other) || 0,
      other_label: purchaseForm.alloc_other_label || "",
    };
    const body = {
      purchase_date: purchaseForm.purchase_date,
      period_start: purchaseForm.period_start || null,
      period_end: purchaseForm.period_end || null,
      total_deducted: parseFloat(purchaseForm.total_deducted) || 0,
      shares_purchased: parseFloat(purchaseForm.shares_purchased) || 0,
      purchase_price: parseFloat(purchaseForm.purchase_price) || 0,
      market_price: parseFloat(purchaseForm.market_price) || 0,
      current_price: 0,
      notes: purchaseForm.notes || null,
      allocation_json: JSON.stringify(allocObj),
    };
    try {
      if (editPurchaseId) await updateEsppPurchase(editPurchaseId, body);
      else await createEsppPurchase(body);
      setShowPurchaseForm(false); setEditPurchaseId(null); setPurchaseForm(emptyPurchase);
      loadSavingsTab();
    } catch (e) { setError(e.message); }
    finally { setSavingPurchase(false); }
  };
  const handleEditPurchase = (p) => {
    let alloc = {};
    try { alloc = JSON.parse(p.allocation_json || "{}"); } catch {}
    setPurchaseForm({
      purchase_date: p.purchase_date, period_start: p.period_start || "", period_end: p.period_end || "",
      total_deducted: String(p.total_deducted), shares_purchased: String(p.shares_purchased),
      purchase_price: String(p.purchase_price), market_price: String(p.market_price),
      notes: p.notes || "",
      alloc_rrsp: alloc.rrsp ? String(alloc.rrsp) : "",
      alloc_tfsa: alloc.tfsa ? String(alloc.tfsa) : "",
      alloc_other: alloc.other ? String(alloc.other) : "",
      alloc_other_label: alloc.other_label || "",
    });
    setEditPurchaseId(p.id); setShowPurchaseForm(true);
  };
  const handleDeletePurchase = async (id) => {
    if (!confirm("Delete this purchase?")) return;
    await deleteEsppPurchase(id); loadSavingsTab();
  };

  // ── Derived values ──
  const totalAssets = assets.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
  const totalLiabilities = debts.reduce((s, d) => s + (parseFloat(d.current_balance) || 0), 0);
  const netWorth = totalAssets - totalLiabilities;
  const liquidAssets = assets.filter((a) => (a.liquidity || "liquid") === "liquid");
  const illiquidAssets = assets.filter((a) => a.liquidity === "illiquid");
  const nonMortgageDebts = debts.filter((d) => d.debt_type !== "mortgage");
  const totalLiquidAssets = liquidAssets.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
  const totalNonMortgageDebts = nonMortgageDebts.reduce((s, d) => s + (parseFloat(d.current_balance) || 0), 0);
  const liquidNetWorth = totalLiquidAssets - totalNonMortgageDebts;
  const mortgageEquities = debts.filter((d) => d.debt_type === "mortgage" && d.equity != null);
  const rrspIsStale = assets.some((a) => a.auto_sync && a.asset_type === "rrsp" && a.balance === 0) && savingsSummary?.rrsp_total_ytd > 0;
  const esppIsStale = assets.some((a) => a.auto_sync && a.asset_type === "espp" && a.balance === 0) && savingsSummary?.espp_current_value > 0;
  const needsSync = rrspIsStale || esppIsStale;
  const assetsByType = Object.entries(
    assets.reduce((acc, a) => { acc[a.asset_type] = (acc[a.asset_type] || 0) + (a.balance || 0); return acc; }, {})
  ).map(([type, value]) => ({ name: TYPE_LABELS[type] || type, value, type }));

  const paycheckLog = Object.entries(
    incomeRecords.reduce((acc, r) => {
      const key = r.pay_date || "unspecified";
      if (!acc[key]) acc[key] = { pay_date: key, year: r.year, month: r.month, net: 0, rrsp_employee: 0, rrsp_employer: 0, espp_deduction: 0 };
      acc[key].net += r.amount;
      acc[key].rrsp_employee += r.rrsp_employee || 0;
      acc[key].rrsp_employer += r.rrsp_employer || 0;
      acc[key].espp_deduction += r.espp_deduction || 0;
      return acc;
    }, {})
  ).map(([, v]) => v).filter((v) => v.rrsp_employee > 0 || v.espp_deduction > 0).sort((a, b) => a.pay_date.localeCompare(b.pay_date));

  const renderAssetRow = (asset) => {
    const isEditing = editingId === asset.id;
    const colorCls = TYPE_COLORS[asset.asset_type] || "text-zinc-400";
    const isStale = asset.auto_sync && asset.balance === 0 && (savingsSummary?.rrsp_total_ytd > 0 || savingsSummary?.espp_current_value > 0);
    return (
      <div key={asset.id} className={`flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800/40 ${isStale ? "bg-yellow-900/5" : ""}`}>
        {isEditing ? (
          <>
            <input className={`${inputCls} flex-1`} value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
            <select className={`${inputCls} w-24`} value={editDraft.asset_type} onChange={(e) => setEditDraft({ ...editDraft, asset_type: e.target.value })}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className={`${inputCls} w-24`} value={editDraft.liquidity} onChange={(e) => setEditDraft({ ...editDraft, liquidity: e.target.value })}>
              <option value="liquid">Liquid</option>
              <option value="illiquid">Illiquid</option>
            </select>
            <input type="number" step="0.01" className={`${inputCls} w-28 text-right`} value={editDraft.balance}
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
            <button onClick={() => toggleAutoSync(asset)} title={asset.auto_sync ? "Payroll sync on" : "Enable payroll sync"}
              className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${asset.auto_sync ? "border-yellow-500/50 text-yellow-400 bg-yellow-400/10" : "border-zinc-700 text-zinc-600 hover:text-zinc-400"}`}>
              {asset.auto_sync ? "payroll sync" : "manual"}
            </button>
            <span className={`text-sm font-semibold tabular-nums ${isStale ? "text-yellow-600" : "text-zinc-100"}`}>
              {fmt(asset.balance, 2)}{isStale && <span className="text-yellow-600 ml-1 text-xs">⚠</span>}
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
        <button onClick={handleSync} disabled={syncing}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${needsSync ? "border-yellow-500/60 text-yellow-400 hover:bg-yellow-400/10 bg-yellow-400/5" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"} disabled:opacity-40`}>
          {syncing ? "Syncing..." : needsSync ? "⚠ Sync RRSP & ESPP" : "Sync RRSP & ESPP"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {syncResult && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm">
          {syncResult.updated.length > 0
            ? <p className="text-green-400">Synced: {syncResult.updated.map((a) => `${a.name} → ${fmt(a.balance)}`).join(", ")}</p>
            : <p className="text-zinc-500">Nothing to sync — mark an asset as "payroll sync" first.</p>}
        </div>
      )}
      {needsSync && !syncResult && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-4 py-3 text-xs text-yellow-400">
          {rrspIsStale && "RRSP asset shows $0 but contributions are tracked. "}
          {esppIsStale && "ESPP asset shows $0 but stock holdings are tracked. "}
          Click "Sync RRSP & ESPP" to update.
        </div>
      )}

      {/* Summary cards — always visible */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col items-center gap-2">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Liquid Net Worth</p>
          <p className={`text-4xl font-bold ${liquidNetWorth >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(liquidNetWorth, 2)}</p>
          <div className="flex gap-6 mt-2 text-xs">
            <span className="text-zinc-400">Liquid assets: <span className="text-green-400 font-semibold">{fmt(totalLiquidAssets, 2)}</span></span>
            <span className="text-zinc-400">Non-mortgage debts: <span className="text-red-400 font-semibold">{fmt(totalNonMortgageDebts, 2)}</span></span>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col items-center gap-2">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Total Net Worth</p>
          <p className={`text-4xl font-bold ${netWorth >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(netWorth, 2)}</p>
          <div className="flex gap-6 mt-2 text-xs">
            <span className="text-zinc-400">Assets: <span className="text-green-400 font-semibold">{fmt(totalAssets, 2)}</span></span>
            <span className="text-zinc-400">Liabilities: <span className="text-red-400 font-semibold">{fmt(totalLiabilities, 2)}</span></span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800 flex gap-1">
        <Tab label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
        <Tab label="Goals" active={tab === "goals"} onClick={() => setTab("goals")} />
        <Tab label="Savings" active={tab === "savings"} onClick={() => setTab("savings")} />
      </div>

      {/* ── Overview Tab ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Net Worth History */}
          <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-yellow-400 font-semibold">Net Worth History</h2>
              <button onClick={takeSnapshot} disabled={snapshotting}
                className="bg-yellow-400 text-zinc-900 px-3 py-1 rounded text-sm font-semibold hover:bg-yellow-300 disabled:opacity-50">
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

          {/* Assets & Liabilities */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
                <span className="text-sm font-bold text-green-400 uppercase tracking-widest">Assets</span>
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-semibold text-zinc-300">{fmt(totalAssets, 2)}</span>
                  <button onClick={() => setAdding(true)} className="text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-400/30 px-2 py-1 rounded hover:bg-yellow-400/10">+ Add</button>
                </div>
              </div>
              {loading ? (
                <div className="py-8 space-y-2 px-4">{[1,2,3,4].map(i => <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />)}</div>
              ) : (
                <div className="divide-y divide-zinc-800/60">
                  {liquidAssets.length > 0 && (<><div className="px-4 py-1.5 bg-zinc-800/30"><span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Liquid</span></div>{liquidAssets.map(renderAssetRow)}</>)}
                  {illiquidAssets.length > 0 && (<><div className="px-4 py-1.5 bg-zinc-800/30"><span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Illiquid</span></div>{illiquidAssets.map(renderAssetRow)}</>)}
                  {mortgageEquities.length > 0 && (
                    <>
                      <div className="px-4 py-1.5 bg-zinc-800/30"><span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Home Equity</span></div>
                      {mortgageEquities.map((debt) => (
                        <div key={`equity-${debt.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800/40">
                          <div className="flex-1 min-w-0"><span className="text-zinc-200 text-sm">{debt.name}</span><span className="text-xs ml-2 text-orange-400">Home Equity</span></div>
                          <span className="text-sm font-semibold tabular-nums text-zinc-100">{fmt(debt.equity, 2)}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {adding && (
                    <form onSubmit={handleAdd} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/30 flex-wrap">
                      <input autoFocus required placeholder="Account name" className={`${inputCls} flex-1 min-w-32`} value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} />
                      <select className={`${inputCls} w-24`} value={newAsset.asset_type} onChange={(e) => setNewAsset({ ...newAsset, asset_type: e.target.value })}>
                        {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <select className={`${inputCls} w-24`} value={newAsset.liquidity} onChange={(e) => setNewAsset({ ...newAsset, liquidity: e.target.value })}>
                        <option value="liquid">Liquid</option>
                        <option value="illiquid">Illiquid</option>
                      </select>
                      <input type="number" step="0.01" placeholder="0.00" className={`${inputCls} w-28 text-right`} value={newAsset.balance} onChange={(e) => setNewAsset({ ...newAsset, balance: e.target.value })} />
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

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
                <span className="text-sm font-bold text-red-400 uppercase tracking-widest">Liabilities</span>
                <span className="text-sm font-semibold text-zinc-300">{fmt(totalLiabilities, 2)}</span>
              </div>
              {loading ? <p className="text-center text-zinc-600 py-10 text-sm">Loading...</p>
                : debts.length === 0 ? <p className="text-center text-zinc-600 py-10 text-sm">No debts — add them on the Debts page</p>
                : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-zinc-800 text-left text-zinc-600"><th className="px-4 py-2 font-medium">Debt</th><th className="px-4 py-2 font-medium text-right">Balance</th></tr></thead>
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
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => "$" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} />
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} labelStyle={{ color: "#a1a1aa" }} formatter={(value) => [fmt(value, 2), ""]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {assetsByType.map((entry) => <Cell key={entry.type} fill={TYPE_BAR_COLORS[entry.type] || "#71717a"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
      )}

      {/* ── Goals Tab ── */}
      {tab === "goals" && (
        <div className="space-y-6">
          <EmergencyFundCard />

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
                    <input className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400" value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="House down payment" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Target Amount ($)</label>
                    <input type="number" className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} placeholder="50000" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Current Amount ($)</label>
                    <input type="number" className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400" value={goalForm.current_amount} onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Target Date</label>
                    <input type="date" className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400" value={goalForm.target_date} onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} />
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
                    <ProgressBar pct={g.progress_pct} color={g.progress_pct >= 100 ? "bg-green-400" : "bg-yellow-400"} />
                    <p className="text-xs text-zinc-500">{g.progress_pct}%{g.target_date ? ` · target ${g.target_date}` : ""}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Net Worth Milestones */}
          <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-yellow-400 font-semibold">Net Worth Milestones</h2>
              <button onClick={() => setShowMilestoneForm(!showMilestoneForm)} className="bg-yellow-400 text-zinc-900 px-3 py-1 rounded text-sm font-semibold hover:bg-yellow-300">
                {showMilestoneForm ? "Cancel" : "+ Milestone"}
              </button>
            </div>
            {showMilestoneForm && (
              <div className="flex gap-3 flex-wrap">
                <input className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
                  placeholder='Label e.g. "First $100k"' value={milestoneForm.label} onChange={(e) => setMilestoneForm({ ...milestoneForm, label: e.target.value })} />
                <input type="number" className="w-36 bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400"
                  placeholder="Target $" value={milestoneForm.target_amount} onChange={(e) => setMilestoneForm({ ...milestoneForm, target_amount: e.target.value })} />
                <button onClick={saveMilestone} className="bg-yellow-400 text-zinc-900 px-4 py-2 rounded text-sm font-semibold hover:bg-yellow-300">Add</button>
              </div>
            )}
            {milestones.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-2">No milestones set. Add goals like "First $100k" or "Debt-free".</p>
            ) : (
              <div className="space-y-3">
                {milestones.map((m) => (
                  <div key={m.id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        {m.is_achieved && <span className="text-green-400 text-xs">✓</span>}
                        <span className={`font-medium ${m.is_achieved ? "text-green-400" : "text-zinc-100"}`}>{m.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 font-mono">${m.target_amount.toLocaleString("en-CA")}</span>
                        {m.achieved_at && <span className="text-xs text-zinc-500">{m.achieved_at}</span>}
                        <button onClick={() => removeMilestone(m.id)} className="text-xs text-zinc-500 hover:text-red-400">✕</button>
                      </div>
                    </div>
                    <ProgressBar pct={m.progress_pct} color={m.is_achieved ? "bg-green-400" : "bg-yellow-400"} />
                    <p className="text-xs text-zinc-500 mt-0.5">{m.progress_pct}%</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Savings Tab ── */}
      {tab === "savings" && (
        <div className="space-y-6">
          <p className="text-xs text-zinc-600">
            Savings data is sourced from paycheck entries on the <a href="/income" className="text-yellow-500 hover:text-yellow-400 underline underline-offset-2">Income tab</a>.
          </p>

          {savingsSummary && (
            <>
              {/* RRSP */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-blue-400">RRSP</h2>
                  <div className="flex items-center gap-2">
                    {savingsSummary.rrsp_carryover > 0 && (
                      <span className="text-xs bg-blue-900/40 border border-blue-700/40 text-blue-300 px-2 py-0.5 rounded-full">+{fmt(savingsSummary.rrsp_carryover)} carried over</span>
                    )}
                    <select className={inputClsLg} value={savingsYear} onChange={(e) => setSavingsYear(Number(e.target.value))}>
                      {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div><p className="text-xs text-zinc-500 mb-0.5">Your Contributions</p><p className="text-xl font-bold text-zinc-100">{fmt(savingsSummary.rrsp_employee_ytd)}</p></div>
                  <div><p className="text-xs text-zinc-500 mb-0.5">Employer Match (50%)</p><p className="text-xl font-bold text-green-400">{fmt(savingsSummary.rrsp_employer_ytd)}</p></div>
                  <div><p className="text-xs text-zinc-500 mb-0.5">Total RRSP Added</p><p className="text-xl font-bold text-yellow-400">{fmt(savingsSummary.rrsp_total_ytd)}</p></div>
                  <div><p className="text-xs text-zinc-500 mb-0.5">Remaining Room</p><p className={`text-xl font-bold ${savingsSummary.rrsp_remaining === 0 ? "text-green-400" : "text-zinc-100"}`}>{fmt(savingsSummary.rrsp_remaining)}</p></div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>Progress to {fmt(savingsSummary.rrsp_effective_cap)} cap</span>
                    <span className="font-medium text-zinc-300">{savingsSummary.rrsp_pct}%</span>
                  </div>
                  <ProgressBar pct={savingsSummary.rrsp_pct} color={savingsSummary.rrsp_pct >= 100 ? "bg-green-500" : "bg-blue-500"} />
                </div>
              </div>

              {/* ESPP */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-purple-400">ESPP — Block (SQ) Stock</h2>
                  <button onClick={() => { setShowPurchaseForm(true); setEditPurchaseId(null); setPurchaseForm(emptyPurchase); }}
                    className="text-xs border border-zinc-700 text-zinc-400 px-3 py-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200">
                    + Log Purchase
                  </button>
                </div>
                {(() => {
                  const today = new Date();
                  const y = today.getFullYear(), m = today.getMonth() + 1, d = today.getDate();
                  const lastEvent = (m > 11 || (m === 11 && d >= 15)) ? `${y}-11-15`
                    : (m > 5 || (m === 5 && d >= 15)) ? `${y}-05-15`
                    : `${y - 1}-11-15`;
                  const hasEntry = purchases.some(p => (p.purchase_date || "").startsWith(lastEvent.slice(0, 7)));
                  if (hasEntry) return null;
                  return (
                    <div className="flex items-center justify-between gap-3 bg-purple-950/50 border border-purple-800/60 rounded-lg px-4 py-3">
                      <div>
                        <p className="text-xs font-semibold text-purple-300">Purchase event on {lastEvent} — not yet logged</p>
                        <p className="text-xs text-purple-500 mt-0.5">Log this purchase and allocate the proceeds to your savings goals.</p>
                      </div>
                      <button
                        onClick={() => { setPurchaseForm({ ...emptyPurchase, purchase_date: lastEvent }); setEditPurchaseId(null); setShowPurchaseForm(true); }}
                        className="flex-shrink-0 text-xs bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded font-medium">
                        Log Now
                      </button>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div><p className="text-xs text-zinc-500 mb-0.5">Deducted YTD ({savingsYear})</p><p className="text-xl font-bold text-zinc-100">{fmt(savingsSummary.espp_deducted_ytd)}</p><p className="text-xs text-zinc-600 mt-0.5">10%/15% of gross pay</p></div>
                  <div><p className="text-xs text-zinc-500 mb-0.5">Pending Balance</p><p className="text-xl font-bold text-yellow-400">{fmt(savingsSummary.espp_pending_all_time)}</p><p className="text-xs text-zinc-600 mt-0.5">not yet purchased</p></div>
                  <div><p className="text-xs text-zinc-500 mb-0.5">Proceeds YTD</p><p className="text-xl font-bold text-purple-400">{fmt(savingsSummary.espp_current_value)}</p><p className="text-xs text-zinc-600 mt-0.5">sold on purchase</p></div>
                  <div><p className="text-xs text-zinc-500 mb-0.5">Discount Benefit</p><p className="text-xl font-bold text-green-400">15%</p><p className="text-xs text-zinc-600 mt-0.5">~17.6% instant gain</p></div>
                </div>
                {purchases.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Purchase History</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-800 text-left text-zinc-600 text-xs">
                            <th className="pb-2 pr-4">Date</th><th className="pb-2 pr-4 text-right">Deducted</th>
                            <th className="pb-2 pr-4 text-right">Shares</th><th className="pb-2 pr-4 text-right">Sell $</th>
                            <th className="pb-2 pr-4 text-right">Proceeds</th>
                            <th className="pb-2 pr-4 text-right text-green-400">Profit</th><th className="pb-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchases.map((p) => {
                            const proceeds = p.shares_purchased * p.market_price;
                            const profit = proceeds - p.total_deducted;
                            let alloc = {};
                            try { alloc = JSON.parse(p.allocation_json || "{}"); } catch {}
                            const allocTotal = (alloc.rrsp || 0) + (alloc.tfsa || 0) + (alloc.other || 0);
                            return (
                              <tr key={p.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                                <td className="py-2 pr-4 text-zinc-400">{p.purchase_date}</td>
                                <td className="py-2 pr-4 text-right text-zinc-300">{fmt(p.total_deducted)}</td>
                                <td className="py-2 pr-4 text-right text-zinc-300">{p.shares_purchased}</td>
                                <td className="py-2 pr-4 text-right text-zinc-300">${p.market_price?.toFixed(2)}</td>
                                <td className="py-2 pr-4 text-right text-zinc-100">{fmt(proceeds)}</td>
                                <td className={`py-2 pr-4 text-right font-medium ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {profit >= 0 ? "+" : ""}{fmt(profit)}
                                  {allocTotal > 0 && <span className="block text-xs text-zinc-600 font-normal">{fmt(allocTotal)} allocated</span>}
                                </td>
                                <td className="py-2 text-right">
                                  <button onClick={() => handleEditPurchase(p)} className="text-yellow-400 hover:text-yellow-300 text-xs mr-2">Edit</button>
                                  <button onClick={() => handleDeletePurchase(p.id)} className="text-red-600 hover:text-red-400 text-xs">Delete</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Paycheck savings log */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">Paycheck Savings Log — {savingsYear}</span>
              <span className="text-xs text-zinc-500">{paycheckLog.length} paychecks with savings</span>
            </div>
            {paycheckLog.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-zinc-500 font-medium">No savings data for {savingsYear}</p>
                <p className="text-zinc-600 text-sm mt-1">Add RRSP or ESPP amounts when logging paycheques on the <a href="/income" className="text-yellow-500 hover:text-yellow-400 underline underline-offset-2">Income tab</a>.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700 text-left text-zinc-500 text-xs bg-zinc-800/50">
                      <th className="px-4 py-2">Pay Date</th><th className="px-4 py-2 text-right">Net Pay</th>
                      <th className="px-4 py-2 text-right text-blue-400">RRSP (You)</th><th className="px-4 py-2 text-right text-green-400">RRSP Match</th>
                      <th className="px-4 py-2 text-right text-purple-400">ESPP</th><th className="px-4 py-2 text-right text-yellow-400">Total Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paycheckLog.map((c) => {
                      const total = c.rrsp_employee + c.rrsp_employer + c.espp_deduction;
                      const savingsRate = c.net > 0 ? ((c.rrsp_employee + c.espp_deduction) / c.net * 100).toFixed(0) : 0;
                      return (
                        <tr key={c.pay_date} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40">
                          <td className="px-4 py-2.5 text-zinc-400">{c.pay_date}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-300">{fmt(c.net)}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-200">{fmt(c.rrsp_employee)}</td>
                          <td className="px-4 py-2.5 text-right text-green-400">{fmt(c.rrsp_employer)}</td>
                          <td className="px-4 py-2.5 text-right text-purple-400">{fmt(c.espp_deduction)}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-yellow-400">{fmt(total)}<span className="text-zinc-600 text-xs ml-1">({savingsRate}%)</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {paycheckLog.length > 1 && (() => {
                    const t = paycheckLog.reduce((s, c) => ({ net: s.net + c.net, re: s.re + c.rrsp_employee, rr: s.rr + c.rrsp_employer, espp: s.espp + c.espp_deduction }), { net: 0, re: 0, rr: 0, espp: 0 });
                    return (
                      <tfoot>
                        <tr className="border-t border-zinc-700 bg-zinc-800/50 font-semibold text-xs">
                          <td className="px-4 py-2 text-zinc-500 uppercase tracking-wide">YTD Total</td>
                          <td className="px-4 py-2 text-right text-zinc-300">{fmt(t.net)}</td>
                          <td className="px-4 py-2 text-right text-zinc-200">{fmt(t.re)}</td>
                          <td className="px-4 py-2 text-right text-green-400">{fmt(t.rr)}</td>
                          <td className="px-4 py-2 text-right text-purple-400">{fmt(t.espp)}</td>
                          <td className="px-4 py-2 text-right text-yellow-400">{fmt(t.re + t.rr + t.espp)}</td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ESPP purchase modal */}
      {showPurchaseForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-1 text-zinc-100">{editPurchaseId ? "Edit" : "Log"} ESPP Purchase</h2>
            <p className="text-xs text-zinc-500 mb-4">Record when your ESPP period closes and stock is purchased at the 15% discount.</p>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <form onSubmit={handlePurchaseSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-zinc-500">Purchase Date</label><input type="date" required className={`w-full mt-0.5 ${inputClsLg}`} value={purchaseForm.purchase_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })} /></div>
                <div><label className="text-xs text-zinc-500">Total $ Deducted</label><input type="number" step="0.01" min="0" className={`w-full mt-0.5 ${inputClsLg}`} value={purchaseForm.total_deducted} onChange={(e) => setPurchaseForm({ ...purchaseForm, total_deducted: e.target.value })} placeholder="0.00" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-zinc-500">Period Start</label><input type="date" className={`w-full mt-0.5 ${inputClsLg}`} value={purchaseForm.period_start} onChange={(e) => setPurchaseForm({ ...purchaseForm, period_start: e.target.value })} /></div>
                <div><label className="text-xs text-zinc-500">Period End</label><input type="date" className={`w-full mt-0.5 ${inputClsLg}`} value={purchaseForm.period_end} onChange={(e) => setPurchaseForm({ ...purchaseForm, period_end: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-zinc-500">Shares Purchased</label><input type="number" step="0.0001" min="0" className={`w-full mt-0.5 ${inputClsLg}`} value={purchaseForm.shares_purchased} onChange={(e) => setPurchaseForm({ ...purchaseForm, shares_purchased: e.target.value })} placeholder="0" /></div>
                <div><label className="text-xs text-zinc-500">Buy Price / Share</label><input type="number" step="0.01" min="0" className={`w-full mt-0.5 ${inputClsLg}`} value={purchaseForm.purchase_price} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_price: e.target.value })} placeholder="0.00" /></div>
                <div><label className="text-xs text-zinc-500">Sell Price / Share</label><input type="number" step="0.01" min="0" className={`w-full mt-0.5 ${inputClsLg}`} value={purchaseForm.market_price} onChange={(e) => setPurchaseForm({ ...purchaseForm, market_price: e.target.value })} placeholder="0.00" /></div>
              </div>
              {/* Computed proceeds summary */}
              {(() => {
                const shares = parseFloat(purchaseForm.shares_purchased) || 0;
                const sellPrice = parseFloat(purchaseForm.market_price) || 0;
                const deducted = parseFloat(purchaseForm.total_deducted) || 0;
                const proceeds = shares * sellPrice;
                const profit = proceeds - deducted;
                if (!proceeds) return null;
                return (
                  <div className="bg-zinc-800/60 rounded-lg px-4 py-3 flex gap-6 text-sm">
                    <div><p className="text-xs text-zinc-500">Proceeds</p><p className="font-semibold text-zinc-100">{fmt(proceeds)}</p></div>
                    <div><p className="text-xs text-zinc-500">Profit</p><p className={`font-semibold ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>{profit >= 0 ? "+" : ""}{fmt(profit)}</p></div>
                  </div>
                );
              })()}
              <div><label className="text-xs text-zinc-500">Notes (optional)</label><input type="text" className={`w-full mt-0.5 ${inputClsLg}`} value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} /></div>
              {/* Allocation section */}
              <div className="border border-zinc-800 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Allocate Proceeds</p>
                <p className="text-xs text-zinc-600">Where did you put the proceeds from selling? (optional)</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-blue-400 block mb-0.5">RRSP</label>
                    <input type="number" step="0.01" min="0" className={`w-full ${inputClsLg} text-xs py-1`} value={purchaseForm.alloc_rrsp} onChange={(e) => setPurchaseForm({ ...purchaseForm, alloc_rrsp: e.target.value })} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs text-green-400 block mb-0.5">TFSA</label>
                    <input type="number" step="0.01" min="0" className={`w-full ${inputClsLg} text-xs py-1`} value={purchaseForm.alloc_tfsa} onChange={(e) => setPurchaseForm({ ...purchaseForm, alloc_tfsa: e.target.value })} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs text-yellow-400 block mb-0.5">Other</label>
                    <input type="number" step="0.01" min="0" className={`w-full ${inputClsLg} text-xs py-1`} value={purchaseForm.alloc_other} onChange={(e) => setPurchaseForm({ ...purchaseForm, alloc_other: e.target.value })} placeholder="0.00" />
                  </div>
                </div>
                {(parseFloat(purchaseForm.alloc_other) > 0) && (
                  <input type="text" className={`w-full ${inputClsLg} text-xs py-1`} value={purchaseForm.alloc_other_label} onChange={(e) => setPurchaseForm({ ...purchaseForm, alloc_other_label: e.target.value })} placeholder='Label for "Other" (e.g. Emergency Fund)' />
                )}
                {(() => {
                  const total = (parseFloat(purchaseForm.alloc_rrsp) || 0) + (parseFloat(purchaseForm.alloc_tfsa) || 0) + (parseFloat(purchaseForm.alloc_other) || 0);
                  const proceeds = (parseFloat(purchaseForm.shares_purchased) || 0) * (parseFloat(purchaseForm.market_price) || 0);
                  if (!total) return null;
                  const unallocated = proceeds - total;
                  return (
                    <p className={`text-xs ${unallocated < -0.01 ? "text-red-400" : "text-zinc-500"}`}>
                      {fmt(total)} allocated{proceeds > 0 ? ` · ${fmt(Math.abs(unallocated))} ${unallocated < -0.01 ? "over" : "unallocated"}` : ""}
                    </p>
                  );
                })()}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={savingPurchase} className="flex-1 bg-yellow-400 text-black py-2 rounded-lg text-sm font-medium hover:bg-yellow-300 disabled:opacity-40">
                  {savingPurchase ? "Saving..." : editPurchaseId ? "Save Changes" : "Log Purchase"}
                </button>
                <button type="button" onClick={() => { setShowPurchaseForm(false); setEditPurchaseId(null); setError(""); }}
                  className="flex-1 border border-zinc-700 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

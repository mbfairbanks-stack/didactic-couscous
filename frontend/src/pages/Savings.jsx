import { useState, useEffect, useCallback } from "react";
import {
  getSavingsSummary,
  getIncome,
  getEsppPurchases, createEsppPurchase, updateEsppPurchase, deleteEsppPurchase,
  getYears,
} from "../api";
import { MONTH_LABELS, currentYear, fmt } from "../utils";
import { useSettings } from "../contexts/SettingsContext";

const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-yellow-400/50";

const RRSP_MAX = 12500;

function ProgressBar({ pct, color = "bg-yellow-400" }) {
  return (
    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

const emptyPurchase = {
  purchase_date: new Date().toISOString().slice(0, 10),
  period_start: "",
  period_end: "",
  total_deducted: "",
  shares_purchased: "",
  purchase_price: "",
  market_price: "",
  current_price: "",
  notes: "",
};

export default function Savings() {
  const { settings } = useSettings();
  const p1 = settings.person_1 || "Person 1";
  const p2 = settings.person_2 || "Person 2";

  const [year, setYear] = useState(currentYear);
  const [years, setYears] = useState([currentYear]);
  const [summary, setSummary] = useState(null);
  const [incomeRecords, setIncomeRecords] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState("");

  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchase);
  const [editPurchaseId, setEditPurchaseId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setError("");
    Promise.all([
      getSavingsSummary(year).then(setSummary).catch(() => setSummary(null)),
      getIncome({ year }).then(setIncomeRecords).catch(() => setIncomeRecords([])),
      getEsppPurchases().then(setPurchases).catch(() => setPurchases([])),
    ]);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  // Group income records by pay_date and aggregate savings columns
  const paycheckLog = Object.entries(
    incomeRecords.reduce((acc, r) => {
      const key = r.pay_date || "unspecified";
      if (!acc[key]) acc[key] = { pay_date: key, year: r.year, month: r.month, gross: 0, rrsp_employee: 0, rrsp_employer: 0, espp_deduction: 0 };
      acc[key].gross += r.amount;
      acc[key].rrsp_employee += r.rrsp_employee || 0;
      acc[key].rrsp_employer += r.rrsp_employer || 0;
      acc[key].espp_deduction += r.espp_deduction || 0;
      return acc;
    }, {})
  )
    .map(([, v]) => v)
    .filter((v) => v.rrsp_employee > 0 || v.espp_deduction > 0)
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date));

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      ...purchaseForm,
      total_deducted: parseFloat(purchaseForm.total_deducted) || 0,
      shares_purchased: parseFloat(purchaseForm.shares_purchased) || 0,
      purchase_price: parseFloat(purchaseForm.purchase_price) || 0,
      market_price: parseFloat(purchaseForm.market_price) || 0,
      current_price: parseFloat(purchaseForm.current_price) || 0,
    };
    try {
      if (editPurchaseId) {
        await updateEsppPurchase(editPurchaseId, body);
      } else {
        await createEsppPurchase(body);
      }
      setShowPurchaseForm(false);
      setEditPurchaseId(null);
      setPurchaseForm(emptyPurchase);
      load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleEditPurchase = (p) => {
    setPurchaseForm({
      purchase_date: p.purchase_date,
      period_start: p.period_start || "",
      period_end: p.period_end || "",
      total_deducted: String(p.total_deducted),
      shares_purchased: String(p.shares_purchased),
      purchase_price: String(p.purchase_price),
      market_price: String(p.market_price),
      current_price: String(p.current_price),
      notes: p.notes || "",
    });
    setEditPurchaseId(p.id);
    setShowPurchaseForm(true);
  };

  const handleDeletePurchase = async (id) => {
    if (!confirm("Delete this purchase?")) return;
    await deleteEsppPurchase(id);
    load();
  };

  const resolvePerson = (dbPerson) => {
    if (dbPerson === "Person 1") return p1;
    if (dbPerson === "Person 2") return p2;
    return dbPerson;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-zinc-100">Savings</h1>
        <div className="flex gap-3 items-center">
          <select className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <p className="text-xs text-zinc-600">
        Savings data is sourced from paycheck entries on the <a href="/income" className="text-yellow-500 hover:text-yellow-400 underline underline-offset-2">Income tab</a> — add or edit paycheques there.
      </p>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Summary cards */}
      {summary && (
        <>
          {/* RRSP Summary */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-blue-400">RRSP</h2>
              <span className="text-xs text-zinc-500">{year} contributions</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Your Contributions</p>
                <p className="text-xl font-bold text-zinc-100">{fmt(summary.rrsp_employee_ytd)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Employer Match (50%)</p>
                <p className="text-xl font-bold text-green-400">{fmt(summary.rrsp_employer_ytd)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Total RRSP Added</p>
                <p className="text-xl font-bold text-yellow-400">{fmt(summary.rrsp_total_ytd)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Remaining Cap</p>
                <p className={`text-xl font-bold ${summary.rrsp_remaining === 0 ? "text-red-400" : "text-zinc-100"}`}>
                  {fmt(summary.rrsp_remaining)}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Progress to ${RRSP_MAX.toLocaleString()} annual cap</span>
                <span className="font-medium text-zinc-300">{summary.rrsp_pct}%</span>
              </div>
              <ProgressBar pct={summary.rrsp_pct} color={summary.rrsp_pct >= 100 ? "bg-green-500" : "bg-blue-500"} />
              <div className="flex justify-between text-xs text-zinc-600">
                <span>{fmt(summary.rrsp_employee_ytd)} contributed</span>
                <span>{fmt(RRSP_MAX)} max</span>
              </div>
            </div>

            {summary.rrsp_remaining > 0 && summary.contributions > 0 && (() => {
              const avgPerContrib = summary.rrsp_employee_ytd / summary.contributions;
              const contribsNeeded = Math.ceil(summary.rrsp_remaining / avgPerContrib);
              return (
                <p className="text-xs text-zinc-600">
                  At your current pace (~{fmt(avgPerContrib)}/paycheck), you'll hit the cap in ~{contribsNeeded} more paycheck{contribsNeeded !== 1 ? "s" : ""}.
                </p>
              );
            })()}
          </div>

          {/* ESPP Summary */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-purple-400">ESPP — Block (SQ) Stock</h2>
              <button
                onClick={() => { setShowPurchaseForm(true); setEditPurchaseId(null); setPurchaseForm(emptyPurchase); }}
                className="text-xs border border-zinc-700 text-zinc-400 px-3 py-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200"
              >
                + Log Purchase
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Deducted YTD ({year})</p>
                <p className="text-xl font-bold text-zinc-100">{fmt(summary.espp_deducted_ytd)}</p>
                <p className="text-xs text-zinc-600 mt-0.5">10% of gross income</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Stock Holdings Value</p>
                <p className="text-xl font-bold text-purple-400">{fmt(summary.espp_current_value)}</p>
                <p className="text-xs text-zinc-600 mt-0.5">at current prices</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Discount Benefit</p>
                <p className="text-xl font-bold text-green-400">15%</p>
                <p className="text-xs text-zinc-600 mt-0.5">~17.6% instant gain</p>
              </div>
            </div>

            {/* ESPP purchase history */}
            {purchases.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Purchase History</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-left text-zinc-600 text-xs">
                        <th className="pb-2 pr-4">Date</th>
                        <th className="pb-2 pr-4 text-right">Deducted</th>
                        <th className="pb-2 pr-4 text-right">Shares</th>
                        <th className="pb-2 pr-4 text-right">Buy Price</th>
                        <th className="pb-2 pr-4 text-right">Market</th>
                        <th className="pb-2 pr-4 text-right">Current</th>
                        <th className="pb-2 pr-4 text-right text-green-400">Gain</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((p) => {
                        const costBasis = p.shares_purchased * p.purchase_price;
                        const currentVal = p.shares_purchased * (p.current_price || p.market_price);
                        const gain = currentVal - costBasis;
                        const gainPct = costBasis > 0 ? (gain / costBasis * 100).toFixed(1) : 0;
                        return (
                          <tr key={p.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                            <td className="py-2 pr-4 text-zinc-400">{p.purchase_date}</td>
                            <td className="py-2 pr-4 text-right text-zinc-300">{fmt(p.total_deducted)}</td>
                            <td className="py-2 pr-4 text-right text-zinc-300">{p.shares_purchased}</td>
                            <td className="py-2 pr-4 text-right text-zinc-300">${p.purchase_price?.toFixed(2)}</td>
                            <td className="py-2 pr-4 text-right text-zinc-300">${p.market_price?.toFixed(2)}</td>
                            <td className="py-2 pr-4 text-right text-zinc-100">${(p.current_price || p.market_price)?.toFixed(2)}</td>
                            <td className={`py-2 pr-4 text-right font-medium ${gain >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {gain >= 0 ? "+" : ""}{fmt(gain)}
                              <span className="text-xs ml-1 opacity-70">({gainPct}%)</span>
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

            {purchases.length === 0 && (
              <p className="text-zinc-600 text-sm text-center py-4">
                No purchases logged yet — click "Log Purchase" when your ESPP period closes.
              </p>
            )}
          </div>
        </>
      )}

      {/* Paycheck savings log (from income records) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">Paycheck Savings Log — {year}</span>
          <span className="text-xs text-zinc-500">{paycheckLog.length} paychecks with savings</span>
        </div>
        {paycheckLog.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-zinc-500 font-medium">No savings data for {year}</p>
            <p className="text-zinc-600 text-sm mt-1">
              Add RRSP or ESPP amounts when logging paycheques on the{" "}
              <a href="/income" className="text-yellow-500 hover:text-yellow-400 underline underline-offset-2">Income tab</a>.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-left text-zinc-500 text-xs bg-zinc-800/50">
                  <th className="px-4 py-2">Pay Date</th>
                  <th className="px-4 py-2 text-right">Gross</th>
                  <th className="px-4 py-2 text-right text-blue-400">RRSP (You)</th>
                  <th className="px-4 py-2 text-right text-green-400">RRSP Match</th>
                  <th className="px-4 py-2 text-right text-purple-400">ESPP (10%)</th>
                  <th className="px-4 py-2 text-right text-yellow-400">Total Saved</th>
                </tr>
              </thead>
              <tbody>
                {paycheckLog.map((c) => {
                  const total = c.rrsp_employee + c.rrsp_employer + c.espp_deduction;
                  const savingsRate = c.gross > 0 ? ((c.rrsp_employee + c.espp_deduction) / c.gross * 100).toFixed(0) : 0;
                  return (
                    <tr key={c.pay_date} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40">
                      <td className="px-4 py-2.5 text-zinc-400">{c.pay_date}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-300">{fmt(c.gross)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-200">{fmt(c.rrsp_employee)}</td>
                      <td className="px-4 py-2.5 text-right text-green-400">{fmt(c.rrsp_employer)}</td>
                      <td className="px-4 py-2.5 text-right text-purple-400">{fmt(c.espp_deduction)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-yellow-400">
                        {fmt(total)}
                        <span className="text-zinc-600 text-xs ml-1">({savingsRate}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {paycheckLog.length > 1 && (() => {
                const totals = paycheckLog.reduce((s, c) => ({
                  gross: s.gross + c.gross,
                  rrsp_emp: s.rrsp_emp + c.rrsp_employee,
                  rrsp_er: s.rrsp_er + c.rrsp_employer,
                  espp: s.espp + c.espp_deduction,
                }), { gross: 0, rrsp_emp: 0, rrsp_er: 0, espp: 0 });
                return (
                  <tfoot>
                    <tr className="border-t border-zinc-700 bg-zinc-800/50 font-semibold text-xs">
                      <td className="px-4 py-2 text-zinc-500 uppercase tracking-wide">YTD Total</td>
                      <td className="px-4 py-2 text-right text-zinc-300">{fmt(totals.gross)}</td>
                      <td className="px-4 py-2 text-right text-zinc-200">{fmt(totals.rrsp_emp)}</td>
                      <td className="px-4 py-2 text-right text-green-400">{fmt(totals.rrsp_er)}</td>
                      <td className="px-4 py-2 text-right text-purple-400">{fmt(totals.espp)}</td>
                      <td className="px-4 py-2 text-right text-yellow-400">{fmt(totals.rrsp_emp + totals.rrsp_er + totals.espp)}</td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit ESPP purchase modal */}
      {showPurchaseForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-1 text-zinc-100">{editPurchaseId ? "Edit" : "Log"} ESPP Purchase</h2>
            <p className="text-xs text-zinc-500 mb-4">Record when your ESPP period closes and stock is purchased at the 15% discount.</p>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <form onSubmit={handlePurchaseSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500">Purchase Date</label>
                  <input type="date" required className={`w-full mt-0.5 ${inputCls}`}
                    value={purchaseForm.purchase_date}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Total $ Deducted in Period</label>
                  <input type="number" step="0.01" min="0" className={`w-full mt-0.5 ${inputCls}`}
                    value={purchaseForm.total_deducted}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, total_deducted: e.target.value })}
                    placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500">Period Start</label>
                  <input type="date" className={`w-full mt-0.5 ${inputCls}`}
                    value={purchaseForm.period_start}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, period_start: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Period End</label>
                  <input type="date" className={`w-full mt-0.5 ${inputCls}`}
                    value={purchaseForm.period_end}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, period_end: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-zinc-500">Shares Purchased</label>
                  <input type="number" step="0.0001" min="0" className={`w-full mt-0.5 ${inputCls}`}
                    value={purchaseForm.shares_purchased}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, shares_purchased: e.target.value })}
                    placeholder="0" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Buy Price / Share</label>
                  <input type="number" step="0.01" min="0" className={`w-full mt-0.5 ${inputCls}`}
                    value={purchaseForm.purchase_price}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_price: e.target.value })}
                    placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Market Price / Share</label>
                  <input type="number" step="0.01" min="0" className={`w-full mt-0.5 ${inputCls}`}
                    value={purchaseForm.market_price}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, market_price: e.target.value })}
                    placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500">Current Stock Price (for Net Worth valuation)</label>
                <input type="number" step="0.01" min="0" className={`w-full mt-0.5 ${inputCls}`}
                  value={purchaseForm.current_price}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, current_price: e.target.value })}
                  placeholder="0.00" />
              </div>
              {purchaseForm.shares_purchased && purchaseForm.market_price && purchaseForm.purchase_price && (
                <div className="bg-zinc-800/60 rounded p-3 text-xs">
                  <p className="text-zinc-400">
                    Instant gain at purchase:{" "}
                    <span className="text-green-400 font-semibold">
                      {fmt((parseFloat(purchaseForm.market_price) - parseFloat(purchaseForm.purchase_price)) * parseFloat(purchaseForm.shares_purchased))}
                    </span>
                    {" "}({(((parseFloat(purchaseForm.market_price) - parseFloat(purchaseForm.purchase_price)) / parseFloat(purchaseForm.purchase_price)) * 100).toFixed(1)}%)
                  </p>
                </div>
              )}
              <div>
                <label className="text-xs text-zinc-500">Notes (optional)</label>
                <input type="text" className={`w-full mt-0.5 ${inputCls}`}
                  value={purchaseForm.notes}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-yellow-400 text-black py-2 rounded-lg text-sm font-medium hover:bg-yellow-300 disabled:opacity-40">
                  {saving ? "Saving..." : editPurchaseId ? "Save Changes" : "Log Purchase"}
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

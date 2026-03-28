import { useState, useEffect, useCallback } from "react";
import { getMerchantCategories, setMerchantCategory, getSuggestedRenames, migrateCategories } from "../api";
import { getCategoryGroup, ALL_CATEGORIES } from "../constants";

export default function CategoryAudit() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [reassigning, setReassigning] = useState(null);
  const [pendingCategory, setPendingCategory] = useState({});  // merchant → chosen category
  const [renames, setRenames] = useState([]);
  const [migrating, setMigrating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      getMerchantCategories().then(setRows),
      getSuggestedRenames().then(setRenames).catch(() => {}),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReassign = async (merchant) => {
    const toCategory = pendingCategory[merchant];
    if (!toCategory) return;
    setReassigning(merchant);
    setSuccessMsg("");
    setError("");
    try {
      const result = await setMerchantCategory({ merchant, category: toCategory });
      setSuccessMsg(
        `Reassigned ${result.updated} transaction${result.updated !== 1 ? "s" : ""} for "${merchant}" → "${toCategory}"`
      );
      setPendingCategory((prev) => { const next = { ...prev }; delete next[merchant]; return next; });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setReassigning(null);
    }
  };

  // Group badge color by category group
  function groupAccent(category) {
    const g = getCategoryGroup(category);
    if (g === "Needs") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    if (g === "Wants") return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    return "bg-zinc-700 text-zinc-400 border-zinc-600";
  }

  const handleMigrate = async () => {
    if (!confirm(`Apply ${renames.length} category renames to all existing transactions? This cannot be undone.`)) return;
    setMigrating(true);
    setError("");
    try {
      const res = await migrateCategories();
      setSuccessMsg(`Updated ${res.updated} transaction${res.updated !== 1 ? "s" : ""} with improved category names.`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Category Audit</h1>
        <p className="text-sm text-zinc-500 mt-1">Merchants assigned to multiple categories</p>
      </div>

      {/* Suggested renames panel */}
      {renames.length > 0 && (
        <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold text-yellow-400">Suggested Category Improvements</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                These renames will consolidate redundant categories and fix naming inconsistencies across all your transactions.
              </p>
            </div>
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="bg-yellow-400 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-300 disabled:opacity-40"
            >
              {migrating ? "Applying..." : `Apply All ${renames.length} Renames`}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {renames.map((r) => (
              <div key={r.from_category} className="bg-zinc-800 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
                <span className="text-zinc-400 truncate">{r.from_category}</span>
                <span className="text-zinc-600">→</span>
                <span className="text-yellow-400 font-medium truncate">{r.to_category}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback messages */}
      {successMsg && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 text-green-400 text-sm">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-center text-zinc-600 py-16">Loading...</p>
      )}

      {/* All-clear state */}
      {!loading && !error && rows.length === 0 && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-6 py-8 text-center">
          <p className="text-green-400 font-medium">All categories are consistent</p>
          <p className="text-zinc-500 text-sm mt-1">No merchants have been assigned to more than one category.</p>
        </div>
      )}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-700 bg-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">
              {rows.length} merchant{rows.length !== 1 ? "s" : ""} with inconsistent categories
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-left text-zinc-500 bg-zinc-800/50">
                  <th className="px-4 py-2.5 font-medium">Merchant</th>
                  <th className="px-4 py-2.5 font-medium">Assigned Categories</th>
                  <th className="px-4 py-2.5 font-medium text-right">Transactions</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  return (
                    <tr
                      key={row.merchant}
                      className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 align-top"
                    >
                      {/* Merchant */}
                      <td className="px-4 py-3 font-medium text-zinc-200 whitespace-nowrap">
                        {row.merchant}
                      </td>

                      {/* Category badges */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {row.categories.map((cat) =>
                            cat === row.most_common ? (
                              <span
                                key={cat}
                                className="inline-flex items-center gap-1 bg-yellow-400/15 text-yellow-400 border border-yellow-400/30 text-xs font-semibold px-2 py-0.5 rounded"
                                title="Most common"
                              >
                                {cat}
                                <span className="text-yellow-500/70">★</span>
                              </span>
                            ) : (
                              <span
                                key={cat}
                                className={`inline-block border text-xs px-2 py-0.5 rounded ${groupAccent(cat)}`}
                              >
                                {cat}
                              </span>
                            )
                          )}
                        </div>
                      </td>

                      {/* Count */}
                      <td className="px-4 py-3 text-right text-zinc-400 whitespace-nowrap">
                        {row.count}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-yellow-400/50"
                            value={pendingCategory[row.merchant] ?? ""}
                            onChange={(e) => setPendingCategory((prev) => ({ ...prev, [row.merchant]: e.target.value }))}
                          >
                            <option value="">Set all to...</option>
                            {ALL_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <button
                            disabled={!pendingCategory[row.merchant] || reassigning === row.merchant}
                            onClick={() => handleReassign(row.merchant)}
                            className="text-xs bg-yellow-400 text-black px-3 py-1.5 rounded font-medium hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {reassigning === row.merchant ? "Saving..." : "Apply"}
                          </button>
                        </div>
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
  );
}

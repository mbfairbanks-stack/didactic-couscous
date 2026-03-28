import { useState, useEffect, useCallback } from "react";
import { getMerchantCategories, bulkUpdateCategory } from "../api";
import { getCategoryGroup } from "../constants";

export default function CategoryAudit() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [reassigning, setReassigning] = useState(null); // "merchant||from_cat"

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getMerchantCategories()
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReassign = async (merchant, fromCategory, toCategory) => {
    const key = `${merchant}||${fromCategory}`;
    setReassigning(key);
    setSuccessMsg("");
    setError("");
    try {
      const result = await bulkUpdateCategory({ merchant, from_category: fromCategory, to_category: toCategory });
      setSuccessMsg(
        `Reassigned ${result.updated} transaction${result.updated !== 1 ? "s" : ""}: "${fromCategory}" → "${toCategory}" for ${merchant}`
      );
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Category Audit</h1>
        <p className="text-sm text-zinc-500 mt-1">Merchants assigned to multiple categories</p>
      </div>

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
                  const others = row.categories.filter((c) => c !== row.most_common);
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
                        <div className="flex flex-col gap-1.5">
                          {others.map((otherCat) => {
                            const key = `${row.merchant}||${otherCat}`;
                            const busy = reassigning === key;
                            return (
                              <button
                                key={otherCat}
                                disabled={busy || reassigning != null}
                                onClick={() => handleReassign(row.merchant, otherCat, row.most_common)}
                                className="text-xs bg-zinc-800 border border-zinc-700 hover:border-yellow-400/50 hover:text-yellow-400 text-zinc-300 px-3 py-1.5 rounded transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed text-left"
                              >
                                {busy
                                  ? "Reassigning..."
                                  : `Reassign "${otherCat}" → "${row.most_common}"`}
                              </button>
                            );
                          })}
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

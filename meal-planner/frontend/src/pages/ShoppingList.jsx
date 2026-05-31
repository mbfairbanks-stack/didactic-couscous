import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getShoppingList, createPantryItem } from "../api";
import { format, addWeeks, subWeeks } from "date-fns";

function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function toYMD(d) {
  return format(d, "yyyy-MM-dd");
}

function fmtNum(n) {
  if (n === 0) return "";
  const s = n % 1 === 0 ? String(n) : parseFloat(n.toFixed(2)).toString();
  return s;
}

function combineItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.name.toLowerCase().trim();
    if (!map.has(key)) {
      map.set(key, { name: item.name, entries: [] });
    }
    map.get(key).entries.push({
      amount: item.amount,
      unit: (item.unit || "").trim(),
    });
  }

  return Array.from(map.values()).map(({ name, entries }) => {
    const units = [...new Set(entries.map((e) => e.unit.toLowerCase()))];
    const totalNum = entries.reduce((sum, e) => {
      const n = parseFloat(e.amount);
      return sum + (isNaN(n) ? 1 : n);
    }, 0);

    if (units.length === 1) {
      return { name, amount: fmtNum(totalNum), unit: entries[0].unit };
    }
    // Mixed units: sum numbers, drop conflicting unit labels
    return { name, amount: fmtNum(totalNum), unit: "" };
  });
}

export default function ShoppingList() {
  const [searchParams] = useSearchParams();
  const [weekStart, setWeekStart] = useState(() => {
    const w = searchParams.get("week");
    return w ? getMonday(new Date(w + "T00:00:00")) : getMonday(new Date());
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checked, setChecked] = useState({});
  const [combined, setCombined] = useState(true);
  const [extraItems, setExtraItems] = useState([]);
  const [extraInput, setExtraInput] = useState("");

  const weekKey = toYMD(weekStart);

  const load = () => {
    setLoading(true);
    setChecked({});
    getShoppingList(weekKey)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [weekKey]);

  useEffect(() => {
    try { setExtraItems(JSON.parse(localStorage.getItem("sc_extra_" + weekKey) || "[]")); } catch { setExtraItems([]); }
  }, [weekKey]);

  const saveExtra = (items) => {
    setExtraItems(items);
    localStorage.setItem("sc_extra_" + weekKey, JSON.stringify(items));
  };

  const addExtraItem = () => {
    const val = extraInput.trim();
    if (!val) return;
    saveExtra([...extraItems, { name: val, amount: "", unit: "" }]);
    setExtraInput("");
  };

  const removeExtraItem = (name) => saveExtra(extraItems.filter((i) => i.name !== name));

  const prevWeek = () => setWeekStart(subWeeks(weekStart, 1));
  const nextWeek = () => setWeekStart(addWeeks(weekStart, 1));
  const thisWeek = () => setWeekStart(getMonday(new Date()));

  const toggleCheck = (name) => setChecked((prev) => ({ ...prev, [name]: !prev[name] }));

  const handleHaveIt = async (item) => {
    const qty = parseFloat(item.amount) || 1;
    await createPantryItem({
      name: item.name,
      quantity: qty,
      unit: item.unit || "",
      category: "Pantry",
      expiry_date: null,
      notes: null,
    });
    load();
  };

  const rawToBuy = data?.to_buy || [];
  const alreadyHave = data?.already_have || [];
  const toBuy = combined ? combineItems(rawToBuy) : rawToBuy;

  const buildShareText = () => {
    const lines = [`Shopping List – Week of ${format(weekStart, "MMM d, yyyy")}`];
    const allToBuy = [...toBuy, ...extraItems];
    if (allToBuy.length > 0) {
      lines.push("");
      allToBuy.forEach((item) => {
        const qty = [item.amount, item.unit].filter(Boolean).join(" ");
        lines.push(`□ ${item.name}${qty ? "  " + qty : ""}`);
      });
    }
    return lines.join("\n");
  };

  const [copyLabel, setCopyLabel] = useState("Share");
  const handleShare = async () => {
    const text = buildShareText();
    if (navigator.share) {
      try { await navigator.share({ title: "Shopping List", text }); return; } catch {}
    }
    // Clipboard API requires HTTPS; fall back to execCommand which works on HTTP
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopyLabel("Copied!");
    setTimeout(() => setCopyLabel("Share"), 2000);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-stone-100">Shopping List</h1>
        <div className="flex items-center gap-1">
          <button onClick={prevWeek} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-stone-800 text-gray-500 dark:text-stone-400">‹</button>
          <span className="text-sm font-medium text-gray-600 dark:text-stone-300 min-w-max">
            Week of {format(weekStart, "MMM d, yyyy")}
          </span>
          <button onClick={nextWeek} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-stone-800 text-gray-500 dark:text-stone-400">›</button>
        </div>
        <button onClick={thisWeek} className="text-xs text-green-600 hover:underline">This week</button>
        <button
          onClick={handleShare}
          className="ml-auto text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-stone-700 text-gray-600 dark:text-stone-300 hover:bg-gray-50 dark:hover:bg-stone-800 transition-colors"
        >
          {copyLabel}
        </button>
      </div>

      <p className="text-sm text-gray-500 dark:text-stone-400 mb-5">
        Generated from recipes linked in your meal plan, checked against pantry inventory.
      </p>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-400 dark:text-stone-500 text-sm">Loading...</p>
      ) : (
        <div className="space-y-6">
          {data && rawToBuy.length === 0 && alreadyHave.length === 0 && (
            <div className="text-center py-10 text-gray-400 dark:text-stone-500">
              <p className="text-lg">Nothing from recipes.</p>
              <p className="text-sm mt-1">Link recipes to your meal plan to generate a shopping list.</p>
            </div>
          )}

          {data && rawToBuy.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-stone-400 uppercase tracking-wider">
                  To Buy ({toBuy.length}{combined && rawToBuy.length !== toBuy.length ? ` combined from ${rawToBuy.length}` : ""})
                </h3>
                <button
                  onClick={() => { setCombined((c) => !c); setChecked({}); }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    combined
                      ? "bg-green-50 border-green-300 text-green-700"
                      : "bg-white dark:bg-stone-800 border-gray-200 dark:border-stone-700 text-gray-500 dark:text-stone-400 hover:border-gray-300 dark:hover:border-stone-600"
                  }`}
                >
                  {combined ? "Combined" : "Combine"}
                </button>
              </div>
              <div className="bg-white dark:bg-stone-900 rounded-xl border border-gray-200 dark:border-stone-700 divide-y divide-gray-100 dark:divide-stone-800 shadow-sm">
                {toBuy.map((item) => (
                  <div key={item.name} className="group flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={!!checked[item.name]}
                      onChange={() => toggleCheck(item.name)}
                      className="w-4 h-4 rounded accent-green-600 cursor-pointer shrink-0"
                    />
                    <span className={`flex-1 text-sm ${checked[item.name] ? "line-through text-gray-400 dark:text-stone-500" : "text-gray-700 dark:text-stone-200"}`}>
                      {item.name}
                    </span>
                    {(item.amount || item.unit) && (
                      <span className="text-xs text-gray-400 dark:text-stone-500">
                        {[item.amount, item.unit].filter(Boolean).join(" ")}
                      </span>
                    )}
                    <button
                      onClick={() => handleHaveIt(item)}
                      title="I already have this — add to pantry"
                      className="opacity-0 group-hover:opacity-100 text-xs text-green-600 dark:text-green-400 border border-green-300 dark:border-green-700 rounded-full px-2 py-0.5 hover:bg-green-50 dark:hover:bg-green-900/30 transition-all shrink-0"
                    >
                      ✓ Have it
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extra manually-added items */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-stone-400 uppercase tracking-wider mb-2">
              Add Items
            </h3>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={extraInput}
                onChange={(e) => setExtraInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addExtraItem()}
                placeholder="e.g. paper towels"
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-gray-800 dark:text-stone-100 placeholder:text-gray-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={addExtraItem}
                className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Add
              </button>
            </div>
            {extraItems.length > 0 && (
              <div className="bg-white dark:bg-stone-900 rounded-xl border border-gray-200 dark:border-stone-700 divide-y divide-gray-100 dark:divide-stone-800 shadow-sm">
                {extraItems.map((item) => (
                  <div key={item.name} className="group flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={!!checked[item.name]}
                      onChange={() => toggleCheck(item.name)}
                      className="w-4 h-4 rounded accent-green-600 cursor-pointer shrink-0"
                    />
                    <span className={`flex-1 text-sm ${checked[item.name] ? "line-through text-gray-400 dark:text-stone-500" : "text-gray-700 dark:text-stone-200"}`}>
                      {item.name}
                    </span>
                    <button
                      onClick={() => removeExtraItem(item.name)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 transition-all shrink-0"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {alreadyHave.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-stone-400 uppercase tracking-wider mb-2">
                Already in Pantry ({alreadyHave.length})
              </h3>
              <div className="bg-gray-50 dark:bg-stone-900 rounded-xl border border-gray-200 dark:border-stone-700 divide-y divide-gray-100 dark:divide-stone-800">
                {alreadyHave.map((item) => (
                  <div key={item.name} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-green-500 text-sm">✓</span>
                    <span className="flex-1 text-sm text-gray-400 dark:text-stone-500 line-through">{item.name}</span>
                    {(item.amount || item.unit) && (
                      <span className="text-xs text-gray-300 dark:text-stone-600">
                        {[item.amount, item.unit].filter(Boolean).join(" ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

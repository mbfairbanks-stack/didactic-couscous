import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getShoppingList } from "../api";
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

  const prevWeek = () => setWeekStart(subWeeks(weekStart, 1));
  const nextWeek = () => setWeekStart(addWeeks(weekStart, 1));
  const thisWeek = () => setWeekStart(getMonday(new Date()));

  const toggleCheck = (name) => setChecked((prev) => ({ ...prev, [name]: !prev[name] }));

  const toBuy = data?.to_buy || [];
  const alreadyHave = data?.already_have || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-800">Shopping List</h1>
        <div className="flex items-center gap-1">
          <button onClick={prevWeek} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">‹</button>
          <span className="text-sm font-medium text-gray-600 min-w-max">
            Week of {format(weekStart, "MMM d, yyyy")}
          </span>
          <button onClick={nextWeek} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">›</button>
        </div>
        <button onClick={thisWeek} className="text-xs text-green-600 hover:underline">This week</button>
      </div>

      <p className="text-sm text-gray-500 mb-5">
        Generated from recipes linked in your meal plan, checked against pantry inventory.
      </p>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : !data ? null : toBuy.length === 0 && alreadyHave.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Nothing to buy.</p>
          <p className="text-sm mt-1">Link recipes to your meal plan to generate a shopping list.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {toBuy.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                To Buy ({toBuy.length})
              </h3>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm">
                {toBuy.map((item) => (
                  <div key={item.name} className="flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={!!checked[item.name]}
                      onChange={() => toggleCheck(item.name)}
                      className="w-4 h-4 rounded accent-green-600 cursor-pointer"
                    />
                    <span className={`flex-1 text-sm ${checked[item.name] ? "line-through text-gray-400" : "text-gray-700"}`}>
                      {item.name}
                    </span>
                    {(item.amount || item.unit) && (
                      <span className="text-xs text-gray-400">
                        {item.amount} {item.unit}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {alreadyHave.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Already in Pantry ({alreadyHave.length})
              </h3>
              <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-100">
                {alreadyHave.map((item) => (
                  <div key={item.name} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-green-500 text-sm">✓</span>
                    <span className="flex-1 text-sm text-gray-400 line-through">{item.name}</span>
                    {(item.amount || item.unit) && (
                      <span className="text-xs text-gray-300">
                        {item.amount} {item.unit}
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

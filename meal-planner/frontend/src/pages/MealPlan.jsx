import { useState, useEffect, useRef } from "react";
import { getMealPlan, setMealPlanEntry, deleteMealPlanEntry, getRecipes, streamGenerateMealPlan } from "../api";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];

function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function toYMD(d) {
  return format(d, "yyyy-MM-dd");
}

function CellMenu({ recipes, onSelect, onClear, onClose }) {
  const ref = useRef();
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered = recipes.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div
      ref={ref}
      className="absolute z-20 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
    >
      <div className="p-2 border-b">
        <input
          autoFocus
          type="text"
          placeholder="Search recipes or type a meal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && search.trim()) {
              // If no matching recipe, save as free text
              const match = recipes.find((r) => r.title.toLowerCase() === search.toLowerCase());
              if (match) onSelect(match.id, null);
              else onSelect(null, search.trim());
            }
          }}
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 && search.trim() && (
          <button
            className="w-full text-left px-3 py-2 text-sm text-green-700 hover:bg-green-50"
            onClick={() => onSelect(null, search.trim())}
          >
            Add "{search.trim()}"
          </button>
        )}
        {filtered.map((r) => (
          <button
            key={r.id}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
            onClick={() => onSelect(r.id, null)}
          >
            {r.title}
          </button>
        ))}
      </div>
      <div className="border-t p-2">
        <button
          onClick={onClear}
          className="w-full text-left text-xs text-red-400 hover:text-red-600 px-1"
        >
          Clear this slot
        </button>
      </div>
    </div>
  );
}

export default function MealPlan() {
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [entries, setEntries] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCell, setActiveCell] = useState(null); // {day, meal_type}
  const [error, setError] = useState(null);

  // AI generation
  const [showAI, setShowAI] = useState(false);
  const [aiPrefs, setAiPrefs] = useState("");
  const [usePantry, setUsePantry] = useState(false);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiError, setAiError] = useState(null);
  const rawRef = useRef("");

  const weekKey = toYMD(weekStart);

  const load = () => {
    setLoading(true);
    Promise.all([getMealPlan(weekKey), getRecipes()])
      .then(([plan, recs]) => { setEntries(plan); setRecipes(recs); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [weekKey]);

  const getEntry = (day, mealType) =>
    entries.find((e) => e.day === day && e.meal_type === mealType);

  const handleSelect = async (day, mealType, recipeId, freeText) => {
    setActiveCell(null);
    try {
      await setMealPlanEntry({
        week_start: weekKey,
        day,
        meal_type: mealType,
        recipe_id: recipeId,
        free_text: freeText,
      });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleClear = async (day, mealType) => {
    setActiveCell(null);
    const entry = getEntry(day, mealType);
    if (entry) {
      await deleteMealPlanEntry(entry.id);
      load();
    }
  };

  const handleGenerateAI = () => {
    setAiStreaming(true);
    setAiError(null);
    rawRef.current = "";

    streamGenerateMealPlan(
      { week_start: weekKey, preferences: aiPrefs || null, use_pantry: usePantry },
      (chunk) => { rawRef.current += chunk; },
      async () => {
        setAiStreaming(false);
        try {
          const parsed = JSON.parse(rawRef.current);
          // Apply the AI plan to the meal plan
          for (const day of DAYS) {
            const dayPlan = parsed[day];
            if (!dayPlan) continue;
            for (const mealType of MEAL_TYPES) {
              const text = dayPlan[mealType];
              if (text) {
                await setMealPlanEntry({
                  week_start: weekKey,
                  day,
                  meal_type: mealType,
                  recipe_id: null,
                  free_text: text,
                });
              }
            }
          }
          setShowAI(false);
          load();
        } catch {
          setAiError("Could not parse AI response. Try again.");
        }
      },
      (err) => {
        setAiStreaming(false);
        setAiError(err);
      }
    );
  };

  const prevWeek = () => setWeekStart(subWeeks(weekStart, 1));
  const nextWeek = () => setWeekStart(addWeeks(weekStart, 1));
  const thisWeek = () => setWeekStart(getMonday(new Date()));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">Meal Plan</h1>
          <div className="flex items-center gap-1">
            <button onClick={prevWeek} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">‹</button>
            <span className="text-sm font-medium text-gray-600 min-w-max">
              Week of {format(weekStart, "MMM d, yyyy")}
            </span>
            <button onClick={nextWeek} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">›</button>
          </div>
          <button onClick={thisWeek} className="text-xs text-green-600 hover:underline">This week</button>
        </div>
        <button
          onClick={() => setShowAI(!showAI)}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700"
        >
          AI Generate Week
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* AI Panel */}
      {showAI && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5 shadow-sm">
          <h2 className="font-semibold text-purple-800 mb-3">Generate Meal Plan with AI</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder='Preferences (e.g. "vegetarian, quick lunches, no seafood")'
              value={aiPrefs}
              onChange={(e) => setAiPrefs(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm flex-1"
            />
            <button
              onClick={handleGenerateAI}
              disabled={aiStreaming}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {aiStreaming ? "Generating..." : "Generate"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-purple-700 cursor-pointer">
            <input type="checkbox" checked={usePantry} onChange={(e) => setUsePantry(e.target.checked)} className="rounded" />
            Suggest meals based on pantry inventory
          </label>
          {aiError && <p className="text-red-500 text-sm mt-2">{aiError}</p>}
          <p className="text-xs text-purple-500 mt-2">This will fill the current week. Existing entries will be overwritten.</p>
        </div>
      )}

      {/* Meal Grid */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[700px]">
            <thead>
              <tr>
                <th className="w-28 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2 pr-2"></th>
                {DAYS.map((day) => (
                  <th key={day} className="text-center text-xs font-semibold text-gray-600 pb-2 px-1">
                    <div>{day.slice(0, 3)}</div>
                    <div className="text-gray-400 font-normal">
                      {format(addDays(weekStart, DAYS.indexOf(day)), "M/d")}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_TYPES.map((mealType) => (
                <tr key={mealType}>
                  <td className="text-xs font-semibold text-gray-500 uppercase tracking-wider pr-2 py-1 align-top pt-2">
                    {mealType}
                  </td>
                  {DAYS.map((day) => {
                    const entry = getEntry(day, mealType);
                    const isActive = activeCell?.day === day && activeCell?.meal_type === mealType;
                    return (
                      <td key={day} className="px-1 py-1 align-top">
                        <div className="relative">
                          <button
                            onClick={() => setActiveCell(isActive ? null : { day, meal_type: mealType })}
                            className={`w-full min-h-[52px] text-left rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                              entry
                                ? "bg-green-50 border-green-200 text-green-800 hover:bg-green-100"
                                : "bg-white border-gray-200 text-gray-400 hover:border-green-300 hover:bg-green-50"
                            } ${isActive ? "ring-2 ring-green-400" : ""}`}
                          >
                            {entry ? entry.label : <span className="text-gray-300">+</span>}
                          </button>
                          {isActive && (
                            <CellMenu
                              recipes={recipes}
                              onSelect={(recipeId, freeText) => handleSelect(day, mealType, recipeId, freeText)}
                              onClear={() => handleClear(day, mealType)}
                              onClose={() => setActiveCell(null)}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

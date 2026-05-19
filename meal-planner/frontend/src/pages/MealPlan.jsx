import { useState, useEffect, useRef } from "react";
import { getMealPlan, setMealPlanEntry, deleteMealPlanEntry, getRecipes, getPreferences, streamGenerateMealPlan, streamRefreshMealSlot, generateWeekRecipes, markMealCooked, unmarkMealCooked } from "../api";
import { format, addDays, addWeeks, subWeeks } from "date-fns";
import { Link, useNavigate } from "react-router-dom";

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];
const SKIP = "__skip__";

const RECIPE_THEMES = [
  { kw: ["pasta","spaghetti","linguine","penne","fettuccine","rigatoni","noodle"], emoji:"🍝" },
  { kw: ["salad","slaw"], emoji:"🥗" },
  { kw: ["soup","stew","chowder","broth","bisque"], emoji:"🍲" },
  { kw: ["curry","masala","korma","tikka","dahl","dal","lentil"], emoji:"🍛" },
  { kw: ["chicken","poultry","wing","thigh","drumstick"], emoji:"🍗" },
  { kw: ["beef","steak","burger","mince","brisket","meatball","bolognese"], emoji:"🥩" },
  { kw: ["pork","bacon","ham","sausage","chorizo"], emoji:"🥓" },
  { kw: ["fish","salmon","tuna","cod","trout","seafood","shrimp","prawn"], emoji:"🐟" },
  { kw: ["pizza"], emoji:"🍕" },
  { kw: ["taco","burrito","quesadilla","enchilada"], emoji:"🌮" },
  { kw: ["cake","cookie","brownie","dessert","chocolate","pudding"], emoji:"🍰" },
  { kw: ["bread","toast","sandwich","wrap"], emoji:"🥪" },
  { kw: ["egg","omelette","frittata","quiche","scrambled"], emoji:"🍳" },
  { kw: ["rice","risotto","pilaf","paella","biryani"], emoji:"🍚" },
  { kw: ["pancake","waffle","crepe"], emoji:"🥞" },
  { kw: ["avocado","guacamole"], emoji:"🥑" },
];

function mealEmoji(title) {
  const lower = (title || "").toLowerCase();
  for (const t of RECIPE_THEMES) {
    if (t.kw.some((k) => lower.includes(k))) return t.emoji;
  }
  return "🍽️";
}

const ALL_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function getWeekStart(d, startDay = "Monday") {
  const dt = new Date(d);
  const jsDay = dt.getDay(); // 0=Sun … 6=Sat
  const startIdx = ALL_DAYS.indexOf(startDay); // 0=Mon … 6=Sun in our array
  // Convert our array index to JS day index (Mon=1 … Sat=6, Sun=0)
  const startJs = startIdx === 6 ? 0 : startIdx + 1;
  let diff = jsDay - startJs;
  if (diff < 0) diff += 7;
  dt.setDate(dt.getDate() - diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function toYMD(d) { return format(d, "yyyy-MM-dd"); }

function getDaysFrom(startDay) {
  const idx = ALL_DAYS.indexOf(startDay);
  if (idx <= 0) return ALL_DAYS;
  return [...ALL_DAYS.slice(idx), ...ALL_DAYS.slice(0, idx)];
}

function getTodayDayName() {
  const js = new Date().getDay();
  return ALL_DAYS[js === 0 ? 6 : js - 1];
}

function matchRecipe(text, recipes) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  return recipes.find((r) => r.title.toLowerCase().trim() === lower) || null;
}

// Shared recipe picker content used by both desktop dropdown and mobile sheet
function RecipePickerContent({ recipes, onSelect, onClear, onSkip }) {
  const [search, setSearch] = useState("");
  const favorites = recipes.filter((r) => r.is_favorite);
  const filtered = recipes.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="p-3 border-b">
        <input
          autoFocus
          type="text"
          placeholder="Search recipes or type a meal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && search.trim()) {
              const match = recipes.find((r) => r.title.toLowerCase() === search.toLowerCase());
              if (match) onSelect(match.id, null);
              else onSelect(null, search.trim());
            }
          }}
        />
      </div>
      <div className="overflow-y-auto max-h-64">
        {!search && favorites.length > 0 && (
          <>
            <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Favourites</p>
            {favorites.map((r) => (
              <button key={r.id} onClick={() => onSelect(r.id, null)}
                className="w-full text-left px-4 py-3 text-sm hover:bg-yellow-50 text-gray-700 flex items-center gap-2">
                <span className="text-yellow-400">★</span> {r.title}
              </button>
            ))}
            <div className="border-t my-1" />
          </>
        )}
        {filtered.length === 0 && search.trim() && (
          <button onClick={() => onSelect(null, search.trim())}
            className="w-full text-left px-4 py-3 text-sm text-green-700 hover:bg-green-50">
            Add "{search.trim()}"
          </button>
        )}
        {(search ? filtered : recipes.filter((r) => !r.is_favorite)).map((r) => (
          <button key={r.id} onClick={() => onSelect(r.id, null)}
            className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 text-gray-700">
            {r.title}
          </button>
        ))}
      </div>
      <div className="border-t p-3 space-y-1">
        <button onClick={onSkip} className="w-full text-left text-sm text-gray-500 hover:text-gray-700 py-0.5">
          Skip this meal
        </button>
        <button onClick={onClear} className="w-full text-left text-sm text-red-400 hover:text-red-600 py-0.5">
          Remove from plan
        </button>
      </div>
    </>
  );
}

// Desktop: absolute dropdown
function CellMenu({ recipes, onSelect, onClear, onSkip, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute z-20 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
      <RecipePickerContent recipes={recipes} onSelect={onSelect} onClear={onClear} onSkip={onSkip} />
    </div>
  );
}

// Mobile: fixed bottom sheet
function MobileSheet({ title, recipes, onSelect, onClear, onSkip, onClose }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl overflow-hidden"
        style={{ maxHeight: "80vh" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">×</button>
        </div>
        <RecipePickerContent recipes={recipes} onSelect={onSelect} onClear={onClear} onSkip={onSkip} />
      </div>
    </>
  );
}

// Recipe quick-view sheet (bottom on mobile, centered modal on desktop)
function RecipeSheet({ recipe, onClose }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl overflow-hidden sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[480px] sm:rounded-2xl"
        style={{ maxHeight: "85vh" }}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b bg-white sticky top-0">
          <div>
            <p className="font-semibold text-gray-800">{recipe.title}</p>
            <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
              {recipe.prep_min > 0 && <span>Prep {recipe.prep_min}m</span>}
              {recipe.cook_min > 0 && <span>Cook {recipe.cook_min}m</span>}
              {recipe.servings > 0 && <span>Serves {recipe.servings}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none ml-4 mt-0.5">×</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {recipe.ingredients?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ingredients</h4>
              <ul className="space-y-1">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    {(ing.amount || ing.unit) && (
                      <span className="font-medium text-gray-500 shrink-0 min-w-[60px]">{ing.amount} {ing.unit}</span>
                    )}
                    <span>{ing.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recipe.instructions && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Instructions</h4>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{recipe.instructions}</p>
            </div>
          )}
          {recipe.notes && <p className="text-xs text-gray-400 italic">{recipe.notes}</p>}
        </div>
      </div>
    </>
  );
}

export default function MealPlan() {
  const navigate = useNavigate();
  const [weekStartDay, setWeekStartDay] = useState("Monday");
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date(), "Monday"));
  const [selectedDay, setSelectedDay] = useState(getTodayDayName());
  const [entries, setEntries] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeCell, setActiveCell] = useState(null); // {day, meal_type} for desktop
  const [mobileSheet, setMobileSheet] = useState(null); // {day, meal_type} for mobile
  const [recipeSheet, setRecipeSheet] = useState(null); // recipe object
  const [error, setError] = useState(null);

  const [refreshingSlot, setRefreshingSlot] = useState(null); // "Day-MealType"
  const [dragTarget, setDragTarget] = useState(null); // {day, mealType} desktop hover
  const [moveMode, setMoveMode] = useState(null); // {day, mealType} mobile two-tap move

  const [showAI, setShowAI] = useState(false);
  const [aiNotes, setAiNotes] = useState("");
  const [usePantry, setUsePantry] = useState(true);
  const [useFavorites, setUseFavorites] = useState(true);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const rawRef = useRef("");

  const weekKey = toYMD(weekStart);

  const load = () => {
    setLoading(true);
    Promise.all([getMealPlan(weekKey), getRecipes(), getPreferences()])
      .then(([plan, recs, prefs]) => {
        setEntries(plan); setRecipes(recs); setPreferences(prefs);
        const sday = prefs?.week_start_day || "Monday";
        setWeekStartDay(sday);
        setWeekStart((prev) => getWeekStart(prev, sday));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [weekKey]);

  const getEntry = (day, mealType) => entries.find((e) => e.day === day && e.meal_type === mealType);

  const handleSelect = async (day, mealType, recipeId, freeText) => {
    setActiveCell(null);
    setMobileSheet(null);
    try {
      await setMealPlanEntry({ week_start: weekKey, day, meal_type: mealType, recipe_id: recipeId, free_text: freeText });
      load();
    } catch (e) { setError(e.message); }
  };

  const handleClear = async (day, mealType) => {
    setActiveCell(null);
    setMobileSheet(null);
    const entry = getEntry(day, mealType);
    if (entry) { await deleteMealPlanEntry(entry.id); load(); }
  };

  const handleGenerateAI = () => {
    setAiStreaming(true);
    setAiError(null);
    rawRef.current = "";
    streamGenerateMealPlan(
      { week_start: weekKey, preferences: aiNotes || null, use_pantry: usePantry, use_favorites: useFavorites },
      (chunk) => { rawRef.current += chunk; },
      async () => {
        setAiStreaming(false);
        try {
          const parsed = JSON.parse(rawRef.current);
          for (const day of DAYS) {
            const dayPlan = parsed[day];
            if (!dayPlan) continue;
            for (const mealType of MEAL_TYPES) {
              const text = dayPlan[mealType];
              if (!text) continue;
              const matched = matchRecipe(text, recipes);
              await setMealPlanEntry({ week_start: weekKey, day, meal_type: mealType, recipe_id: matched?.id ?? null, free_text: matched ? null : text });
            }
          }
          setShowAI(false);
          load();
        } catch { setAiError("Could not parse AI response. Try again."); }
      },
      (err) => { setAiStreaming(false); setAiError(err); }
    );
  };

  const favorites = recipes.filter((r) => r.is_favorite);
  const DAYS = getDaysFrom(weekStartDay);
  const prevWeek = () => setWeekStart(subWeeks(weekStart, 1));
  const nextWeek = () => setWeekStart(addWeeks(weekStart, 1));
  const thisWeek = () => setWeekStart(getWeekStart(new Date(), weekStartDay));

  const handleRefreshSlot = (day, mealType) => {
    const key = `${day}-${mealType}`;
    setRefreshingSlot(key);
    let text = "";
    streamRefreshMealSlot(
      { week_start: weekKey, day, meal_type: mealType },
      (chunk) => { text += chunk; },
      async () => {
        const name = text.trim();
        if (name) {
          const matched = matchRecipe(name, recipes);
          await setMealPlanEntry({ week_start: weekKey, day, meal_type: mealType, recipe_id: matched?.id ?? null, free_text: matched ? null : name });
          load();
        }
        setRefreshingSlot(null);
      },
      (err) => { setError(err); setRefreshingSlot(null); }
    );
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await generateWeekRecipes(weekKey);
      navigate(`/shopping-list?week=${weekKey}`);
    } catch (e) {
      setError(e.message);
      setPublishing(false);
    }
  };

  const handleSkip = async (day, mealType) => {
    setActiveCell(null);
    setMobileSheet(null);
    try {
      await setMealPlanEntry({ week_start: weekKey, day, meal_type: mealType, recipe_id: null, free_text: SKIP });
      load();
    } catch (e) { setError(e.message); }
  };

  const handleSkipDay = async (day) => {
    try {
      await Promise.all(
        MEAL_TYPES.map((mt) =>
          setMealPlanEntry({ week_start: weekKey, day, meal_type: mt, recipe_id: null, free_text: SKIP })
        )
      );
      load();
    } catch (e) { setError(e.message); }
  };

  const isDaySkipped = (day) => MEAL_TYPES.every((mt) => isSkipped(getEntry(day, mt)));

  const handleEasySlot = (day, mealType) => {
    const key = `${day}-${mealType}`;
    setRefreshingSlot(key);
    let text = "";
    streamRefreshMealSlot(
      { week_start: weekKey, day, meal_type: mealType, easy: true },
      (chunk) => { text += chunk; },
      async () => {
        const name = text.trim();
        if (name) {
          const matched = matchRecipe(name, recipes);
          await setMealPlanEntry({ week_start: weekKey, day, meal_type: mealType, recipe_id: matched?.id ?? null, free_text: matched ? null : name });
          load();
        }
        setRefreshingSlot(null);
      },
      (err) => { setError(err); setRefreshingSlot(null); }
    );
  };

  const handleDrop = async (sourceDay, sourceMealType, targetDay, targetMealType) => {
    if (sourceDay === targetDay && sourceMealType === targetMealType) return;
    const sourceEntry = getEntry(sourceDay, sourceMealType);
    const targetEntry = getEntry(targetDay, targetMealType);
    if (!sourceEntry) return;
    setDragTarget(null);
    try {
      await setMealPlanEntry({ week_start: weekKey, day: targetDay, meal_type: targetMealType, recipe_id: sourceEntry.recipe_id, free_text: sourceEntry.free_text });
      if (targetEntry) {
        await setMealPlanEntry({ week_start: weekKey, day: sourceDay, meal_type: sourceMealType, recipe_id: targetEntry.recipe_id, free_text: targetEntry.free_text });
      } else {
        await deleteMealPlanEntry(sourceEntry.id);
      }
      load();
    } catch (e) { setError(e.message); }
  };

  const isFavEntry = (entry) => entry?.recipe_id && recipes.find((r) => r.id === entry.recipe_id)?.is_favorite;
  const isSkipped = (entry) => entry?.free_text === SKIP;
  const isCooked = (entry) => !!entry?.cooked_at;

  const entryClass = (entry) => {
    if (!entry) return "bg-white border-stone-200 text-stone-400";
    if (isSkipped(entry)) return "bg-stone-100 border-stone-200 text-stone-400";
    if (isCooked(entry)) return "bg-stone-100 border-stone-300 text-stone-500";
    return isFavEntry(entry) ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900";
  };

  const handleCook = async (entry) => {
    if (!entry?.recipe_id) return;
    const recipe = recipes.find((r) => r.id === entry.recipe_id);
    const title = recipe?.title || entry.label || "this meal";
    const confirmed = window.confirm(
      `Mark "${title}" as cooked? This will deduct its ingredients from your pantry.`
    );
    if (!confirmed) return;
    try {
      const result = await markMealCooked(entry.id);
      const dCount = result.deducted?.length || 0;
      const sCount = result.skipped?.length || 0;
      if (sCount > 0) {
        setError(`Logged ${title}. Deducted ${dCount} item${dCount === 1 ? "" : "s"} from pantry; ${sCount} could not be deducted (not in pantry or unit mismatch).`);
      }
      load();
    } catch (e) { setError(e.message); }
  };

  const handleUncook = async (entry) => {
    if (!entry) return;
    try {
      await unmarkMealCooked(entry.id);
      load();
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Meal Plan</h1>
          <div className="flex items-center gap-1">
            <button onClick={prevWeek} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 text-lg">‹</button>
            <span className="text-xs sm:text-sm font-medium text-gray-600 min-w-max">
              {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
            </span>
            <button onClick={nextWeek} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 text-lg">›</button>
          </div>
          <button onClick={thisWeek} className="text-xs text-green-600 hover:underline">Today</button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="bg-green-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60"
          >
            {publishing ? "Saving recipes…" : "Publish"}
          </button>
          <button onClick={() => setShowAI(!showAI)}
            className="bg-purple-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm font-medium hover:bg-purple-700">
            AI Generate
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* AI Panel */}
      {showAI && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-purple-800">Generate Week with AI</h2>
          {preferences && (preferences.dietary_restrictions || preferences.cuisine_preferences || preferences.avoid) && (
            <div className="bg-white border border-purple-100 rounded-lg px-3 py-2 text-xs text-purple-700 space-y-0.5">
              <p className="font-medium text-purple-800 mb-1">Using your saved preferences:</p>
              {preferences.dietary_restrictions && <p>Restrictions: {preferences.dietary_restrictions}</p>}
              {preferences.cuisine_preferences && <p>Cuisines: {preferences.cuisine_preferences}</p>}
              {preferences.avoid && <p>Avoid: {preferences.avoid}</p>}
              <Link to="/preferences" className="text-purple-500 hover:underline inline-block mt-1">Edit →</Link>
            </div>
          )}
          {favorites.length > 0 ? (
            <p className="text-xs text-purple-700">
              <span className="text-yellow-400">★</span>{" "}
              <span className="font-medium">{favorites.length} favourite{favorites.length !== 1 ? "s" : ""}</span> will inspire the plan:{" "}
              {favorites.slice(0, 2).map((r) => r.title).join(", ")}{favorites.length > 2 ? ` +${favorites.length - 2} more` : ""}
            </p>
          ) : (
            <p className="text-xs text-purple-500">
              No favourites yet. <Link to="/recipes" className="underline">Star some recipes</Link> to include them.
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="text" placeholder="Extra notes for this week? (optional)"
              value={aiNotes} onChange={(e) => setAiNotes(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm flex-1" />
            <button onClick={handleGenerateAI} disabled={aiStreaming}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 sm:shrink-0">
              {aiStreaming ? "Generating..." : "Generate"}
            </button>
          </div>
          <div className="flex gap-4 text-sm flex-wrap">
            <label className="flex items-center gap-2 text-purple-700 cursor-pointer">
              <input type="checkbox" checked={useFavorites} onChange={(e) => setUseFavorites(e.target.checked)} className="rounded" />
              Include favourites
            </label>
            <label className="flex items-center gap-2 text-purple-700 cursor-pointer">
              <input type="checkbox" checked={usePantry} onChange={(e) => setUsePantry(e.target.checked)} className="rounded" />
              Use pantry
            </label>
          </div>
          {aiError && <p className="text-red-500 text-sm">{aiError}</p>}
          <p className="text-xs text-purple-400">Overwrites existing entries for this week.</p>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <>
          {/* ── MOBILE VIEW ── */}
          <div className="sm:hidden">
            {/* Day tabs */}
            <div className="flex gap-1 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {DAYS.map((day, i) => {
                const date = addDays(weekStart, i);
                const isToday = toYMD(date) === toYMD(new Date());
                const hasEntries = MEAL_TYPES.some((mt) => getEntry(day, mt));
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`flex flex-col items-center px-3 py-2 rounded-xl shrink-0 border transition-colors ${
                      selectedDay === day
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-gray-600 border-gray-200"
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase">{day.slice(0, 3)}</span>
                    <span className={`text-base font-bold ${isToday && selectedDay !== day ? "text-green-600" : ""}`}>
                      {format(date, "d")}
                    </span>
                    {hasEntries && (
                      <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${selectedDay === day ? "bg-white" : "bg-green-400"}`} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Move mode banner */}
            {moveMode && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Moving</p>
                  <p className="text-sm text-blue-700 font-medium">{getEntry(moveMode.day, moveMode.mealType)?.label}</p>
                  <p className="text-xs text-blue-500 mt-0.5">Tap any slot to move here{moveMode.day !== selectedDay ? ` · from ${moveMode.day}` : ""}</p>
                </div>
                <button onClick={() => setMoveMode(null)} className="text-blue-400 text-2xl leading-none ml-3">×</button>
              </div>
            )}

            {/* Meals for selected day */}
            <div className="mt-3 flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{selectedDay}</span>
              <button
                onClick={() => handleSkipDay(selectedDay)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${isDaySkipped(selectedDay) ? "bg-stone-100 border-stone-300 text-stone-500" : "border-stone-200 text-stone-400 hover:border-stone-400 hover:text-stone-600"}`}
              >
                {isDaySkipped(selectedDay) ? "Clear day" : "Skip day"}
              </button>
            </div>
            <div className="space-y-2">
              {MEAL_TYPES.map((mealType) => {
                const entry = getEntry(selectedDay, mealType);
                const isFav = isFavEntry(entry);
                const slotKey = `${selectedDay}-${mealType}`;
                const isRefreshing = refreshingSlot === slotKey;
                const isMoveSrc = moveMode?.day === selectedDay && moveMode?.mealType === mealType;
                return (
                  <div
                    key={mealType}
                    className={`w-full flex items-center rounded-xl border px-4 py-3.5 transition-colors ${isMoveSrc ? "border-blue-300 bg-blue-50" : entryClass(entry)} ${moveMode && !isMoveSrc ? "border-dashed border-blue-300 cursor-pointer" : ""}`}
                  >
                    {entry && !isSkipped(entry) && entry.recipe_id && (
                      <span className="text-2xl shrink-0 mr-3 leading-none">{mealEmoji(entry.label)}</span>
                    )}
                    <div
                      className="flex-1 text-left cursor-pointer"
                      onClick={() => {
                        if (moveMode) {
                          if (!isMoveSrc) handleDrop(moveMode.day, moveMode.mealType, selectedDay, mealType);
                          setMoveMode(null);
                          return;
                        }
                        const linked = entry?.recipe_id ? recipes.find((r) => r.id === entry.recipe_id) : null;
                        if (linked) setRecipeSheet(linked);
                        else setMobileSheet({ day: selectedDay, meal_type: mealType });
                      }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-0.5">{mealType}</p>
                      {isSkipped(entry) ? (
                        <p className="text-sm text-stone-400 italic line-through">Skipped</p>
                      ) : entry ? (
                        <p className={`text-sm font-medium flex items-center gap-1.5 ${isCooked(entry) ? "line-through opacity-70" : ""}`}>
                          {isFav && <span className="text-amber-400">★</span>}
                          {isCooked(entry) && <span className="text-emerald-500">✓</span>}
                          {isRefreshing ? (
                            <span className="text-stone-400 italic">Getting suggestion…</span>
                          ) : entry.recipe_id ? (
                            <span className="underline decoration-dotted">{entry.label}</span>
                          ) : entry.label}
                        </p>
                      ) : (
                        <p className="text-sm text-stone-400">{moveMode ? "Move here" : "Tap to add"}</p>
                      )}
                    </div>
                    {!moveMode && (
                      <div className="flex items-center gap-1.5 ml-2 shrink-0">
                        {entry && !isSkipped(entry) && entry.recipe_id && (
                          isCooked(entry) ? (
                            <button
                              onClick={() => handleUncook(entry)}
                              title="Un-mark cooked"
                              className="text-base leading-none text-emerald-500 hover:text-emerald-700 transition-colors"
                            >
                              ✓
                            </button>
                          ) : (
                            <button
                              onClick={() => handleCook(entry)}
                              title="Mark as cooked (deducts from pantry)"
                              className="text-base leading-none text-stone-300 hover:text-emerald-500 transition-colors"
                            >
                              ✓
                            </button>
                          )
                        )}
                        {entry && !isSkipped(entry) && !isCooked(entry) && (
                          <>
                            <button
                              onClick={() => setMoveMode({ day: selectedDay, mealType })}
                              title="Move to another slot"
                              className="text-base leading-none text-stone-300 hover:text-blue-500 transition-colors"
                            >
                              ⇄
                            </button>
                            <button
                              onClick={() => handleEasySlot(selectedDay, mealType)}
                              disabled={refreshingSlot !== null}
                              title="Quick easy meal"
                              className="text-base leading-none text-stone-300 hover:text-amber-500 transition-colors disabled:opacity-30"
                            >
                              ⚡
                            </button>
                            <button
                              onClick={() => handleRefreshSlot(selectedDay, mealType)}
                              disabled={refreshingSlot !== null}
                              title="Suggest different meal"
                              className={`text-lg leading-none transition-colors disabled:opacity-30 ${isRefreshing ? "text-purple-400" : "text-stone-300 hover:text-purple-500"}`}
                            >
                              ↻
                            </button>
                          </>
                        )}
                        <span className="text-stone-300 text-lg cursor-pointer" onClick={() => setMobileSheet({ day: selectedDay, meal_type: mealType })}>›</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── DESKTOP VIEW ── */}
          <div className="hidden sm:block">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr>
                  <th className="w-24 pb-2 pr-2" />
                  {DAYS.map((day, i) => (
                    <th key={day} className="text-center text-xs font-semibold text-gray-600 pb-2 px-1">
                      <div>{day.slice(0, 3)}</div>
                      <div className="text-gray-400 font-normal">{format(addDays(weekStart, i), "M/d")}</div>
                      <button
                        onClick={() => handleSkipDay(day)}
                        title={isDaySkipped(day) ? "Clear day" : "Skip day"}
                        className={`mt-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${isDaySkipped(day) ? "bg-stone-200 text-stone-500 hover:bg-stone-300" : "text-stone-300 hover:text-stone-500 hover:bg-stone-100"}`}
                      >
                        {isDaySkipped(day) ? "clear" : "skip"}
                      </button>
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
                      const isFav = isFavEntry(entry);
                      const slotKey = `${day}-${mealType}`;
                      const isRefreshing = refreshingSlot === slotKey;
                      return (
                        <td key={day} className="px-1 py-1 align-top">
                          <div
                            className="relative group"
                            draggable={!!entry}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", JSON.stringify({ day, mealType }));
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setDragTarget(null)}
                            onDragOver={(e) => { e.preventDefault(); setDragTarget({ day, mealType }); }}
                            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragTarget(null); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const src = JSON.parse(e.dataTransfer.getData("text/plain") || "null");
                              if (src) handleDrop(src.day, src.mealType, day, mealType);
                            }}
                          >
                            <button
                              onClick={() => setActiveCell(isActive ? null : { day, meal_type: mealType })}
                              className={`w-full min-h-[52px] text-left rounded-lg border px-2 py-1.5 text-xs transition-all overflow-hidden ${entryClass(entry)} hover:opacity-80 ${entry ? "cursor-grab active:cursor-grabbing" : ""} ${isActive ? "ring-2 ring-green-400" : ""} ${dragTarget?.day === day && dragTarget?.mealType === mealType ? "ring-2 ring-blue-400 !bg-blue-50" : ""}`}
                            >
                              {isSkipped(entry) ? (
                                <span className="line-through text-stone-400 italic text-xs">Skipped</span>
                              ) : entry ? (
                                <span className={`flex items-start gap-1 min-w-0 ${isCooked(entry) ? "line-through opacity-70" : ""}`}>
                                  {isFav && <span className="text-amber-400 shrink-0">★</span>}
                                  {isCooked(entry) && <span className="text-emerald-500 shrink-0">✓</span>}
                                  {isRefreshing ? (
                                    <span className="text-stone-400 italic">…</span>
                                  ) : entry.recipe_id ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setRecipeSheet(recipes.find((r) => r.id === entry.recipe_id)); }}
                                      className="hover:underline text-left leading-tight truncate block max-w-full"
                                    >
                                      {entry.label}
                                    </button>
                                  ) : entry.label}
                                </span>
                              ) : <span className="text-stone-300">+</span>}
                            </button>
                            {entry && !isSkipped(entry) && (
                              <div className={`absolute bottom-0.5 right-0.5 flex gap-0.5 transition-all ${isRefreshing ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                                {entry.recipe_id && (
                                  isCooked(entry) ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleUncook(entry); }}
                                      title="Un-mark cooked"
                                      className="text-xs leading-none p-0.5 rounded text-emerald-500 hover:text-emerald-700"
                                    >
                                      ✓
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleCook(entry); }}
                                      title="Mark cooked (deducts pantry)"
                                      className="text-xs leading-none p-0.5 rounded text-stone-400 hover:text-emerald-500"
                                    >
                                      ✓
                                    </button>
                                  )
                                )}
                                {!isCooked(entry) && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleEasySlot(day, mealType); }}
                                      disabled={refreshingSlot !== null}
                                      title="Quick easy meal"
                                      className="text-xs leading-none p-0.5 rounded text-stone-400 hover:text-amber-500 disabled:opacity-20"
                                    >
                                      ⚡
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleRefreshSlot(day, mealType); }}
                                      disabled={refreshingSlot !== null}
                                      title="Suggest different meal"
                                      className={`text-xs leading-none p-0.5 rounded disabled:opacity-20 ${isRefreshing ? "text-purple-400" : "text-stone-400 hover:text-purple-500"}`}
                                    >
                                      ↻
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            {isActive && (
                              <CellMenu
                                recipes={recipes}
                                onSelect={(rid, ft) => handleSelect(day, mealType, rid, ft)}
                                onClear={() => handleClear(day, mealType)}
                                onSkip={() => handleSkip(day, mealType)}
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
        </>
      )}

      {/* Mobile bottom sheet */}
      {mobileSheet && (
        <MobileSheet
          title={`${mobileSheet.day} · ${mobileSheet.meal_type}`}
          recipes={recipes}
          onSelect={(rid, ft) => handleSelect(mobileSheet.day, mobileSheet.meal_type, rid, ft)}
          onClear={() => handleClear(mobileSheet.day, mobileSheet.meal_type)}
          onSkip={() => { handleSkip(mobileSheet.day, mobileSheet.meal_type); setMobileSheet(null); }}
          onClose={() => setMobileSheet(null)}
        />
      )}

      {/* Recipe detail sheet */}
      {recipeSheet && (
        <RecipeSheet recipe={recipeSheet} onClose={() => setRecipeSheet(null)} />
      )}
    </div>
  );
}

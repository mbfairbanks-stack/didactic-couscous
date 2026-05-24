import { useState, useEffect, useRef } from "react";
import { getRecipes, createRecipe, updateRecipe, deleteRecipe, getPantry, streamGenerateRecipe, streamImportRecipePDF, streamImportRecipeURL, streamImportRecipeText, publishRecipe, unpublishRecipe, getCommunityRecipes, copyCommunityRecipe } from "../api";

const EMPTY_FORM = {
  title: "",
  servings: 4,
  prep_min: 0,
  cook_min: 0,
  ingredients: [{ name: "", amount: "", unit: "" }],
  instructions: "",
  tags: "",
  notes: "",
};

const ALL_TAGS = ["quick", "vegetarian", "vegan", "gluten-free", "dairy-free", "batch-cook", "slow-cooker", "one-pan"];

const RECIPE_THEMES = [
  { kw: ["pasta","spaghetti","linguine","penne","fettuccine","rigatoni","noodle","tagliatelle"], emoji:"🍝", grad:"from-orange-100 to-amber-200" },
  { kw: ["salad","slaw","coleslaw"], emoji:"🥗", grad:"from-green-100 to-emerald-200" },
  { kw: ["soup","stew","chowder","broth","bisque","minestrone"], emoji:"🍲", grad:"from-amber-100 to-orange-200" },
  { kw: ["curry","masala","korma","tikka","dahl","dal","lentil"], emoji:"🍛", grad:"from-yellow-100 to-orange-200" },
  { kw: ["chicken","poultry","wing","thigh","drumstick"], emoji:"🍗", grad:"from-yellow-100 to-amber-200" },
  { kw: ["beef","steak","burger","mince","brisket","meatball","bolognese"], emoji:"🥩", grad:"from-red-100 to-rose-200" },
  { kw: ["pork","bacon","ham","sausage","chorizo","ribs"], emoji:"🥓", grad:"from-rose-100 to-red-200" },
  { kw: ["fish","salmon","tuna","cod","trout","seafood","shrimp","prawn","crab","lobster"], emoji:"🐟", grad:"from-blue-100 to-cyan-200" },
  { kw: ["pizza"], emoji:"🍕", grad:"from-red-100 to-orange-200" },
  { kw: ["taco","burrito","quesadilla","enchilada","fajita"], emoji:"🌮", grad:"from-yellow-100 to-green-200" },
  { kw: ["cake","cookie","brownie","muffin","dessert","chocolate","pudding","tart"], emoji:"🍰", grad:"from-pink-100 to-rose-200" },
  { kw: ["bread","toast","sandwich","wrap","panini","baguette"], emoji:"🥪", grad:"from-amber-100 to-yellow-200" },
  { kw: ["egg","omelette","frittata","quiche","scrambled","poached"], emoji:"🍳", grad:"from-yellow-100 to-amber-200" },
  { kw: ["rice","fried rice","risotto","pilaf","paella","biryani"], emoji:"🍚", grad:"from-slate-100 to-gray-200" },
  { kw: ["stir fry","stir-fry","wok","bok choy"], emoji:"🥘", grad:"from-emerald-100 to-teal-200" },
  { kw: ["feta","cheese","halloumi","brie","parmesan","mozzarella"], emoji:"🧀", grad:"from-yellow-100 to-amber-200" },
  { kw: ["tomato"], emoji:"🍅", grad:"from-red-100 to-orange-200" },
  { kw: ["mushroom"], emoji:"🍄", grad:"from-stone-100 to-amber-100" },
  { kw: ["avocado","guacamole"], emoji:"🥑", grad:"from-green-100 to-lime-200" },
  { kw: ["pancake","waffle","crepe","french toast"], emoji:"🥞", grad:"from-amber-50 to-yellow-200" },
];

function recipeTheme(title) {
  const lower = title.toLowerCase();
  for (const t of RECIPE_THEMES) {
    if (t.kw.some((k) => lower.includes(k))) return t;
  }
  return { emoji: "🍽️", grad: "from-stone-100 to-stone-200" };
}

function RecipeCard({ recipe, onEdit, onDelete, onToggleFavorite, onTogglePublish, pantryNames }) {
  const [expanded, setExpanded] = useState(false);
  const totalIng = recipe.ingredients?.length || 0;
  const matched = (recipe.ingredients || []).filter(
    (ing) => ing.name && pantryNames.has(ing.name.toLowerCase().trim())
  ).length;
  const matchRatio = totalIng > 0 ? matched / totalIng : 0;
  const matchColor =
    matchRatio >= 0.75 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    matchRatio >= 0.4  ? "bg-amber-50 text-amber-700 border-amber-200" :
                         "bg-stone-50 text-stone-500 border-stone-200";
  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${recipe.is_favorite ? "border-amber-300" : "border-stone-200"}`}>
      {(() => { const t = recipeTheme(recipe.title); return (
        <div className={`h-12 bg-gradient-to-r ${t.grad} flex items-center px-4 gap-2 relative`}>
          <span className="text-xl">{t.emoji}</span>
          {recipe.is_favorite && (
            <span className="absolute right-3 text-yellow-400 text-sm drop-shadow">★</span>
          )}
        </div>
      ); })()}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="font-semibold text-stone-800 text-left hover:text-emerald-700 w-full"
            >
              {recipe.title}
            </button>
            <div className="flex gap-3 text-xs text-stone-400 mt-1 flex-wrap items-center">
              {recipe.prep_min > 0 && <span>Prep {recipe.prep_min}m</span>}
              {recipe.cook_min > 0 && <span>Cook {recipe.cook_min}m</span>}
              {recipe.servings && <span>Serves {recipe.servings}</span>}
              {recipe.times_made > 0 && (
                <span className="text-emerald-600">Made {recipe.times_made}×</span>
              )}
              {totalIng > 0 && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${matchColor}`}>
                  {matched}/{totalIng} in pantry
                </span>
              )}
            </div>
            {recipe.tags?.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-2">
                {recipe.tags.map((t) => (
                  <span key={t} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">{t}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onToggleFavorite(recipe)}
              className={`text-lg ${recipe.is_favorite ? "text-yellow-400" : "text-gray-200 hover:text-yellow-300"}`}
              title={recipe.is_favorite ? "Unfavorite" : "Favorite"}
            >
              ★
            </button>
            <button
              onClick={() => onTogglePublish(recipe)}
              title={recipe.is_public ? "Remove from Community" : "Share to Community"}
              className={`text-xs px-1 transition-colors ${recipe.is_public ? "text-blue-500 hover:text-blue-700" : "text-stone-300 hover:text-blue-400"}`}
            >
              🌐
            </button>
            <button onClick={() => onEdit(recipe)} className="text-xs text-stone-500 hover:underline px-1">Edit</button>
            <button onClick={() => onDelete(recipe.id)} className="text-xs text-red-400 hover:underline px-1">Del</button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 border-t pt-3">
            {recipe.ingredients?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Ingredients</h4>
                <ul className="space-y-0.5">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      {ing.amount && <span className="font-medium">{ing.amount} {ing.unit} </span>}
                      {ing.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {recipe.instructions && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Instructions</h4>
                <p className="text-sm text-gray-700 whitespace-pre-line">{recipe.instructions}</p>
              </div>
            )}
            {recipe.notes && (
              <p className="text-xs text-gray-400 italic">{recipe.notes}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IngredientFields({ ingredients, onChange }) {
  const add = () => onChange([...ingredients, { name: "", amount: "", unit: "" }]);
  const remove = (i) => onChange(ingredients.filter((_, idx) => idx !== i));
  const update = (i, field, val) => {
    const updated = [...ingredients];
    updated[i] = { ...updated[i], [field]: val };
    onChange(updated);
  };
  return (
    <div className="space-y-2">
      {ingredients.map((ing, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            placeholder="Amount"
            value={ing.amount}
            onChange={(e) => update(i, "amount", e.target.value)}
            className="border rounded px-2 py-1 text-sm w-20"
          />
          <input
            placeholder="Unit"
            value={ing.unit}
            onChange={(e) => update(i, "unit", e.target.value)}
            className="border rounded px-2 py-1 text-sm w-20"
          />
          <input
            placeholder="Ingredient name"
            value={ing.name}
            onChange={(e) => update(i, "name", e.target.value)}
            className="border rounded px-2 py-1 text-sm flex-1"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-red-400 hover:text-red-600 text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm text-green-600 hover:underline"
      >
        + Add ingredient
      </button>
    </div>
  );
}

export default function Recipes() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filterTag, setFilterTag] = useState("");
  const [search, setSearch] = useState("");

  // Import / AI panel: mode = null | "generate" | "pdf" | "url"
  const [importMode, setImportMode] = useState(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [usePantry, setUsePantry] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiRaw, setAiRaw] = useState("");
  const [aiParsed, setAiParsed] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [pantryNames, setPantryNames] = useState(() => new Set());
  const [tab, setTab] = useState("mine"); // "mine" | "community"
  const [communityRecipes, setCommunityRecipes] = useState([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const rawRef = useRef("");

  const load = () => {
    setLoading(true);
    Promise.all([getRecipes(), getPantry().catch(() => [])])
      .then(([recs, pantry]) => {
        setRecipes(recs);
        setPantryNames(new Set(pantry.map((p) => (p.name || "").toLowerCase().trim())));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const loadCommunity = () => {
    setCommunityLoading(true);
    getCommunityRecipes()
      .then(setCommunityRecipes)
      .catch(() => {})
      .finally(() => setCommunityLoading(false));
  };

  useEffect(() => { if (tab === "community") loadCommunity(); }, [tab]);

  const handleTogglePublish = async (recipe) => {
    try {
      if (recipe.is_public) {
        await unpublishRecipe(recipe.id);
      } else {
        await publishRecipe(recipe.id);
      }
      load();
    } catch (e) { setError(e.message); }
  };

  const handleCopyFromCommunity = async (recipe) => {
    try {
      await copyCommunityRecipe(recipe.id);
      load();
      setTab("mine");
    } catch (e) { setError(e.message); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = {
      ...form,
      servings: parseInt(form.servings) || 4,
      prep_min: parseInt(form.prep_min) || 0,
      cook_min: parseInt(form.cook_min) || 0,
      tags: typeof form.tags === "string"
        ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : form.tags,
      ingredients: form.ingredients.filter((i) => i.name.trim()),
    };
    try {
      if (editingId) {
        await updateRecipe(editingId, body);
      } else {
        await createRecipe(body);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleEdit = (recipe) => {
    setForm({
      title: recipe.title,
      servings: recipe.servings,
      prep_min: recipe.prep_min,
      cook_min: recipe.cook_min,
      ingredients: recipe.ingredients?.length ? recipe.ingredients : [{ name: "", amount: "", unit: "" }],
      instructions: recipe.instructions,
      tags: (recipe.tags || []).join(", "),
      notes: recipe.notes || "",
    });
    setEditingId(recipe.id);
    setShowForm(true);
    setImportMode(null);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this recipe?")) return;
    await deleteRecipe(id);
    load();
  };

  const handleToggleFavorite = async (recipe) => {
    await updateRecipe(recipe.id, { is_favorite: !recipe.is_favorite });
    load();
  };

  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const startStream = (streamFn, ...args) => {
    setAiStreaming(true);
    setAiRaw("");
    setAiParsed(null);
    setAiError(null);
    rawRef.current = "";
    streamFn(
      ...args,
      (chunk) => { rawRef.current += chunk; setAiRaw(rawRef.current); },
      () => {
        setAiStreaming(false);
        try { setAiParsed(JSON.parse(rawRef.current)); }
        catch { setAiError("Could not parse recipe. Try again."); }
      },
      (err) => { setAiStreaming(false); setAiError(err); }
    );
  };

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    let pantryItems = [];
    if (usePantry) {
      const items = await getPantry().catch(() => []);
      pantryItems = items.map((i) => `${i.name} (${i.quantity} ${i.unit})`);
    }
    startStream(streamGenerateRecipe, { prompt: aiPrompt, pantry_items: pantryItems.length ? pantryItems : null });
  };

  const handleImportURL = () => {
    if (!importUrl.trim()) return;
    startStream(streamImportRecipeURL, importUrl.trim());
  };

  const handleImportText = () => {
    if (!pasteText.trim()) return;
    startStream(streamImportRecipeText, pasteText.trim());
  };

  const handleImportPDF = () => {
    if (!importFile) return;
    startStream(streamImportRecipePDF, importFile);
  };

  const handleSaveAI = async () => {
    if (!aiParsed) return;
    try {
      await createRecipe({ ...aiParsed, source: "ai", tags: aiParsed.tags || [], ingredients: aiParsed.ingredients || [] });
      setImportMode(null);
      setAiParsed(null);
      setAiRaw("");
      setAiPrompt("");
      setImportUrl("");
      setImportFile(null);
      load();
    } catch (e) {
      setAiError(e.message);
    }
  };

  const filtered = recipes.filter((r) => {
    const matchTag = !filterTag || (r.tags || []).includes(filterTag);
    const matchSearch = r.title.toLowerCase().includes(search.toLowerCase());
    return matchTag && matchSearch;
  });

  const favorites = filtered.filter((r) => r.is_favorite);
  const rest = filtered.filter((r) => !r.is_favorite);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Recipes</h1>
        <div className="flex gap-2 flex-wrap">
          {["generate", "paste", "pdf", "url"].map((mode) => (
            <button
              key={mode}
              onClick={() => { setImportMode(importMode === mode ? null : mode); setShowForm(false); setAiParsed(null); setAiRaw(""); setAiError(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${importMode === mode ? "bg-purple-700 text-white" : "bg-purple-600 text-white hover:bg-purple-700"}`}
            >
              {mode === "generate" ? "AI Generate" : mode === "paste" ? "Paste Recipe" : mode === "pdf" ? "Import PDF" : "Import URL"}
            </button>
          ))}
          <button
            onClick={() => { setShowForm(!showForm); setImportMode(null); setEditingId(null); setForm(EMPTY_FORM); }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
          >
            + Add Recipe
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm w-48"
        />
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setFilterTag("")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!filterTag ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-300 hover:border-green-400"}`}
          >
            All
          </button>
          {ALL_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setFilterTag(t === filterTag ? "" : t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterTag === t ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-300 hover:border-green-400"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* Import / AI Panel */}
      {importMode && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-purple-800 mb-3">
            {importMode === "generate" ? "AI Recipe Generator" : importMode === "paste" ? "Paste a Recipe" : importMode === "pdf" ? "Import from PDF" : "Import from URL"}
          </h2>

          {importMode === "generate" && (
            <>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder='e.g. "30-minute chicken stir fry" or "easy vegetarian pasta"'
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                />
                <button onClick={handleGenerate} disabled={aiStreaming || !aiPrompt.trim()}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                  {aiStreaming ? "Generating..." : "Generate"}
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-purple-700 mb-3 cursor-pointer">
                <input type="checkbox" checked={usePantry} onChange={(e) => setUsePantry(e.target.checked)} className="rounded" />
                Use ingredients from my pantry
              </label>
            </>
          )}

          {importMode === "paste" && (
            <div className="space-y-2 mb-3">
              <textarea
                placeholder="Paste a recipe here — from a website, email, notes app, anywhere. AI will extract it into the structured format."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                className="border rounded-lg px-3 py-2 text-sm w-full resize-y"
              />
              <button onClick={handleImportText} disabled={aiStreaming || !pasteText.trim()}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                {aiStreaming ? "Extracting..." : "Extract Recipe"}
              </button>
            </div>
          )}

          {importMode === "pdf" && (
            <div className="flex gap-2 mb-3">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setImportFile(e.target.files[0] || null)}
                className="border rounded-lg px-3 py-2 text-sm flex-1 bg-white"
              />
              <button onClick={handleImportPDF} disabled={aiStreaming || !importFile}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 shrink-0">
                {aiStreaming ? "Reading..." : "Import"}
              </button>
            </div>
          )}

          {importMode === "url" && (
            <div className="flex gap-2 mb-3">
              <input
                type="url"
                placeholder="https://www.allrecipes.com/recipe/..."
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleImportURL()}
                className="border rounded-lg px-3 py-2 text-sm flex-1"
              />
              <button onClick={handleImportURL} disabled={aiStreaming || !importUrl.trim()}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 shrink-0">
                {aiStreaming ? "Fetching..." : "Import"}
              </button>
            </div>
          )}

          {aiError && <p className="text-red-500 text-sm mb-2">{aiError}</p>}

          {aiParsed && (
            <div className="bg-white rounded-lg border border-purple-200 p-4 mt-2">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-800 text-lg">{aiParsed.title}</h3>
                <button
                  onClick={handleSaveAI}
                  className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 shrink-0 ml-2"
                >
                  Save Recipe
                </button>
              </div>
              <div className="flex gap-4 text-xs text-gray-400 mb-3">
                {aiParsed.prep_min > 0 && <span>Prep {aiParsed.prep_min}m</span>}
                {aiParsed.cook_min > 0 && <span>Cook {aiParsed.cook_min}m</span>}
                {aiParsed.servings && <span>Serves {aiParsed.servings}</span>}
              </div>
              {aiParsed.tags?.length > 0 && (
                <div className="flex gap-1 flex-wrap mb-3">
                  {aiParsed.tags.map((t) => (
                    <span key={t} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-100">{t}</span>
                  ))}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Ingredients</h4>
                  <ul className="space-y-0.5">
                    {(aiParsed.ingredients || []).map((ing, i) => (
                      <li key={i} className="text-sm text-gray-700">
                        {ing.amount && <span className="font-medium">{ing.amount} {ing.unit} </span>}
                        {ing.name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Instructions</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{aiParsed.instructions}</p>
                </div>
              </div>
              {aiParsed.notes && <p className="text-xs text-gray-400 italic mt-3">{aiParsed.notes}</p>}
            </div>
          )}

          {aiStreaming && !aiParsed && (
            <div className="bg-white rounded-lg border border-purple-200 p-4 mt-2">
              <p className="text-xs text-gray-400 mb-1">Generating recipe...</p>
              <pre className="text-xs text-gray-500 whitespace-pre-wrap max-h-40 overflow-auto">{aiRaw}</pre>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-4">{editingId ? "Edit Recipe" : "Add Recipe"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="border rounded-lg px-3 py-1.5 text-sm w-full"
                  placeholder="Recipe name"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Servings</label>
                <input
                  type="number"
                  value={form.servings}
                  onChange={(e) => setForm({ ...form, servings: e.target.value })}
                  className="border rounded-lg px-3 py-1.5 text-sm w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Prep (min)</label>
                  <input
                    type="number"
                    value={form.prep_min}
                    onChange={(e) => setForm({ ...form, prep_min: e.target.value })}
                    className="border rounded-lg px-3 py-1.5 text-sm w-full"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Cook (min)</label>
                  <input
                    type="number"
                    value={form.cook_min}
                    onChange={(e) => setForm({ ...form, cook_min: e.target.value })}
                    className="border rounded-lg px-3 py-1.5 text-sm w-full"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Ingredients</label>
              <IngredientFields
                ingredients={form.ingredients}
                onChange={(ings) => setForm({ ...form, ingredients: ings })}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Instructions</label>
              <textarea
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                rows={5}
                className="border rounded-lg px-3 py-1.5 text-sm w-full"
                placeholder="Step by step instructions..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tags (comma-separated)</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="border rounded-lg px-3 py-1.5 text-sm w-full"
                  placeholder="quick, vegetarian..."
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="border rounded-lg px-3 py-1.5 text-sm w-full"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                {editingId ? "Save Changes" : "Add Recipe"}
              </button>
              <button type="button" onClick={handleCancel} className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab switcher: My Recipes / Community */}
      <div className="flex gap-1 mb-5 border-b border-stone-200">
        {[["mine", "My Recipes"], ["community", "🌐 Community"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? "border-green-600 text-green-700"
                : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "mine" ? (
        loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No recipes yet.</p>
            <p className="text-sm mt-1">Add one manually or use AI Generate.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {favorites.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Favorites</h3>
                <div className="grid sm:grid-cols-2 gap-3 items-start">
                  {favorites.map((r) => (
                    <RecipeCard
                      key={r.id}
                      recipe={r}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onToggleFavorite={handleToggleFavorite}
                      onTogglePublish={handleTogglePublish}
                      pantryNames={pantryNames}
                    />
                  ))}
                </div>
              </div>
            )}
            {rest.length > 0 && (
              <div>
                {favorites.length > 0 && (
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">All Recipes</h3>
                )}
                <div className="grid sm:grid-cols-2 gap-3 items-start">
                  {rest.map((r) => (
                    <RecipeCard
                      key={r.id}
                      recipe={r}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onToggleFavorite={handleToggleFavorite}
                      onTogglePublish={handleTogglePublish}
                      pantryNames={pantryNames}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* Community tab */
        communityLoading ? (
          <p className="text-gray-400 text-sm">Loading community recipes…</p>
        ) : communityRecipes.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No community recipes yet.</p>
            <p className="text-sm mt-1">
              Share your own recipes using the 🌐 button on any recipe card.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 items-start">
            {communityRecipes.map((r) => {
              const theme = recipeTheme(r.title);
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                  <div className={`h-12 bg-gradient-to-r ${theme.grad} flex items-center px-4 gap-2`}>
                    <span className="text-xl">{theme.emoji}</span>
                    <span className="text-xs font-semibold text-stone-500 ml-auto">Community</span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-stone-800">{r.title}</p>
                    <div className="flex gap-3 text-xs text-stone-400 mt-1 flex-wrap">
                      {r.prep_min > 0 && <span>Prep {r.prep_min}m</span>}
                      {r.cook_min > 0 && <span>Cook {r.cook_min}m</span>}
                      {r.servings && <span>Serves {r.servings}</span>}
                    </div>
                    {r.tags?.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-2">
                        {r.tags.map((t) => (
                          <span key={t} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">{t}</span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => handleCopyFromCommunity(r)}
                      className="mt-3 w-full bg-green-600 text-white text-sm font-medium py-1.5 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      + Add to my recipes
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { getPantry, createPantryItem, bulkCreatePantryItems, updatePantryItem, deletePantryItem, clearAllPantryItems, parseReceipt, scanPantryPhoto } from "../api";

const UNITS = ["lbs", "lb", "kg", "g", "oz", "cups", "cup", "cans", "can", "bottles", "bottle",
  "bags", "bag", "boxes", "box", "l", "ml", "tsp", "tbsp", "dozen", "pcs", "bunch", "jar", "jars", "loaf", "loaves"];

const CATEGORY_KEYWORDS = {
  Produce: ["apple", "apples", "banana", "bananas", "orange", "oranges", "lemon", "lemons", "lime", "limes",
    "tomato", "tomatoes", "potato", "potatoes", "onion", "onions", "garlic", "carrot", "carrots",
    "celery", "broccoli", "spinach", "lettuce", "kale", "cucumber", "zucchini", "pepper", "peppers",
    "mushroom", "mushrooms", "avocado", "avocados", "corn", "peas", "beans", "ginger", "herbs",
    "basil", "cilantro", "parsley", "mint", "thyme", "rosemary", "berry", "berries", "strawberry",
    "blueberry", "raspberry", "grape", "grapes", "mango", "pineapple", "watermelon", "melon",
    "cabbage", "cauliflower", "asparagus", "beetroot", "beet", "leek", "shallot", "scallion",
    "spring onion", "sweet potato", "yam", "squash", "pumpkin", "eggplant", "artichoke"],
  Dairy: ["milk", "cheese", "butter", "cream", "yogurt", "yoghurt", "egg", "eggs", "sour cream",
    "cream cheese", "cottage cheese", "mozzarella", "cheddar", "parmesan", "brie", "feta",
    "half and half", "heavy cream", "whipping cream", "ice cream", "kefir", "ghee"],
  Meat: ["chicken", "beef", "pork", "lamb", "turkey", "fish", "salmon", "tuna", "shrimp", "prawn",
    "prawns", "bacon", "sausage", "sausages", "steak", "mince", "ground beef", "ground turkey",
    "ham", "salami", "pepperoni", "duck", "veal", "brisket", "ribs", "wings", "thigh", "thighs",
    "breast", "fillet", "cod", "tilapia", "sardines", "anchovies", "crab", "lobster", "scallops",
    "meatballs", "deli meat", "chorizo", "prosciutto"],
  Beverages: ["juice", "soda", "water", "coffee", "tea", "wine", "beer", "kombucha", "sparkling",
    "lemonade", "almond milk", "oat milk", "soy milk", "broth", "stock", "coconut water",
    "energy drink", "smoothie", "cocktail", "spirits", "whiskey", "vodka", "gin", "rum"],
  Freezer: ["frozen", "ice cream", "gelato", "sorbet", "popsicle", "frozen peas", "frozen corn",
    "frozen berries", "frozen fish", "frozen chicken", "frozen pizza", "edamame"],
};

function detectCategory(name) {
  const lower = name.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return "Pantry";
}

function parseBulkText(text) {
  const unitPattern = new RegExp(`^(\\d+\\.?\\d*)\\s*(${UNITS.join("|")})\\.?\\s+(.+)$`, "i");
  const xPattern = /^(\d+\.?\d*)\s*x\s+(.+)$/i;   // "2x avocados" or "2 x avocados"
  const qtyPattern = /^(\d+\.?\d*)\s+(.+)$/;

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const unitMatch = line.match(unitPattern);
      if (unitMatch) {
        const name = unitMatch[3].trim();
        return { name, quantity: parseFloat(unitMatch[1]), unit: unitMatch[2].toLowerCase(), category: detectCategory(name), expiry_date: null, notes: null };
      }
      const xMatch = line.match(xPattern);
      if (xMatch) {
        const name = xMatch[2].trim();
        return { name, quantity: parseFloat(xMatch[1]), unit: "", category: detectCategory(name), expiry_date: null, notes: null };
      }
      const qtyMatch = line.match(qtyPattern);
      if (qtyMatch) {
        const name = qtyMatch[2].trim();
        return { name, quantity: parseFloat(qtyMatch[1]), unit: "", category: detectCategory(name), expiry_date: null, notes: null };
      }
      return { name: line, quantity: 0, unit: "", category: detectCategory(line), expiry_date: null, notes: null };
    });
}

const CATEGORIES = ["Produce", "Dairy", "Meat", "Pantry", "Freezer", "Beverages", "Other"];

const EMPTY_FORM = {
  name: "",
  quantity: "",
  unit: "",
  category: "Pantry",
  expiry_date: "",
  notes: "",
};

function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
}

function ExpiryBadge({ dateStr }) {
  const days = daysUntilExpiry(dateStr);
  if (days === null) return null;
  if (days < 0) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Expired</span>;
  if (days <= 3) return <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Expires in {days}d</span>;
  if (days <= 7) return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Expires in {days}d</span>;
  return <span className="text-xs text-gray-400">{dateStr}</span>;
}

export default function Pantry() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoMode, setPhotoMode] = useState(null); // "receipt" | "scan" | null
  const [produceMode, setProduceMode] = useState(false);
  const [photoParsing, setPhotoParsing] = useState(false);
  const [photoItems, setPhotoItems] = useState([]);
  const [photoError, setPhotoError] = useState(null);

  const load = () => {
    setLoading(true);
    getPantry()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = {
      ...form,
      quantity: parseFloat(form.quantity) || 0,
      expiry_date: form.expiry_date || null,
    };
    try {
      if (editingId) {
        await updatePantryItem(editingId, body);
      } else {
        await createPantryItem(body);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleEdit = (item) => {
    setForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      category: item.category,
      expiry_date: item.expiry_date || "",
      notes: item.notes || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this item?")) return;
    await deletePantryItem(id);
    load();
  };

  const handleClearAll = async () => {
    if (!confirm(`Clear all ${items.length} pantry items? This cannot be undone.`)) return;
    try {
      await clearAllPantryItems();
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const handleBulkParse = () => setBulkPreview(parseBulkText(bulkText));

  const handleBulkSave = async () => {
    if (!bulkPreview.length) return;
    setBulkSaving(true);
    try {
      await bulkCreatePantryItems(bulkPreview);
      setBulkText("");
      setBulkPreview([]);
      setShowBulk(false);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const updatePreviewItem = (i, field, val) => {
    const updated = [...bulkPreview];
    updated[i] = { ...updated[i], [field]: val };
    setBulkPreview(updated);
  };

  const removePreviewItem = (i) => setBulkPreview(bulkPreview.filter((_, idx) => idx !== i));

  const handlePhotoFile = async (file) => {
    if (!file || !photoMode) return;
    setPhotoParsing(true);
    setPhotoError(null);
    setPhotoItems([]);
    try {
      const fn = photoMode === "receipt" ? parseReceipt : scanPantryPhoto;
      const res = await fn(file);
      const parsed = res.items || [];
      setPhotoItems(produceMode ? parsed.map((it) => ({ ...it, category: "Produce" })) : parsed);
    } catch (e) {
      setPhotoError(e.message);
    } finally {
      setPhotoParsing(false);
    }
  };

  const updatePhotoItem = (i, field, val) => {
    const next = [...photoItems];
    next[i] = { ...next[i], [field]: val };
    setPhotoItems(next);
  };

  const removePhotoItem = (i) => setPhotoItems(photoItems.filter((_, idx) => idx !== i));

  const handlePhotoSave = async () => {
    if (!photoItems.length) return;
    const payload = photoItems.map((it) => ({
      name: it.name,
      quantity: parseFloat(it.quantity) || 1,
      unit: it.unit || "",
      category: it.category || "Other",
      expiry_date: null,
      notes: null,
    }));
    try {
      await bulkCreatePantryItems(payload);
      setPhotoOpen(false);
      setPhotoMode(null);
      setPhotoItems([]);
      load();
    } catch (e) {
      setPhotoError(e.message);
    }
  };

  const closePhoto = () => {
    setPhotoOpen(false);
    setPhotoMode(null);
    setProduceMode(false);
    setPhotoItems([]);
    setPhotoError(null);
  };

  const filtered = items.filter((item) => {
    const matchCat = filterCategory === "All" || item.category === filterCategory;
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Group by category
  const grouped = {};
  for (const item of filtered) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-stone-800 dark:text-stone-100">Pantry</h1>
        <div className="flex gap-2 flex-wrap">
          {items.length > 0 && (
            <button
              onClick={handleClearAll}
              className="border border-red-300 text-red-500 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              Clear All
            </button>
          )}
          <button
            onClick={() => { setPhotoOpen(true); setPhotoMode("scan"); setProduceMode(true); setPhotoItems([]); setPhotoError(null); setShowForm(false); setShowBulk(false); }}
            className="border border-violet-400 text-violet-700 dark:text-violet-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-violet-50 dark:hover:bg-violet-950/30"
          >
            🥦 Weekly Box
          </button>
          <button
            onClick={() => { setPhotoOpen(true); setPhotoMode(null); setProduceMode(false); setPhotoItems([]); setPhotoError(null); setShowForm(false); setShowBulk(false); }}
            className="border border-emerald-600 text-emerald-700 dark:text-emerald-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          >
            📷 Photo
          </button>
          <button
            onClick={() => { setShowBulk(!showBulk); setShowForm(false); setBulkPreview([]); setBulkText(""); }}
            className="border border-green-600 text-green-700 dark:text-green-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-50 dark:hover:bg-green-950/30"
          >
            Bulk Add
          </button>
          <button
            onClick={() => { setShowForm(true); setShowBulk(false); setEditingId(null); setForm(EMPTY_FORM); }}
            className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
          >
            + Add Item
          </button>
        </div>
      </div>

      {photoOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closePhoto}>
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-700">
              <div>
                <h3 className="font-semibold text-stone-800 dark:text-stone-100">
                  {produceMode ? "Weekly Produce Box" : photoMode === "receipt" ? "Upload Receipt" : photoMode === "scan" ? "Scan Pantry / Fridge" : "Add via Photo"}
                </h3>
                {produceMode && <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">All items added as Produce</p>}
              </div>
              <button onClick={closePhoto} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-2xl leading-none">×</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {!photoMode && (
                <>
                  <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">What kind of photo are you uploading?</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => setPhotoMode("scan")}
                      className="w-full text-left p-4 rounded-xl border border-stone-200 dark:border-stone-700 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                    >
                      <p className="font-semibold text-stone-800 dark:text-stone-100">📸 Pantry / Fridge photo</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Snap your shelf, fridge, or freezer. AI lists what it sees.</p>
                    </button>
                    <button
                      onClick={() => setPhotoMode("receipt")}
                      className="w-full text-left p-4 rounded-xl border border-stone-200 dark:border-stone-700 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                    >
                      <p className="font-semibold text-stone-800 dark:text-stone-100">🧾 Grocery receipt</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Snap your receipt to log what you bought.</p>
                    </button>
                  </div>
                </>
              )}
              {photoMode && !photoItems.length && !photoParsing && (
                <>
                  <p className="text-sm text-stone-500 dark:text-stone-400 mb-3">
                    {produceMode
                      ? "Upload a photo or screenshot of your Odd Bunch box — AI will identify the produce and add it all under the Produce category."
                      : photoMode === "receipt"
                      ? "Snap a photo of your receipt — we'll extract the line items."
                      : "Point your camera at your pantry, fridge, or freezer. Items get easier to identify when packaging labels face the camera."}
                  </p>
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handlePhotoFile(e.target.files?.[0])}
                      className="block w-full text-sm text-stone-600 dark:text-stone-300 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border file:border-emerald-300 file:bg-emerald-50 file:text-emerald-700 file:font-medium hover:file:bg-emerald-100"
                    />
                  </label>
                  <button onClick={() => setPhotoMode(null)} className="text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 mt-3">← Change type</button>
                  {photoError && <p className="text-red-500 text-sm mt-3">{photoError}</p>}
                </>
              )}
              {photoParsing && (
                <p className="text-stone-500 dark:text-stone-400 text-sm">
                  {photoMode === "receipt" ? "Parsing receipt" : "Identifying items"} with AI…
                </p>
              )}
              {!photoParsing && photoItems.length > 0 && (
                <>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mb-2 uppercase tracking-wider font-semibold">Review ({photoItems.length} items)</p>
                  <div className="space-y-1.5">
                    {photoItems.map((it, i) => (
                      <div key={i} className="flex gap-1.5 items-center">
                        <input
                          value={it.name}
                          onChange={(e) => updatePhotoItem(i, "name", e.target.value)}
                          className="flex-1 border border-stone-200 dark:border-stone-600 rounded px-2 py-1 text-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                        />
                        <input
                          value={it.quantity}
                          onChange={(e) => updatePhotoItem(i, "quantity", e.target.value)}
                          className="w-14 border border-stone-200 dark:border-stone-600 rounded px-2 py-1 text-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                        />
                        <input
                          value={it.unit}
                          onChange={(e) => updatePhotoItem(i, "unit", e.target.value)}
                          placeholder="unit"
                          className="w-16 border border-stone-200 dark:border-stone-600 rounded px-2 py-1 text-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
                        />
                        <select
                          value={it.category}
                          onChange={(e) => updatePhotoItem(i, "category", e.target.value)}
                          className="border border-stone-200 dark:border-stone-600 rounded px-1 py-1 text-xs bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                        >
                          {["Produce","Dairy","Meat","Pantry","Freezer","Beverages","Other"].map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <button onClick={() => removePhotoItem(i)} className="text-red-400 hover:text-red-600 text-sm px-1">×</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            {photoItems.length > 0 && (
              <div className="border-t border-stone-200 dark:border-stone-700 px-4 py-3 flex justify-end gap-2">
                <button onClick={() => setPhotoItems([])} className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 px-3 py-2">Start over</button>
                <button onClick={handlePhotoSave} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">
                  Add {photoItems.length} items
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Add Panel */}
      {showBulk && (
        <div className="bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-5 mb-5 shadow-sm">
          <h2 className="font-semibold text-stone-800 dark:text-stone-100 mb-1">Bulk Add Items</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
            One item per line. Supports formats like:<br />
            <span className="font-mono">chicken breast</span> &nbsp;·&nbsp;
            <span className="font-mono">2 lbs ground beef</span> &nbsp;·&nbsp;
            <span className="font-mono">3 cans tomatoes</span> &nbsp;·&nbsp;
            <span className="font-mono">4 chicken thighs</span>
          </p>
          <textarea
            rows={8}
            value={bulkText}
            onChange={(e) => { setBulkText(e.target.value); setBulkPreview([]); }}
            placeholder={"olive oil\n2 lbs chicken breast\n3 cans diced tomatoes\nmilk\n1 dozen eggs\n500g pasta"}
            className="w-full border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-sm font-mono mb-3 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500"
          />
          <div className="flex gap-2 mb-4">
            <button
              onClick={handleBulkParse}
              disabled={!bulkText.trim()}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Preview ({bulkText.trim().split("\n").filter(Boolean).length} items)
            </button>
            <button
              onClick={() => { setShowBulk(false); setBulkText(""); setBulkPreview([]); }}
              className="border border-stone-300 dark:border-stone-600 px-4 py-2 rounded-lg text-sm text-stone-600 dark:text-stone-300 bg-white dark:bg-stone-700 hover:bg-stone-50 dark:hover:bg-stone-600"
            >
              Cancel
            </button>
          </div>

          {bulkPreview.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">Preview — edit before saving</h3>
              <div className="space-y-2 mb-4">
                {bulkPreview.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-600 rounded-lg px-3 py-2">
                    <input
                      value={item.name}
                      onChange={(e) => updatePreviewItem(i, "name", e.target.value)}
                      className="border border-stone-300 dark:border-stone-600 rounded px-2 py-1 text-sm flex-1 min-w-0 bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100"
                      placeholder="Name"
                    />
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => updatePreviewItem(i, "quantity", parseFloat(e.target.value) || 0)}
                      className="border border-stone-300 dark:border-stone-600 rounded px-2 py-1 text-sm w-16 bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100"
                      placeholder="Qty"
                    />
                    <input
                      value={item.unit}
                      onChange={(e) => updatePreviewItem(i, "unit", e.target.value)}
                      className="border border-stone-300 dark:border-stone-600 rounded px-2 py-1 text-sm w-16 bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100"
                      placeholder="Unit"
                    />
                    <select
                      value={item.category}
                      onChange={(e) => updatePreviewItem(i, "category", e.target.value)}
                      className="border border-stone-300 dark:border-stone-600 rounded px-2 py-1 text-sm bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100"
                    >
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <button onClick={() => removePreviewItem(i)} className="text-red-400 hover:text-red-600 shrink-0">×</button>
                  </div>
                ))}
              </div>
              <button
                onClick={handleBulkSave}
                disabled={bulkSaving || !bulkPreview.length}
                className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {bulkSaving ? "Saving..." : `Save ${bulkPreview.length} items`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 text-sm w-48 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
        />
        <div className="flex gap-1 flex-wrap">
          {["All", ...CATEGORIES].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterCategory === cat
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-300 dark:border-stone-600 hover:border-green-400"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-white dark:bg-stone-900 border border-gray-200 dark:border-stone-700 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-gray-700 dark:text-stone-200 mb-4">{editingId ? "Edit Item" : "Add Item"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-500 dark:text-stone-400 block mb-1">Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 text-sm w-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
                placeholder="e.g. Chicken breast"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-stone-400 block mb-1">Quantity</label>
              <input
                type="number"
                step="0.1"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 text-sm w-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
                placeholder="2"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-stone-400 block mb-1">Unit</label>
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 text-sm w-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
                placeholder="lbs, cups, cans..."
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-stone-400 block mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 text-sm w-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-stone-400 block mb-1">Expiry Date</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                className="border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 text-sm w-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-500 dark:text-stone-400 block mb-1">Notes</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 text-sm w-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
                placeholder="Optional"
              />
            </div>
            <div className="col-span-2 sm:col-span-3 flex gap-2 mt-1">
              <button
                type="submit"
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
              >
                {editingId ? "Save Changes" : "Add to Pantry"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="border border-stone-300 dark:border-stone-600 px-4 py-2 rounded-lg text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-stone-400 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <p className="text-lg">Your pantry is empty.</p>
          <p className="text-sm mt-1">Add items to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, catItems]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">{category}</h3>
              <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 divide-y divide-stone-100 dark:divide-stone-800 shadow-sm">
                {catItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-stone-800 dark:text-stone-100">{item.name}</span>
                      {item.quantity > 0 && (
                        <span className="text-stone-500 dark:text-stone-400 text-sm ml-2">
                          {item.quantity} {item.unit}
                        </span>
                      )}
                    </div>
                    <ExpiryBadge dateStr={item.expiry_date} />
                    {item.notes && <span className="text-xs text-stone-400 hidden sm:block truncate max-w-xs">{item.notes}</span>}
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-xs text-green-600 dark:text-green-400 hover:underline ml-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { getPantry, createPantryItem, updatePantryItem, deletePantryItem } from "../api";

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
  const [filterCategory, setFilterCategory] = useState("All");
  const [search, setSearch] = useState("");

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

  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Pantry Inventory</h1>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
        >
          + Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm w-48"
        />
        <div className="flex gap-1 flex-wrap">
          {["All", ...CATEGORIES].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterCategory === cat
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-green-400"
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
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-4">{editingId ? "Edit Item" : "Add Item"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-500 block mb-1">Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="border rounded-lg px-3 py-1.5 text-sm w-full"
                placeholder="e.g. Chicken breast"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Quantity</label>
              <input
                type="number"
                step="0.1"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="border rounded-lg px-3 py-1.5 text-sm w-full"
                placeholder="2"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Unit</label>
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="border rounded-lg px-3 py-1.5 text-sm w-full"
                placeholder="lbs, cups, cans..."
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="border rounded-lg px-3 py-1.5 text-sm w-full"
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Expiry Date</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                className="border rounded-lg px-3 py-1.5 text-sm w-full"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-500 block mb-1">Notes</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="border rounded-lg px-3 py-1.5 text-sm w-full"
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
                className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Your pantry is empty.</p>
          <p className="text-sm mt-1">Add items to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, catItems]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{category}</h3>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm">
                {catItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800">{item.name}</span>
                      {item.quantity > 0 && (
                        <span className="text-gray-500 text-sm ml-2">
                          {item.quantity} {item.unit}
                        </span>
                      )}
                    </div>
                    <ExpiryBadge dateStr={item.expiry_date} />
                    {item.notes && <span className="text-xs text-gray-400 hidden sm:block truncate max-w-xs">{item.notes}</span>}
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-xs text-green-600 hover:underline ml-2"
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

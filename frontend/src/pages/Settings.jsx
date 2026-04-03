import { useState, useEffect } from "react";
import { updateSettings, getCategoryDefinitions, createCategoryDefinition, updateCategoryDefinition, deleteCategoryDefinition, mergeCategories } from "../api";
import { useSettings } from "../contexts/SettingsContext";

const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";
const GROUPS = ["Committed", "Needs", "Wants", "Other"];

const GROUP_COLORS = {
  Committed: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  Needs: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  Wants: "text-zinc-300 bg-zinc-700/50 border-zinc-600",
  Other: "text-zinc-500 bg-zinc-800 border-zinc-700",
};

function GroupBadge({ group }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${GROUP_COLORS[group] || GROUP_COLORS.Other}`}>
      {group}
    </span>
  );
}

export default function Settings() {
  const { settings, refresh } = useSettings();
  const [form, setForm] = useState({ household_name: "", person_1: "", person_2: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [categories, setCategories] = useState([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState("");

  // Tab: "All" | "Committed" | "Needs" | "Wants" | "Other" | "Hidden"
  const [activeTab, setActiveTab] = useState("All");

  // Add category
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState({ name: "", group: "Wants", parent_name: "" });

  // Inline edit
  const [editingCat, setEditingCat] = useState(null);

  // Merge panel
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeSources, setMergeSources] = useState([]);
  const [mergeResult, setMergeResult] = useState("");
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    setForm({
      household_name: settings.household_name || "",
      person_1: settings.person_1 || "",
      person_2: settings.person_2 || "",
    });
  }, [settings]);

  const loadCategories = () => {
    setCatLoading(true);
    getCategoryDefinitions().then(setCategories).finally(() => setCatLoading(false));
  };
  useEffect(() => { loadCategories(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setSaved(false);
    await updateSettings(form);
    await refresh();
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddCat = async (e) => {
    e.preventDefault();
    setCatError("");
    if (!newCat.name.trim()) return;
    try {
      await createCategoryDefinition({ name: newCat.name.trim(), group: newCat.group, parent_name: newCat.parent_name || null });
      setNewCat({ name: "", group: "Wants", parent_name: "" });
      setShowAdd(false);
      loadCategories(); refresh();
    } catch (err) { setCatError(err.message); }
  };

  const handleSaveCat = async (id) => {
    setCatError("");
    try {
      await updateCategoryDefinition(id, { name: editingCat.name, group: editingCat.group, parent_name: editingCat.parent_name || null });
      setEditingCat(null);
      loadCategories(); refresh();
    } catch (err) { setCatError(err.message); }
  };

  const handleToggleHide = async (cat) => {
    try {
      await updateCategoryDefinition(cat.id, { is_hidden: !cat.is_hidden });
      loadCategories();
    } catch (err) { setCatError(err.message); }
  };

  const handleDeleteCat = async (id, name) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteCategoryDefinition(id);
      loadCategories(); refresh();
    } catch (err) { setCatError(err.message); }
  };

  const handleMerge = async () => {
    if (!mergeTarget || mergeSources.length === 0) return;
    if (!confirm(`Move all transactions from [${mergeSources.join(", ")}] into "${mergeTarget}" and hide those categories?`)) return;
    setMerging(true); setMergeResult("");
    try {
      const res = await mergeCategories(mergeSources, mergeTarget);
      setMergeResult(`Done — ${res.merged_transactions} transaction(s) moved into ${mergeTarget}.`);
      setMergeSources([]); setMergeTarget("");
      loadCategories(); refresh();
    } catch (err) { setCatError(err.message); }
    finally { setMerging(false); }
  };

  const canonical = categories.filter((c) => !c.is_legacy);
  const hidden = canonical.filter((c) => c.is_hidden);
  const parentOptions = canonical.filter((c) => !c.parent_name && !c.is_hidden);

  const tabRows = (() => {
    if (activeTab === "Hidden") return hidden;
    if (activeTab === "All") return canonical.filter((c) => !c.is_hidden);
    return canonical.filter((c) => c.group === activeTab && !c.is_hidden);
  })();

  const tabs = ["All", ...GROUPS, ...(hidden.length ? ["Hidden"] : [])];

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>

      {/* Household */}
      <form onSubmit={handleSave} className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300">Household</h2>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Name</label>
          <input className={`${inputCls} w-full`} value={form.household_name}
            onChange={(e) => setForm({ ...form, household_name: e.target.value })}
            placeholder="BudgetBot" />
          <p className="text-xs text-zinc-600 mt-1">Shown in the top-left nav.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Person 1</label>
            <input className={`${inputCls} w-full`} value={form.person_1}
              onChange={(e) => setForm({ ...form, person_1: e.target.value })} placeholder="Person 1" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Person 2</label>
            <input className={`${inputCls} w-full`} value={form.person_2}
              onChange={(e) => setForm({ ...form, person_2: e.target.value })} placeholder="Person 2" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="bg-yellow-400 text-black px-5 py-2 rounded text-sm font-medium hover:bg-yellow-300 disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-green-400 text-sm">Saved!</span>}
        </div>
      </form>

      {/* Categories */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-300">Categories</h2>
          <div className="flex gap-2">
            <button onClick={() => { setShowMerge((v) => !v); setShowAdd(false); }}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${showMerge ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}>
              Merge
            </button>
            <button onClick={() => { setShowAdd((v) => !v); setShowMerge(false); }}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${showAdd ? "bg-yellow-400 text-black border-yellow-400" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}>
              + Add
            </button>
          </div>
        </div>

        {catError && (
          <div className="mx-5 mt-3 bg-red-900/20 border border-red-700/50 rounded p-3 text-sm text-red-400">{catError}</div>
        )}

        {/* Add form */}
        {showAdd && (
          <form onSubmit={handleAddCat} className="px-5 py-4 border-b border-zinc-700 bg-zinc-800/40 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-32">
              <label className="text-xs text-zinc-500 block mb-1">Name</label>
              <input className={`${inputCls} w-full`} value={newCat.name}
                onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="e.g. Streaming" autoFocus />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Group</label>
              <select className={inputCls} value={newCat.group} onChange={(e) => setNewCat({ ...newCat, group: e.target.value })}>
                {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Sub-category of</label>
              <select className={inputCls} value={newCat.parent_name} onChange={(e) => setNewCat({ ...newCat, parent_name: e.target.value })}>
                <option value="">— none —</option>
                {parentOptions.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <button type="submit" className="bg-yellow-400 text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-yellow-300">Add</button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-zinc-500 hover:text-zinc-300 px-2">Cancel</button>
          </form>
        )}

        {/* Merge panel */}
        {showMerge && (
          <div className="px-5 py-4 border-b border-zinc-700 bg-zinc-800/40 space-y-3">
            <p className="text-xs text-zinc-400">Reassign all transactions from selected categories into a target, then hide the sources.</p>
            <div className="flex flex-wrap gap-3 items-center">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Merge into</label>
                <select className={inputCls} value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                  <option value="">— select target —</option>
                  {canonical.filter((c) => !c.is_hidden).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <button onClick={handleMerge} disabled={merging || !mergeTarget || mergeSources.length === 0}
                className="mt-4 bg-yellow-400 text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed">
                {merging ? "Merging…" : `Merge${mergeSources.length ? ` (${mergeSources.length})` : ""}`}
              </button>
            </div>
            {mergeTarget && (
              <div>
                <p className="text-xs text-zinc-500 mb-2">Select categories to merge into <strong className="text-zinc-300">{mergeTarget}</strong>:</p>
                <div className="flex flex-wrap gap-2">
                  {canonical.filter((c) => c.name !== mergeTarget).map((c) => (
                    <button key={c.id} onClick={() => setMergeSources((p) => p.includes(c.name) ? p.filter((n) => n !== c.name) : [...p, c.name])}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${mergeSources.includes(c.name) ? "bg-yellow-400 text-black border-yellow-400" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mergeResult && <p className="text-sm text-green-400">{mergeResult}</p>}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 border-b border-zinc-700 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-yellow-400 text-yellow-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}>
              {tab}
              {tab === "Hidden" && <span className="ml-1 text-zinc-600">({hidden.length})</span>}
            </button>
          ))}
        </div>

        {/* Category rows */}
        {catLoading ? (
          <p className="text-sm text-zinc-500 px-5 py-6">Loading…</p>
        ) : tabRows.length === 0 ? (
          <p className="text-sm text-zinc-600 px-5 py-6">No categories in this group.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {tabRows.map((cat) => (
              <div key={cat.id} className={`px-5 ${activeTab === "Hidden" ? "opacity-50" : ""}`}>
                {editingCat?.id === cat.id ? (
                  <div className="flex flex-wrap gap-2 items-center py-2.5">
                    <input className={`${inputCls} flex-1 min-w-28`} value={editingCat.name}
                      onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })} />
                    <select className={inputCls} value={editingCat.group}
                      onChange={(e) => setEditingCat({ ...editingCat, group: e.target.value })}>
                      {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select className={inputCls} value={editingCat.parent_name || ""}
                      onChange={(e) => setEditingCat({ ...editingCat, parent_name: e.target.value })}>
                      <option value="">— no parent —</option>
                      {parentOptions.filter((p) => p.id !== cat.id).map((c) =>
                        <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <button onClick={() => handleSaveCat(cat.id)} className="text-sm bg-yellow-400 text-black px-3 py-1 rounded font-medium hover:bg-yellow-300">Save</button>
                    <button onClick={() => setEditingCat(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-2.5">
                    {cat.parent_name && <span className="text-zinc-700 text-xs">└</span>}
                    <span className="flex-1 text-sm text-zinc-200">
                      {cat.name}
                      {cat.parent_name && <span className="text-xs text-zinc-600 ml-1.5">↳ {cat.parent_name}</span>}
                    </span>
                    {activeTab === "All" && <GroupBadge group={cat.group} />}
                    <div className="flex gap-3 shrink-0">
                      <button onClick={() => setEditingCat({ id: cat.id, name: cat.name, group: cat.group, parent_name: cat.parent_name || "" })}
                        className="text-xs text-zinc-500 hover:text-zinc-200">Edit</button>
                      <button onClick={() => handleToggleHide(cat)}
                        className="text-xs text-zinc-600 hover:text-zinc-400">
                        {cat.is_hidden ? "Show" : "Hide"}
                      </button>
                      <button onClick={() => handleDeleteCat(cat.id, cat.name)}
                        className="text-xs text-red-700 hover:text-red-400">Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Legacy */}
        {categories.filter((c) => c.is_legacy).length > 0 && (
          <details className="border-t border-zinc-800">
            <summary className="px-5 py-3 text-xs text-zinc-700 cursor-pointer hover:text-zinc-500">
              {categories.filter((c) => c.is_legacy).length} legacy categories (old import aliases)
            </summary>
            <div className="divide-y divide-zinc-800/50">
              {categories.filter((c) => c.is_legacy).map((cat) => (
                <div key={cat.id} className="flex items-center gap-3 px-5 py-2">
                  <span className="flex-1 text-xs text-zinc-600">{cat.name}</span>
                  <GroupBadge group={cat.group} />
                  <button onClick={() => handleToggleHide(cat)} className="text-xs text-zinc-700 hover:text-zinc-500">
                    {cat.is_hidden ? "Show" : "Hide"}
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { updateSettings, getCategoryDefinitions, createCategoryDefinition, updateCategoryDefinition, deleteCategoryDefinition, mergeCategories } from "../api";
import { useSettings } from "../contexts/SettingsContext";

const inputCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

export default function Settings() {
  const { settings, refresh } = useSettings();
  const [form, setForm] = useState({ household_name: "", person_1: "", person_2: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [categories, setCategories] = useState([]);
  const [catLoading, setCatLoading] = useState(true);
  const [newCat, setNewCat] = useState({ name: "", group: "Wants", parent_name: "" });
  const [editingCat, setEditingCat] = useState(null);
  const [catError, setCatError] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    setForm({
      household_name: settings.household_name || "",
      person_1: settings.person_1 || "",
      person_2: settings.person_2 || "",
    });
  }, [settings]);

  const loadCategories = () => {
    setCatLoading(true);
    getCategoryDefinitions()
      .then(setCategories)
      .finally(() => setCatLoading(false));
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
      await createCategoryDefinition({
        name: newCat.name.trim(),
        group: newCat.group,
        parent_name: newCat.parent_name || null,
      });
      setNewCat({ name: "", group: "Wants", parent_name: "" });
      loadCategories();
      refresh();
    } catch (err) {
      setCatError(err.message);
    }
  };

  const handleSaveCat = async (id) => {
    setCatError("");
    try {
      await updateCategoryDefinition(id, {
        name: editingCat.name,
        group: editingCat.group,
        parent_name: editingCat.parent_name || null,
      });
      setEditingCat(null);
      loadCategories();
      refresh();
    } catch (err) {
      setCatError(err.message);
    }
  };

  const handleToggleHide = async (cat) => {
    setCatError("");
    try {
      await updateCategoryDefinition(cat.id, { is_hidden: !cat.is_hidden });
      loadCategories();
    } catch (err) {
      setCatError(err.message);
    }
  };

  const handleDeleteCat = async (id, name) => {
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;
    setCatError("");
    try {
      await deleteCategoryDefinition(id);
      loadCategories();
      refresh();
    } catch (err) {
      setCatError(err.message);
    }
  };

  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeSources, setMergeSources] = useState([]);
  const [mergeResult, setMergeResult] = useState(null);
  const [merging, setMerging] = useState(false);

  const handleMerge = async () => {
    if (!mergeTarget || mergeSources.length === 0) return;
    if (!confirm(`Move all transactions from ${mergeSources.join(", ")} into "${mergeTarget}" and hide those categories?`)) return;
    setMerging(true); setMergeResult(null);
    try {
      const res = await mergeCategories(mergeSources, mergeTarget);
      setMergeResult(`Merged ${res.merged_transactions} transaction(s) into ${mergeTarget}.`);
      setMergeSources([]);
      loadCategories(); refresh();
    } catch (err) { setCatError(err.message); }
    finally { setMerging(false); }
  };

  const toggleMergeSource = (name) =>
    setMergeSources((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  const canonical = categories.filter((c) => !c.is_legacy);
  const legacy = categories.filter((c) => c.is_legacy);
  const visibleCanonical = showHidden ? canonical : canonical.filter((c) => !c.is_hidden);
  const hiddenCount = canonical.filter((c) => c.is_hidden).length;

  // Only top-level (non-child) canonical categories can be parents
  const parentOptions = canonical.filter((c) => !c.parent_name && !c.is_hidden);

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>

      {/* Household & People */}
      <form onSubmit={handleSave} className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Household</h2>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Household Name</label>
          <input className={`${inputCls} w-full`} value={form.household_name}
            onChange={(e) => setForm({ ...form, household_name: e.target.value })}
            placeholder="BudgetBot" />
          <p className="text-xs text-zinc-600 mt-1">Shown in the top-left of the nav bar.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Person 1 Name</label>
            <input className={`${inputCls} w-full`} value={form.person_1}
              onChange={(e) => setForm({ ...form, person_1: e.target.value })}
              placeholder="Person 1" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Person 2 Name</label>
            <input className={`${inputCls} w-full`} value={form.person_2}
              onChange={(e) => setForm({ ...form, person_2: e.target.value })}
              placeholder="Person 2" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving}
            className="bg-yellow-400 text-black px-5 py-2 rounded text-sm font-medium hover:bg-yellow-300 disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-green-400 text-sm">Saved!</span>}
        </div>
      </form>

      {/* Categories */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Categories</h2>
          {hiddenCount > 0 && (
            <button onClick={() => setShowHidden((v) => !v)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              {showHidden ? "Hide hidden" : `Show ${hiddenCount} hidden`}
            </button>
          )}
        </div>

        {catError && (
          <div className="bg-red-900/20 border border-red-700/50 rounded p-3 text-sm text-red-400">{catError}</div>
        )}

        {/* Add new */}
        <form onSubmit={handleAddCat} className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-36">
            <label className="text-xs text-zinc-500 block mb-1">New Category</label>
            <input className={`${inputCls} w-full`} value={newCat.name}
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
              placeholder="e.g. Claude AI" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Group</label>
            <select className={inputCls} value={newCat.group}
              onChange={(e) => setNewCat({ ...newCat, group: e.target.value })}>
              <option value="Needs">Needs</option>
              <option value="Wants">Wants</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Sub-category of</label>
            <select className={inputCls} value={newCat.parent_name}
              onChange={(e) => setNewCat({ ...newCat, parent_name: e.target.value })}>
              <option value="">— none —</option>
              {parentOptions.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <button type="submit" className="bg-yellow-400 text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-yellow-300">
            Add
          </button>
        </form>

        {/* Category table */}
        {catLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            {[["Needs", visibleCanonical.filter(c => c.group === "Needs")],
              ["Wants", visibleCanonical.filter(c => c.group === "Wants")],
              ["Other", visibleCanonical.filter(c => c.group === "Other")]].map(([group, rows]) =>
              rows.length === 0 ? null : (
                <div key={group}>
                  <p className="text-xs font-bold text-yellow-400 uppercase tracking-widest mb-2">{group}</p>
                  <div className="space-y-1">
                    {rows.map((cat) => (
                      <div key={cat.id}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-800 ${cat.is_hidden ? "opacity-40" : ""}`}>
                        {/* indent sub-categories */}
                        {cat.parent_name && <span className="text-zinc-700 text-xs ml-3">└</span>}
                        {editingCat?.id === cat.id ? (
                          <>
                            <input className={`${inputCls} flex-1`}
                              value={editingCat.name}
                              onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })} />
                            <select className={inputCls} value={editingCat.group}
                              onChange={(e) => setEditingCat({ ...editingCat, group: e.target.value })}>
                              <option value="Needs">Needs</option>
                              <option value="Wants">Wants</option>
                              <option value="Other">Other</option>
                            </select>
                            <select className={inputCls} value={editingCat.parent_name || ""}
                              onChange={(e) => setEditingCat({ ...editingCat, parent_name: e.target.value })}>
                              <option value="">— none —</option>
                              {parentOptions.filter(p => p.id !== cat.id).map((c) =>
                                <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                            <button onClick={() => handleSaveCat(cat.id)} className="text-yellow-400 text-xs hover:text-yellow-300 shrink-0">Save</button>
                            <button onClick={() => setEditingCat(null)} className="text-zinc-500 text-xs hover:text-zinc-300 shrink-0">Cancel</button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-zinc-200">
                              {cat.name}
                              {cat.parent_name && <span className="text-xs text-zinc-600 ml-1.5">({cat.parent_name})</span>}
                            </span>
                            <button
                              onClick={() => handleToggleHide(cat)}
                              className={`text-xs shrink-0 ${cat.is_hidden ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-600 hover:text-zinc-400"}`}
                              title={cat.is_hidden ? "Show in budget" : "Hide from budget"}>
                              {cat.is_hidden ? "Show" : "Hide"}
                            </button>
                            <button onClick={() => setEditingCat({ id: cat.id, name: cat.name, group: cat.group, parent_name: cat.parent_name || "" })}
                              className="text-xs text-zinc-500 hover:text-zinc-300 shrink-0">Edit</button>
                            <button onClick={() => handleDeleteCat(cat.id, cat.name)}
                              className="text-xs text-red-500 hover:text-red-400 shrink-0">Delete</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
            {legacy.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400">
                  {legacy.length} legacy / backward-compat categories
                </summary>
                <div className="mt-2 space-y-1 pl-2 border-l border-zinc-800">
                  {legacy.map((cat) => (
                    <div key={cat.id} className="flex items-center gap-3 py-1">
                      <span className="flex-1 text-xs text-zinc-600">{cat.name}</span>
                      <span className="text-xs text-zinc-700">{cat.group}</span>
                      <button
                        onClick={() => handleToggleHide(cat)}
                        className={`text-xs shrink-0 ${cat.is_hidden ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-700 hover:text-zinc-500"}`}>
                        {cat.is_hidden ? "Show" : "Hide"}
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
      {/* Merge categories */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Merge Categories</h2>
          <p className="text-xs text-zinc-500 mt-1">Reassign all transactions from selected categories into a target, then hide the sources.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Merge into</label>
            <select className={inputCls} value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
              <option value="">— select target —</option>
              {canonical.filter((c) => !c.is_hidden).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <button
            onClick={handleMerge}
            disabled={merging || !mergeTarget || mergeSources.length === 0}
            className="bg-yellow-400 text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {merging ? "Merging…" : `Merge ${mergeSources.length > 0 ? `(${mergeSources.length})` : ""}`}
          </button>
        </div>
        {mergeTarget && (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 mb-2">Select categories to merge into <strong className="text-zinc-300">{mergeTarget}</strong>:</p>
            <div className="flex flex-wrap gap-2">
              {canonical.filter((c) => c.name !== mergeTarget).map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleMergeSource(c.name)}
                  className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                    mergeSources.includes(c.name)
                      ? "bg-yellow-400 text-black border-yellow-400"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {mergeResult && <p className="text-sm text-green-400">{mergeResult}</p>}
      </div>
    </div>
  );
}

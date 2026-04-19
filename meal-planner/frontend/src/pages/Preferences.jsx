import { useState, useEffect } from "react";
import { getPreferences, updatePreferences } from "../api";

const EMPTY = {
  servings: 4,
  dietary_restrictions: "",
  cuisine_preferences: "",
  avoid: "",
  notes: "",
};

export default function Preferences() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getPreferences()
      .then((p) => setForm({
        servings: p.servings ?? 4,
        dietary_restrictions: p.dietary_restrictions ?? "",
        cuisine_preferences: p.cuisine_preferences ?? "",
        avoid: p.avoid ?? "",
        notes: p.notes ?? "",
      }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updatePreferences({ ...form, servings: parseInt(form.servings) || 4 });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, opts = {}) => (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      {opts.hint && <p className="text-xs text-gray-400 mb-1">{opts.hint}</p>}
      {opts.textarea ? (
        <textarea
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          rows={3}
          className="border rounded-lg px-3 py-2 text-sm w-full"
          placeholder={opts.placeholder}
        />
      ) : (
        <input
          type={opts.type || "text"}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="border rounded-lg px-3 py-2 text-sm w-full"
          placeholder={opts.placeholder}
          min={opts.min}
          max={opts.max}
        />
      )}
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Household Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">
          These preferences are used automatically when generating meal plans with AI.
        </p>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">

          {field("Household size (people)", "servings", {
            type: "number",
            min: 1,
            max: 20,
            hint: "Used to size recipes and portions in meal plans.",
            placeholder: "4",
          })}

          {field("Dietary restrictions", "dietary_restrictions", {
            textarea: true,
            hint: "Any allergies, intolerances, or dietary rules.",
            placeholder: "e.g. Nicole is lactose intolerant, Matt is allergic to tree nuts",
          })}

          {field("Cuisine preferences", "cuisine_preferences", {
            textarea: true,
            hint: "Cuisines or styles you enjoy — AI will lean toward these.",
            placeholder: "e.g. Mexican, Italian, Asian, comfort food",
          })}

          {field("Avoid", "avoid", {
            textarea: true,
            hint: "Ingredients, meals, or styles you want to avoid.",
            placeholder: "e.g. seafood, lamb, spicy food",
          })}

          {field("Other notes", "notes", {
            textarea: true,
            hint: "Anything else — budget, time constraints, cooking skill, etc.",
            placeholder: "e.g. prefer quick weeknight dinners (under 45 min), batch cook on Sundays",
          })}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Preferences"}
            </button>
            {saved && (
              <span className="text-sm text-green-600 font-medium">Saved!</span>
            )}
          </div>
        </form>
      )}

      <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
        <p className="font-medium mb-1">How AI uses these preferences</p>
        <ul className="space-y-1 text-green-700 list-disc list-inside">
          <li>Dietary restrictions and avoid lists are always respected</li>
          <li>Cuisine preferences guide the variety of meals suggested</li>
          <li>Favourite recipes (starred in Recipes) are scheduled 3–5 times per week</li>
          <li>Household size is used to size portions in generated recipes</li>
        </ul>
      </div>
    </div>
  );
}

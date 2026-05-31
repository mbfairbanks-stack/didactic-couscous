import { useState } from "react";
import { bulkCreatePantryItems, updatePreferences } from "../api";

// ── Pantry steps ─────────────────────────────────────────────────────────────
const PANTRY_STEPS = [
  {
    key: "Pantry",
    title: "Pantry",
    icon: "📦",
    blurb: "Dry goods, oils, spices, canned items.",
    placeholder: "olive oil 500 ml\nrice 2 kg\nblack beans 2 cans\npasta 500 g\nsalt\npepper",
  },
  {
    key: "Dairy",
    title: "Fridge",
    icon: "🧊",
    blurb: "Dairy, eggs, condiments, fresh produce.",
    placeholder: "milk 2 L\neggs 12\nbutter 250 g\nyogurt\ncheddar 200 g\ntomato 4",
  },
  {
    key: "Freezer",
    title: "Freezer",
    icon: "❄️",
    blurb: "Meats, frozen veg, batch meals.",
    placeholder: "chicken breast 1 kg\nground beef 500 g\nfrozen peas 500 g",
  },
];

function parseLines(text, defaultCategory) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s+([\d.]+)\s*([a-zA-Z]*)$/);
      if (m) {
        return { name: m[1].trim(), quantity: parseFloat(m[2]), unit: m[3] || "", category: defaultCategory, expiry_date: null, notes: null };
      }
      return { name: line, quantity: 1, unit: "", category: defaultCategory, expiry_date: null, notes: null };
    });
}

// ── Step 0: Preferences ───────────────────────────────────────────────────────
function PrefsStep({ prefs, setPrefs }) {
  const inputCls = "border border-stone-200 dark:border-stone-600 rounded-lg px-3 py-2 text-sm w-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent";
  const field = (label, key, opts = {}) => (
    <div>
      <label className="text-sm font-medium text-stone-700 dark:text-stone-200 block mb-1">{label}</label>
      {opts.hint && <p className="text-xs text-stone-400 dark:text-stone-500 mb-1">{opts.hint}</p>}
      {opts.textarea ? (
        <textarea
          value={prefs[key]}
          onChange={(e) => setPrefs({ ...prefs, [key]: e.target.value })}
          rows={2}
          className={`${inputCls} resize-none`}
          placeholder={opts.placeholder}
        />
      ) : (
        <input
          type={opts.type || "text"}
          value={prefs[key]}
          onChange={(e) => setPrefs({ ...prefs, [key]: e.target.value })}
          className={inputCls}
          placeholder={opts.placeholder}
          min={opts.min}
          max={opts.max}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-stone-300">Tell us about your household so AI can plan meals you'll love.</p>
      {field("How many people?", "servings", { type: "number", min: 1, max: 20, placeholder: "2" })}
      {field("Dietary restrictions", "dietary_restrictions", {
        textarea: true,
        hint: "Any allergies or dietary rules.",
        placeholder: "e.g. gluten-free, lactose intolerant",
      })}
      {field("Cuisine preferences", "cuisine_preferences", {
        textarea: true,
        hint: "Cuisines you enjoy.",
        placeholder: "e.g. Mexican, Italian, Asian",
      })}
      {field("Anything to avoid?", "avoid", {
        textarea: true,
        hint: "Ingredients or meals you don't want.",
        placeholder: "e.g. seafood, lamb, very spicy",
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Onboarding({ onDone }) {
  // step -1 = preferences, 0-2 = pantry steps
  const [stepIdx, setStepIdx] = useState(-1);
  const [prefs, setPrefs] = useState({
    servings: "2",
    dietary_restrictions: "",
    cuisine_preferences: "",
    avoid: "",
  });
  const [texts, setTexts] = useState(["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const pantryStep = PANTRY_STEPS[stepIdx]; // undefined when stepIdx === -1
  const itemCount = (i) => texts[i].split("\n").map((l) => l.trim()).filter(Boolean).length;
  const totalItems = itemCount(0) + itemCount(1) + itemCount(2);

  const setText = (val) => {
    const next = [...texts];
    next[stepIdx] = val;
    setTexts(next);
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const all = [
        ...parseLines(texts[0], "Pantry"),
        ...parseLines(texts[1], "Dairy"),
        ...parseLines(texts[2], "Freezer"),
      ];
      if (all.length > 0) await bulkCreatePantryItems(all);
      await updatePreferences({
        servings: parseInt(prefs.servings) || 2,
        dietary_restrictions: prefs.dietary_restrictions,
        cuisine_preferences: prefs.cuisine_preferences,
        avoid: prefs.avoid,
        onboarding_done: true,
      });
      onDone();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const skip = async () => {
    setSaving(true);
    try {
      await updatePreferences({ onboarding_done: true });
      onDone();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const allSteps = ["Preferences", ...PANTRY_STEPS.map((s) => s.title)];
  const currentTabIdx = stepIdx + 1; // 0 = prefs, 1-3 = pantry

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-stone-900 rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col">
        {/* Hero */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 px-6 pt-7 pb-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl backdrop-blur-sm">
              {stepIdx === -1 ? "🏠" : PANTRY_STEPS[stepIdx]?.icon}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100">Welcome</p>
              <h2 id="onboarding-title" className="text-xl font-bold leading-tight">
                {stepIdx === -1 ? "Set up your household" : "Stock your kitchen"}
              </h2>
            </div>
          </div>
          <p className="text-sm text-emerald-50/90 mt-3 leading-relaxed">
            {stepIdx === -1
              ? "These preferences guide every AI-generated meal plan."
              : "Tell Sous Chef what you already have — meal plans use it first."}
          </p>
        </div>

        {/* Stepper */}
        <div className="flex border-b border-stone-100 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 overflow-x-auto">
          {allSteps.map((label, i) => {
            const active = i === currentTabIdx;
            const icons = ["⚙️", ...PANTRY_STEPS.map((s) => s.icon)];
            const filled = i === 0
              ? (prefs.servings || prefs.dietary_restrictions || prefs.cuisine_preferences || prefs.avoid)
              : itemCount(i - 1) > 0;
            return (
              <button
                key={label}
                onClick={() => setStepIdx(i - 1)}
                className={`flex-1 px-2 py-3 text-center transition-colors shrink-0 ${active ? "bg-white dark:bg-stone-900" : "hover:bg-stone-50 dark:hover:bg-stone-800"}`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className={`text-sm ${active ? "" : "opacity-50"}`}>{icons[i]}</span>
                  <span className={`text-xs font-semibold ${active ? "text-stone-800 dark:text-stone-100" : "text-stone-400 dark:text-stone-500"}`}>
                    {label}
                  </span>
                  {filled && i > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1 py-0.5 rounded-full">
                      {itemCount(i - 1)}
                    </span>
                  )}
                  {filled && i === 0 && (
                    <span className="text-[10px] text-emerald-600">✓</span>
                  )}
                </div>
                <div className={`h-0.5 mt-2 rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-transparent"}`} />
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex-1 overflow-y-auto">
          {stepIdx === -1 ? (
            <PrefsStep prefs={prefs} setPrefs={setPrefs} />
          ) : (
            <>
              <p className="text-sm text-stone-600 dark:text-stone-300 mb-3">{pantryStep.blurb}</p>
              <textarea
                value={texts[stepIdx]}
                onChange={(e) => setText(e.target.value)}
                placeholder={pantryStep.placeholder}
                rows={9}
                spellCheck={false}
                className="w-full border border-stone-200 dark:border-stone-600 rounded-xl p-3 text-sm font-mono bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-300 dark:placeholder:text-stone-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
              />
              <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">
                One per line · format: <code className="bg-stone-100 dark:bg-stone-700 dark:text-stone-300 px-1 rounded">name amount unit</code>
              </p>
            </>
          )}
        </div>

        {error && <p className="text-red-500 text-sm px-6 pb-2">{error}</p>}

        {/* Footer */}
        <div className="border-t border-stone-100 dark:border-stone-700 px-5 py-3 flex items-center justify-between bg-stone-50/50 dark:bg-stone-800/50">
          <button
            onClick={skip}
            disabled={saving}
            className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 px-2 py-2 disabled:opacity-50"
          >
            Skip for now
          </button>
          <div className="flex items-center gap-1.5">
            {currentTabIdx > 0 && (
              <button
                onClick={() => setStepIdx(stepIdx - 1)}
                className="text-sm font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 px-3 py-2 rounded-lg"
              >
                ← Back
              </button>
            )}
            {currentTabIdx < allSteps.length - 1 ? (
              <button
                onClick={() => setStepIdx(stepIdx + 1)}
                className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-800 dark:hover:bg-stone-200"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={saving}
                className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/30"
              >
                {saving ? "Saving…" : totalItems > 0 ? `Add ${totalItems} items & finish` : "Finish"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

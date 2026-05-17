import { useState } from "react";
import { bulkCreatePantryItems, updatePreferences } from "../api";

const STEPS = [
  {
    key: "Pantry",
    title: "Pantry staples",
    blurb: "Dry goods, oils, spices, canned items — anything that lives in cupboards.",
    placeholder: "olive oil 500ml\nrice 2kg\nblack beans 2 cans\npasta 500g\nsalt\npepper\nflour 1kg",
  },
  {
    key: "Dairy",
    title: "Fridge",
    blurb: "Dairy, eggs, condiments, fresh produce, leftovers.",
    placeholder: "milk 2L\neggs 12\nbutter 250g\nyogurt\ncheddar 200g\nlettuce 1 head\ntomatoes 4",
  },
  {
    key: "Freezer",
    title: "Freezer",
    blurb: "Meats, frozen veg, batch-cooked meals.",
    placeholder: "chicken breast 1kg\nground beef 500g\nfrozen peas 500g\nfrozen berries 400g",
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
        return {
          name: m[1].trim(),
          quantity: parseFloat(m[2]),
          unit: m[3] || "",
          category: defaultCategory,
          expiry_date: null,
          notes: null,
        };
      }
      return { name: line, quantity: 1, unit: "", category: defaultCategory, expiry_date: null, notes: null };
    });
}

export default function Onboarding({ onDone }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [texts, setTexts] = useState(["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const step = STEPS[stepIdx];

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
      if (all.length > 0) {
        await bulkCreatePantryItems(all);
      }
      await updatePreferences({
        servings: 4,
        dietary_restrictions: "",
        cuisine_preferences: "",
        avoid: "",
        notes: "",
        onboarding_done: true,
      });
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    setSaving(true);
    try {
      await updatePreferences({
        servings: 4,
        dietary_restrictions: "",
        cuisine_preferences: "",
        avoid: "",
        notes: "",
        onboarding_done: true,
      });
      onDone();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-3">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Welcome</p>
          <h2 className="text-xl font-bold text-stone-800 mt-0.5">Let's stock your kitchen</h2>
          <p className="text-sm text-stone-500 mt-1">
            Tell us what you already have so meal plans use it up first. Paste a list — one item per line.
          </p>
          <div className="flex gap-1 mt-3">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setStepIdx(i)}
                className={`flex-1 text-xs font-medium pb-2 border-b-2 transition-colors ${
                  i === stepIdx ? "border-emerald-600 text-emerald-700" : "border-stone-200 text-stone-400 hover:text-stone-600"
                }`}
              >
                {i + 1}. {s.title}
              </button>
            ))}
          </div>
        </div>
        <div className="px-6 py-3 flex-1 overflow-y-auto">
          <p className="text-sm text-stone-600 mb-2">{step.blurb}</p>
          <textarea
            value={texts[stepIdx]}
            onChange={(e) => setText(e.target.value)}
            placeholder={step.placeholder}
            rows={10}
            className="w-full border border-stone-200 rounded-xl p-3 text-sm font-mono focus:outline-none focus:border-emerald-400"
          />
          <p className="text-xs text-stone-400 mt-1">
            Tip: <code>name amount unit</code> per line (e.g. "olive oil 500 ml"). Just a name works too.
          </p>
        </div>
        {error && <p className="text-red-500 text-sm px-6 pb-2">{error}</p>}
        <div className="border-t px-6 py-3 flex items-center justify-between bg-stone-50">
          <button onClick={skip} className="text-sm text-stone-500 hover:text-stone-700">Skip for now</button>
          <div className="flex gap-2">
            {stepIdx > 0 && (
              <button onClick={() => setStepIdx(stepIdx - 1)} className="text-sm text-stone-600 hover:text-stone-800 px-3 py-2">
                Back
              </button>
            )}
            {stepIdx < STEPS.length - 1 ? (
              <button onClick={() => setStepIdx(stepIdx + 1)} className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-900">
                Next
              </button>
            ) : (
              <button onClick={finish} disabled={saving} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
                {saving ? "Saving…" : "Finish"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

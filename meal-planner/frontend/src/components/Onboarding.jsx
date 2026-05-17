import { useState } from "react";
import { bulkCreatePantryItems, updatePreferences } from "../api";

const STEPS = [
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
  const itemCount = (i) =>
    texts[i].split("\n").map((l) => l.trim()).filter(Boolean).length;
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
      await updatePreferences({ onboarding_done: true });
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-sm"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col">
        {/* Hero */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 px-6 pt-7 pb-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl backdrop-blur-sm">
              🍳
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100">Welcome</p>
              <h2 id="onboarding-title" className="text-xl font-bold leading-tight">
                Let's stock your kitchen
              </h2>
            </div>
          </div>
          <p className="text-sm text-emerald-50/90 mt-3 leading-relaxed">
            Tell Sous Chef what you already have — meal plans use it first.
          </p>
        </div>

        {/* Stepper */}
        <div className="flex border-b border-stone-100 bg-stone-50/50">
          {STEPS.map((s, i) => {
            const active = i === stepIdx;
            const filled = itemCount(i) > 0;
            return (
              <button
                key={s.key}
                onClick={() => setStepIdx(i)}
                className={`flex-1 px-2 py-3 text-center transition-colors ${
                  active ? "bg-white" : "hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span className={`text-base ${active ? "" : "opacity-50"}`}>{s.icon}</span>
                  <span className={`text-xs font-semibold ${active ? "text-stone-800" : "text-stone-400"}`}>
                    {s.title}
                  </span>
                  {filled && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                      {itemCount(i)}
                    </span>
                  )}
                </div>
                <div className={`h-0.5 mt-2 rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-transparent"}`} />
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex-1 overflow-y-auto">
          <p className="text-sm text-stone-600 mb-3">{step.blurb}</p>
          <textarea
            value={texts[stepIdx]}
            onChange={(e) => setText(e.target.value)}
            placeholder={step.placeholder}
            rows={9}
            spellCheck={false}
            className="w-full border border-stone-200 rounded-xl p-3 text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-stone-300"
          />
          <p className="text-xs text-stone-400 mt-2">
            One per line · format: <code className="bg-stone-100 px-1 rounded">name amount unit</code>
          </p>
        </div>

        {error && (
          <p className="text-red-500 text-sm px-6 pb-2">{error}</p>
        )}

        {/* Footer */}
        <div className="border-t border-stone-100 px-5 py-3 flex items-center justify-between bg-stone-50/50">
          <button
            onClick={skip}
            disabled={saving}
            className="text-sm text-stone-500 hover:text-stone-700 px-2 py-2 disabled:opacity-50"
          >
            Skip for now
          </button>
          <div className="flex items-center gap-1.5">
            {stepIdx > 0 && (
              <button
                onClick={() => setStepIdx(stepIdx - 1)}
                className="text-sm font-medium text-stone-700 hover:bg-stone-100 px-3 py-2 rounded-lg"
              >
                ← Back
              </button>
            )}
            {stepIdx < STEPS.length - 1 ? (
              <button
                onClick={() => setStepIdx(stepIdx + 1)}
                className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-800"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={saving}
                className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/30"
              >
                {saving ? "Saving…" : totalItems > 0 ? `Add ${totalItems} items` : "Finish"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

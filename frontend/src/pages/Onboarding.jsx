import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { updateSettings } from "../api";
import { useSettings } from "../contexts/SettingsContext";

export default function Onboarding() {
  const navigate = useNavigate();
  const { refresh } = useSettings();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ household_name: "", person_1: "", person_2: "" });
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    await updateSettings({
      household_name: form.household_name || "My Budget",
      person_1: form.person_1 || "Person 1",
      person_2: form.person_2 || "Person 2",
      onboarding_complete: "true",
    });
    await refresh();
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Progress */}
        <div className="flex gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-yellow-400" : "bg-zinc-800"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">Welcome</h1>
              <p className="text-zinc-500 text-sm mt-1">Let's set up your budget tracker.</p>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Household Name</label>
              <input
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full"
                placeholder="e.g. Smith Budget"
                value={form.household_name}
                onChange={(e) => setForm({ ...form, household_name: e.target.value })}
                autoFocus
              />
              <p className="text-xs text-zinc-600 mt-1">This appears in the top-left of the app.</p>
            </div>
            <button onClick={() => setStep(2)}
              className="w-full bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300">
              Next →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">Who's tracking?</h1>
              <p className="text-zinc-500 text-sm mt-1">Enter names for income tracking (leave blank to skip).</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Person 1</label>
                <input
                  className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full"
                  placeholder="e.g. Alex"
                  value={form.person_1}
                  onChange={(e) => setForm({ ...form, person_1: e.target.value })}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Person 2 (optional)</label>
                <input
                  className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full"
                  placeholder="e.g. Jordan"
                  value={form.person_2}
                  onChange={(e) => setForm({ ...form, person_2: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 border border-zinc-700 text-zinc-400 py-2.5 rounded-lg text-sm hover:bg-zinc-800">
                ← Back
              </button>
              <button onClick={() => setStep(3)} className="flex-1 bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300">
                Next →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">You're all set</h1>
              <p className="text-zinc-500 text-sm mt-1">
                Head to <strong className="text-zinc-300">Import</strong> to add your first transactions, or go straight to the dashboard.
              </p>
            </div>
            <div className="bg-zinc-800 rounded-lg p-4 space-y-1 text-sm">
              <p className="text-zinc-400">Household: <span className="text-zinc-100">{form.household_name || "My Budget"}</span></p>
              {form.person_1 && <p className="text-zinc-400">Person 1: <span className="text-zinc-100">{form.person_1}</span></p>}
              {form.person_2 && <p className="text-zinc-400">Person 2: <span className="text-zinc-100">{form.person_2}</span></p>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 border border-zinc-700 text-zinc-400 py-2.5 rounded-lg text-sm hover:bg-zinc-800">
                ← Back
              </button>
              <button onClick={handleFinish} disabled={saving}
                className="flex-1 bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300 disabled:opacity-40">
                {saving ? "Setting up…" : "Get Started"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

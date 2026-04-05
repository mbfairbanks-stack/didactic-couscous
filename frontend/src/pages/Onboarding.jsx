import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { updateSettings, createIncome, createBudgetTarget, importFile } from "../api";
import { useSettings } from "../contexts/SettingsContext";

const TOTAL_STEPS = 5;

const BUDGET_CATEGORIES = [
  { category: "Mortgage", label: "Mortgage / Rent", group: "Committed" },
  { category: "Groceries", label: "Groceries", group: "Needs" },
  { category: "Transportation", label: "Transportation / Gas", group: "Needs" },
  { category: "Natural Gas", label: "Natural Gas / Hydro", group: "Needs" },
  { category: "Internet", label: "Internet", group: "Needs" },
  { category: "Mobile", label: "Mobile / Phone", group: "Needs" },
  { category: "Insurance", label: "Insurance", group: "Needs" },
  { category: "Dining", label: "Dining Out", group: "Wants" },
  { category: "Coffee", label: "Coffee", group: "Wants" },
  { category: "Entertainment", label: "Entertainment", group: "Wants" },
  { category: "Subscriptions", label: "Subscriptions", group: "Wants" },
  { category: "Fitness", label: "Fitness", group: "Wants" },
  { category: "Misc", label: "Miscellaneous", group: "Wants" },
];

const GROUP_COLORS = {
  Committed: "text-blue-400",
  Needs: "text-green-400",
  Wants: "text-yellow-400",
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { refresh } = useSettings();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [importStatus, setImportStatus] = useState(null); // null | "uploading" | "done" | "error"

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [form, setForm] = useState({
    household_name: "",
    person_1: "",
    person_2: "",
    income_1: "",
    income_2: "",
    budgets: Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c.category, ""])),
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setBudget = (cat, val) => setForm((f) => ({ ...f, budgets: { ...f.budgets, [cat]: val } }));

  const handleFinish = async () => {
    setSaving(true);

    // Save settings
    await updateSettings({
      household_name: form.household_name || "My Budget",
      person_1: form.person_1 || "Person 1",
      person_2: form.person_2 || "Person 2",
      onboarding_complete: "true",
    });

    // Save income for person 1
    if (form.income_1 && parseFloat(form.income_1) > 0) {
      await createIncome({
        year: currentYear,
        month: currentMonth,
        person: form.person_1 || "Person 1",
        income_type: "Employment",
        amount: parseFloat(form.income_1),
      }).catch(() => {});
    }

    // Save income for person 2
    if (form.person_2 && form.income_2 && parseFloat(form.income_2) > 0) {
      await createIncome({
        year: currentYear,
        month: currentMonth,
        person: form.person_2,
        income_type: "Employment",
        amount: parseFloat(form.income_2),
      }).catch(() => {});
    }

    // Save budget targets
    for (const { category } of BUDGET_CATEGORIES) {
      const val = form.budgets[category];
      if (val && parseFloat(val) > 0) {
        await createBudgetTarget({
          category,
          year: currentYear,
          month: currentMonth,
          amount: parseFloat(val),
        }).catch(() => {});
      }
    }

    await refresh();
    navigate("/dashboard", { replace: true });
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus("uploading");
    const res = await importFile(file);
    setImportStatus(res && res.imported >= 0 ? "done" : "error");
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Progress bar */}
        <div className="flex gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i + 1 <= step ? "bg-yellow-400" : "bg-zinc-800"}`} />
          ))}
        </div>
        <p className="text-xs text-zinc-600 text-right">Step {step} of {TOTAL_STEPS}</p>

        {/* Step 1: Household */}
        {step === 1 && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">Welcome to BudgetBot</h1>
              <p className="text-zinc-500 text-sm mt-1">Let's set up your household in a few quick steps.</p>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Household Name</label>
              <input
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full"
                placeholder="e.g. Smith Budget"
                value={form.household_name}
                onChange={(e) => set("household_name", e.target.value)}
                autoFocus
              />
              <p className="text-xs text-zinc-600 mt-1">Appears in the top-left of the app.</p>
            </div>
            <button onClick={() => setStep(2)}
              className="w-full bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300">
              Next →
            </button>
          </div>
        )}

        {/* Step 2: People */}
        {step === 2 && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">Who's tracking?</h1>
              <p className="text-zinc-500 text-sm mt-1">Enter names for income tracking. Person 2 is optional.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Person 1</label>
                <input
                  className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full"
                  placeholder="e.g. Alex"
                  value={form.person_1}
                  onChange={(e) => set("person_1", e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Person 2 <span className="text-zinc-600">(optional)</span></label>
                <input
                  className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full"
                  placeholder="e.g. Jordan"
                  value={form.person_2}
                  onChange={(e) => set("person_2", e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 border border-zinc-700 text-zinc-400 py-2.5 rounded-lg text-sm hover:bg-zinc-800">← Back</button>
              <button onClick={() => setStep(3)} className="flex-1 bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300">Next →</button>
            </div>
          </div>
        )}

        {/* Step 3: Income */}
        {step === 3 && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">Monthly Income</h1>
              <p className="text-zinc-500 text-sm mt-1">Enter your monthly take-home (after tax) pay. You can update this anytime.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">{form.person_1 || "Person 1"} — Monthly Take-Home</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    className="bg-zinc-800 border border-zinc-700 rounded pl-7 pr-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full"
                    placeholder="e.g. 5000"
                    value={form.income_1}
                    onChange={(e) => set("income_1", e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              {form.person_2 && (
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">{form.person_2} — Monthly Take-Home</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      className="bg-zinc-800 border border-zinc-700 rounded pl-7 pr-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full"
                      placeholder="e.g. 4000"
                      value={form.income_2}
                      onChange={(e) => set("income_2", e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 border border-zinc-700 text-zinc-400 py-2.5 rounded-lg text-sm hover:bg-zinc-800">← Back</button>
              <button onClick={() => setStep(4)} className="flex-1 bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300">Next →</button>
            </div>
            <p className="text-xs text-zinc-600 text-center">Leave blank to skip — you can add income anytime from the Income page.</p>
          </div>
        )}

        {/* Step 4: Spending habits */}
        {step === 4 && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">Typical Monthly Spending</h1>
              <p className="text-zinc-500 text-sm mt-1">Set budget targets for your key categories. Leave blank to skip.</p>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {["Committed", "Needs", "Wants"].map((group) => (
                <div key={group}>
                  <p className={`text-xs font-semibold mb-2 ${GROUP_COLORS[group]}`}>{group}</p>
                  <div className="space-y-2">
                    {BUDGET_CATEGORIES.filter((c) => c.group === group).map(({ category, label }) => (
                      <div key={category} className="flex items-center gap-3">
                        <label className="text-xs text-zinc-400 w-40 shrink-0">{label}</label>
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
                          <input
                            type="number"
                            min="0"
                            className="bg-zinc-800 border border-zinc-700 rounded pl-5 pr-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50 w-full"
                            placeholder="0"
                            value={form.budgets[category]}
                            onChange={(e) => setBudget(category, e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="flex-1 border border-zinc-700 text-zinc-400 py-2.5 rounded-lg text-sm hover:bg-zinc-800">← Back</button>
              <button onClick={() => setStep(5)} className="flex-1 bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300">Next →</button>
            </div>
          </div>
        )}

        {/* Step 5: Import + Finish */}
        {step === 5 && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">Import Past Transactions</h1>
              <p className="text-zinc-500 text-sm mt-1">Upload an Excel (.xlsx) file from your bank to bring in historical data. You can also do this later from the Import page.</p>
            </div>

            <div className="space-y-3">
              <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
                importStatus === "done" ? "border-green-500 bg-green-500/10" :
                importStatus === "error" ? "border-red-500 bg-red-500/10" :
                "border-zinc-700 hover:border-yellow-400/50 hover:bg-zinc-800/50"
              }`}>
                <input type="file" accept=".xlsx" className="hidden" onChange={handleImport} disabled={importStatus === "uploading"} />
                {importStatus === "uploading" && <p className="text-zinc-400 text-sm">Uploading…</p>}
                {importStatus === "done" && <p className="text-green-400 text-sm font-medium">Transactions imported!</p>}
                {importStatus === "error" && <p className="text-red-400 text-sm">Import failed — try again or skip.</p>}
                {!importStatus && (
                  <>
                    <svg className="w-8 h-8 text-zinc-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-zinc-400 text-sm">Click to upload .xlsx file</p>
                    <p className="text-zinc-600 text-xs mt-1">Supports RBC, TD, Scotiabank and more</p>
                  </>
                )}
              </label>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(4)} className="flex-1 border border-zinc-700 text-zinc-400 py-2.5 rounded-lg text-sm hover:bg-zinc-800">← Back</button>
              <button onClick={handleFinish} disabled={saving || importStatus === "uploading"}
                className="flex-1 bg-yellow-400 text-black py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-300 disabled:opacity-40">
                {saving ? "Setting up…" : importStatus === "done" ? "Finish →" : "Skip & Finish →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

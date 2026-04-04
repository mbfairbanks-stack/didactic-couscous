import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getDebts, createDebt, updateDebt, deleteDebt } from "../api";
import { fmt } from "../utils";

const inputCls =
  "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400/50";

const emptyForm = {
  name: "",
  creditor: "",
  debt_type: "loan",
  credit_limit: "",
  interest_rate: "",
  initial_balance: "",
  current_balance: "",
  monthly_payment: "",
  monthly_extra: "",
  savings: "",
  due_date: "",
  notes: "",
};

function parseMonthsRemaining(dueDateStr) {
  if (!dueDateStr) return null;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = dueDateStr.split(" ");
  if (parts.length !== 2) return null;
  const m = monthNames.indexOf(parts[0]);
  const y = parseInt(parts[1]);
  if (m === -1 || isNaN(y)) return null;
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - now.getMonth());
}

function computeDebtStats(debt) {
  const remaining = debt.current_balance - debt.savings;
  const monthsLeft = parseMonthsRemaining(debt.due_date);
  const totalMonthly = debt.monthly_payment + debt.monthly_extra;
  const balanceAtDue =
    monthsLeft != null ? Math.max(0, remaining - totalMonthly * monthsLeft) : null;
  const monthlyNeeded =
    monthsLeft != null && monthsLeft > 0 ? remaining / monthsLeft : null;
  const onTrack = monthlyNeeded != null ? totalMonthly >= monthlyNeeded : true;
  const pctPaid =
    debt.initial_balance > 0
      ? Math.min(100, ((debt.initial_balance - debt.current_balance) / debt.initial_balance) * 100)
      : 0;
  return { remaining, monthsLeft, totalMonthly, balanceAtDue, monthlyNeeded, onTrack, pctPaid };
}

function buildPayoffData(debt) {
  const MONTH_ABBRS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthsLeft = parseMonthsRemaining(debt.due_date);
  const totalMonthly = debt.monthly_payment + debt.monthly_extra;
  const MAX_MONTHS = 60;
  const cap = monthsLeft != null ? Math.min(monthsLeft, MAX_MONTHS) : MAX_MONTHS;

  const now = new Date();
  const startMonth = now.getMonth();
  const startYear = now.getFullYear();

  const data = [];
  let balance = debt.current_balance;
  const monthlyRate = (debt.interest_rate || 0) / 12;

  // Include month 0 (today's balance)
  for (let i = 0; i <= cap; i++) {
    const absMonth = startMonth + i;
    const month = absMonth % 12;
    const year = startYear + Math.floor(absMonth / 12);
    const label = `${MONTH_ABBRS[month]} ${String(year).slice(2)}`;
    data.push({ month: label, balance: Math.round(balance * 100) / 100 });
    if (balance <= 0) break;
    // Apply interest then payment
    balance = balance * (1 + monthlyRate);
    balance = Math.max(0, balance - totalMonthly);
    if (balance === 0) {
      const nextAbsMonth = startMonth + i + 1;
      const nextMonth = nextAbsMonth % 12;
      const nextYear = startYear + Math.floor(nextAbsMonth / 12);
      const nextLabel = `${MONTH_ABBRS[nextMonth]} ${String(nextYear).slice(2)}`;
      data.push({ month: nextLabel, balance: 0 });
      break;
    }
  }

  return data;
}

// Calculate months to pay off (handles interest)
function calcMonthsToPayoff(balance, monthlyPayment, annualRate = 0) {
  if (monthlyPayment <= 0) return null;
  if (balance <= 0) return 0;
  if (!annualRate) return Math.ceil(balance / monthlyPayment);
  const r = annualRate / 12;
  if (monthlyPayment <= balance * r) return null; // payment doesn't cover interest
  return Math.ceil(Math.log(monthlyPayment / (monthlyPayment - balance * r)) / Math.log(1 + r));
}

function PayoffTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 shadow-lg">
      <p className="text-zinc-400 mb-0.5">{label}</p>
      <p className="font-semibold text-yellow-400">{fmt(payload[0].value)}</p>
    </div>
  );
}

function ExtraPaymentSimulator({ debt }) {
  const [extra, setExtra] = useState(0);

  const baseMonthly = debt.monthly_payment + debt.monthly_extra;
  const balance = debt.current_balance;

  const rate = debt.interest_rate || 0;
  const baseMonths = calcMonthsToPayoff(balance, baseMonthly, rate);
  const newMonths = calcMonthsToPayoff(balance, baseMonthly + extra, rate);

  const monthsSaved = baseMonths != null && newMonths != null ? baseMonths - newMonths : null;

  // For 0% interest, interest saved is always $0, but we show the time savings prominently
  const amountSaved = extra > 0 && monthsSaved != null && monthsSaved > 0
    ? monthsSaved * extra  // extra payments no longer made = savings in extra outflow
    : 0;

  return (
    <div className="border-t border-zinc-800 pt-3 mt-1">
      <p className="text-xs font-medium text-zinc-400 mb-2">Extra Payment Simulator</p>
      <div className="flex items-center gap-3 mb-3">
        <input
          type="range"
          min={0}
          max={500}
          step={25}
          value={extra}
          onChange={(e) => setExtra(Number(e.target.value))}
          className="flex-1 accent-yellow-400 h-1.5 cursor-pointer"
        />
        <span className="text-sm font-semibold text-yellow-400 w-20 text-right shrink-0">
          +{fmt(extra)}/mo
        </span>
      </div>

      {extra === 0 ? (
        <p className="text-xs text-zinc-500">Move the slider to simulate extra payments.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <span className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 text-xs text-zinc-300">
            Payoff in{" "}
            <span className="font-semibold text-yellow-400">
              {newMonths != null ? `${newMonths} mo` : "—"}
            </span>{" "}
            <span className="text-zinc-500">
              (vs {baseMonths != null ? `${baseMonths} mo` : "—"} at minimum)
            </span>
          </span>
          {monthsSaved != null && monthsSaved > 0 && (
            <span className="bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1 text-xs text-green-400 font-medium">
              {monthsSaved} month{monthsSaved !== 1 ? "s" : ""} sooner
            </span>
          )}
          {amountSaved > 0 && (
            <span className="bg-yellow-400/10 border border-yellow-400/30 rounded-full px-3 py-1 text-xs text-yellow-400 font-medium">
              Save ~{fmt(amountSaved)} in extra payments
            </span>
          )}
          {monthsSaved === 0 && (
            <span className="text-xs text-zinc-500">No time difference at this amount.</span>
          )}
        </div>
      )}
    </div>
  );
}

function PayoffChart({ debt }) {
  const [open, setOpen] = useState(false);
  const data = open ? buildPayoffData(debt) : null;

  return (
    <div className="border-t border-zinc-800 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-yellow-400 transition-colors"
      >
        <span
          className="inline-block transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▶
        </span>
        Payoff Timeline
      </button>

      {open && (
        <div className="mt-3 bg-zinc-950 rounded-lg px-2 py-3">
          {data && data.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  width={42}
                />
                <Tooltip content={<PayoffTooltip />} />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#facc15"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#facc15", stroke: "#18181b", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-zinc-500 text-center py-4">
              {(debt.monthly_payment + debt.monthly_extra) <= 0
                ? "Set a monthly payment to see the timeline."
                : "Not enough data to render timeline."}
            </p>
          )}
        </div>
      )}

      {/* Extra Payment Simulator always visible below the chart toggle */}
      {(debt.monthly_payment + debt.monthly_extra) > 0 && (
        <ExtraPaymentSimulator debt={debt} />
      )}
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="bg-zinc-800 rounded-lg px-3 py-2">
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

// Simulate payoff order and total months using snowball or avalanche strategy
// Strategy: fix total monthly budget = sum of all minimums; when a debt is paid off,
// redirect that payment to the next debt in order.
function simulateStrategy(debts, sortFn) {
  if (!debts.length) return { order: [], totalMonths: 0 };

  // Clone debts with mutable balances and their minimum payments
  const pool = debts
    .filter((d) => (d.monthly_payment + d.monthly_extra) > 0 || d.current_balance > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: Math.max(0, d.current_balance),
      minPayment: d.monthly_payment + d.monthly_extra,
    }));

  if (!pool.length) return { order: [], totalMonths: 0 };

  // Sort according to strategy
  const sorted = [...pool].sort(sortFn);
  const order = sorted.map((d) => d.name);

  // Total monthly budget available
  const totalBudget = pool.reduce((s, d) => s + d.minPayment, 0);
  if (totalBudget <= 0) return { order, totalMonths: null };

  // Simulate month by month
  // Each month: pay minimums on all except the focus debt, put remainder on focus debt
  let balances = sorted.map((d) => d.balance);
  const minPayments = sorted.map((d) => d.minPayment);

  let months = 0;
  const MAX_SIM = 600; // 50 years cap

  while (balances.some((b) => b > 0) && months < MAX_SIM) {
    months++;

    // Find the first (focus) debt that still has balance
    const focusIdx = balances.findIndex((b) => b > 0);
    if (focusIdx === -1) break;

    // Pay minimums on non-focus debts, accumulate leftover for focus
    let leftover = 0;
    for (let i = 0; i < balances.length; i++) {
      if (balances[i] <= 0) continue;
      if (i === focusIdx) continue;
      const pay = Math.min(balances[i], minPayments[i]);
      balances[i] = Math.max(0, balances[i] - pay);
      leftover += minPayments[i] - pay; // freed up if balance was < min
    }

    // Apply total budget surplus to focus debt
    const focusBudget = minPayments[focusIdx] + leftover + Math.max(
      0,
      totalBudget - minPayments.reduce((s, p, i) => s + (balances[i] > 0 ? p : 0), 0) - minPayments[focusIdx]
    );
    balances[focusIdx] = Math.max(0, balances[focusIdx] - focusBudget);
  }

  return { order, totalMonths: months };
}

function StrategyPanel({ debts }) {
  const activeDebts = debts.filter((d) => d.current_balance > 0);
  if (activeDebts.length < 2) return null;

  const avalanche = simulateStrategy(
    activeDebts,
    (a, b) => b.balance - a.balance // highest balance first
  );
  const snowball = simulateStrategy(
    activeDebts,
    (a, b) => a.balance - b.balance // lowest balance first
  );

  const avalancheFaster =
    avalanche.totalMonths != null &&
    snowball.totalMonths != null &&
    avalanche.totalMonths < snowball.totalMonths;
  const snowballFaster =
    avalanche.totalMonths != null &&
    snowball.totalMonths != null &&
    snowball.totalMonths < avalanche.totalMonths;
  const tied =
    avalanche.totalMonths != null &&
    snowball.totalMonths != null &&
    avalanche.totalMonths === snowball.totalMonths;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-700 bg-zinc-800 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold text-zinc-100">Payoff Strategy Comparison</h2>
        {tied && (
          <span className="text-xs text-zinc-400 bg-zinc-700 px-2 py-0.5 rounded-full">
            Both strategies equal
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-zinc-700">
        {/* Avalanche */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-100">Avalanche</span>
            <span className="text-xs text-zinc-500">highest balance first</span>
            {avalancheFaster && (
              <span className="ml-auto bg-yellow-400/15 border border-yellow-400/40 text-yellow-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                Faster
              </span>
            )}
          </div>
          <ol className="space-y-1.5">
            {avalanche.order.map((name, i) => (
              <li key={name} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-zinc-700 text-zinc-300 text-xs flex items-center justify-center font-medium shrink-0">
                  {i + 1}
                </span>
                <span className="text-zinc-200">{name}</span>
              </li>
            ))}
          </ol>
          <div className="bg-zinc-800 rounded-lg px-3 py-2 mt-1">
            <p className="text-xs text-zinc-500 mb-0.5">Total payoff time</p>
            <p className="text-sm font-semibold text-zinc-100">
              {avalanche.totalMonths != null
                ? `${avalanche.totalMonths} month${avalanche.totalMonths !== 1 ? "s" : ""}`
                : "—"}
            </p>
          </div>
        </div>

        {/* Snowball */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-100">Snowball</span>
            <span className="text-xs text-zinc-500">lowest balance first</span>
            {snowballFaster && (
              <span className="ml-auto bg-yellow-400/15 border border-yellow-400/40 text-yellow-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                Faster
              </span>
            )}
          </div>
          <ol className="space-y-1.5">
            {snowball.order.map((name, i) => (
              <li key={name} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-zinc-700 text-zinc-300 text-xs flex items-center justify-center font-medium shrink-0">
                  {i + 1}
                </span>
                <span className="text-zinc-200">{name}</span>
              </li>
            ))}
          </ol>
          <div className="bg-zinc-800 rounded-lg px-3 py-2 mt-1">
            <p className="text-xs text-zinc-500 mb-0.5">Total payoff time</p>
            <p className="text-sm font-semibold text-zinc-100">
              {snowball.totalMonths != null
                ? `${snowball.totalMonths} month${snowball.totalMonths !== 1 ? "s" : ""}`
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {tied && (
        <div className="px-5 py-3 border-t border-zinc-700 text-xs text-zinc-400">
          Both strategies finish in the same number of months for 0% interest debts. Snowball may feel
          more motivating — paying off smaller debts first gives faster early wins.
        </div>
      )}
      {(avalancheFaster || snowballFaster) && (
        <div className="px-5 py-3 border-t border-zinc-700 text-xs text-zinc-400">
          {avalancheFaster
            ? `Avalanche saves ${snowball.totalMonths - avalanche.totalMonths} month${snowball.totalMonths - avalanche.totalMonths !== 1 ? "s" : ""} vs Snowball.`
            : `Snowball saves ${avalanche.totalMonths - snowball.totalMonths} month${avalanche.totalMonths - snowball.totalMonths !== 1 ? "s" : ""} vs Avalanche.`}
        </div>
      )}
    </div>
  );
}

export default function Debts() {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    getDebts()
      .then(setDebts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ ...emptyForm });
    setEditId(null);
    setFormError("");
    setShowModal(true);
  };

  const openEdit = (debt) => {
    setForm({
      name: debt.name,
      creditor: debt.creditor || "",
      debt_type: debt.debt_type || "loan",
      credit_limit: debt.credit_limit ? String(debt.credit_limit) : "",
      interest_rate: debt.interest_rate ? String(debt.interest_rate * 100) : "",
      initial_balance: String(debt.initial_balance),
      current_balance: String(debt.current_balance),
      monthly_payment: String(debt.monthly_payment),
      monthly_extra: String(debt.monthly_extra),
      savings: String(debt.savings),
      due_date: debt.due_date || "",
      notes: debt.notes || "",
    });
    setEditId(debt.id);
    setFormError("");
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this debt?")) return;
    try {
      await deleteDebt(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    const body = {
      name: form.name.trim(),
      creditor: form.creditor.trim(),
      debt_type: form.debt_type,
      credit_limit: parseFloat(form.credit_limit) || 0,
      interest_rate: parseFloat(form.interest_rate) / 100 || 0,  // store as decimal
      initial_balance: parseFloat(form.initial_balance) || 0,
      current_balance: parseFloat(form.current_balance) || 0,
      monthly_payment: parseFloat(form.monthly_payment) || 0,
      monthly_extra: parseFloat(form.monthly_extra) || 0,
      savings: parseFloat(form.savings) || 0,
      due_date: form.due_date.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editId) {
        await updateDebt(editId, body);
      } else {
        await createDebt(body);
      }
      setShowModal(false);
      setEditId(null);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  // Summary totals
  const totalBalance = debts.reduce((s, d) => s + d.current_balance, 0);
  const totalMonthly = debts.reduce((s, d) => s + d.monthly_payment + d.monthly_extra, 0);
  const totalRemaining = debts.reduce((s, d) => s + (d.current_balance - d.savings), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-zinc-100">Debt Tracker</h1>
        <button
          onClick={openAdd}
          className="bg-yellow-400 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-300"
        >
          + Add Debt
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Summary bar */}
      {debts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Current Balance</p>
            <p className="text-xl font-bold text-yellow-400">{fmt(totalBalance)}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Monthly Committed</p>
            <p className="text-xl font-bold text-yellow-400">{fmt(totalMonthly)}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Remaining</p>
            <p className="text-xl font-bold text-yellow-400">{fmt(totalRemaining)}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-center text-zinc-600 py-16">Loading...</p>
      )}

      {/* Empty state */}
      {!loading && debts.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center">
          <p className="text-zinc-500 text-sm">No debts tracked yet.</p>
          <button
            onClick={openAdd}
            className="mt-4 bg-yellow-400 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-300"
          >
            + Add Your First Debt
          </button>
        </div>
      )}

      {/* Debt cards */}
      {!loading && debts.map((debt) => {
        const { remaining, monthsLeft, totalMonthly: tm, balanceAtDue, monthlyNeeded, onTrack, pctPaid } =
          computeDebtStats(debt);

        return (
          <div key={debt.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700 bg-zinc-800">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-base font-semibold text-zinc-100">{debt.name}</span>
                {debt.creditor && (
                  <span className="bg-zinc-700 text-zinc-300 text-xs px-2 py-0.5 rounded-full">
                    {debt.creditor}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openEdit(debt)}
                  className="text-yellow-400 hover:text-yellow-300 text-xs font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(debt.id)}
                  className="text-red-500 hover:text-red-400 text-xs font-medium"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-zinc-500">Progress</span>
                  <span className="text-xs font-medium text-yellow-400">
                    {pctPaid.toFixed(1)}% paid off
                  </span>
                </div>
                <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full transition-all"
                    style={{ width: `${pctPaid}%` }}
                  />
                </div>
              </div>

              {/* LOC summary bar */}
              {debt.debt_type === "loc" && debt.credit_limit > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatBox label="Credit Limit" value={fmt(debt.credit_limit)} />
                  <StatBox label="Outstanding" value={fmt(debt.current_balance)} />
                  <div className="bg-green-900/30 border border-green-700/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-zinc-500 mb-0.5">Available</p>
                    <p className="text-sm font-semibold text-green-400">{fmt(Math.max(0, debt.credit_limit - debt.current_balance))}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg px-3 py-2">
                    <p className="text-xs text-zinc-500 mb-0.5">Monthly Interest</p>
                    <p className="text-sm font-semibold text-red-400">
                      {fmt(debt.current_balance * (debt.interest_rate / 12))}
                      <span className="text-zinc-500 text-xs ml-1">@ {(debt.interest_rate * 100).toFixed(2)}%</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Stats grid */}
              {debt.debt_type !== "loc" ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatBox label="Current Balance" value={fmt(debt.current_balance)} />
                  <StatBox label="Initial Balance" value={fmt(debt.initial_balance)} />
                  <StatBox label="Remaining (net)" value={fmt(remaining)} />
                  <StatBox label="Savings Set Aside" value={fmt(debt.savings)} />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <StatBox label="Minimum Payment" value={fmt(debt.monthly_payment)} />
                  <StatBox label="Extra Payment" value={fmt(debt.monthly_extra)} />
                  <StatBox label="Total Monthly" value={fmt(debt.monthly_payment + debt.monthly_extra)} />
                </div>
              )}

              {/* Due date stats */}
              {debt.due_date && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-start">
                  <StatBox label="Due Date" value={debt.due_date} />
                  <StatBox
                    label="Months Left"
                    value={monthsLeft != null ? monthsLeft : "—"}
                  />
                  <StatBox
                    label="Balance at Due"
                    value={balanceAtDue != null ? fmt(balanceAtDue) : "—"}
                  />
                  <StatBox
                    label="Monthly Needed"
                    value={monthlyNeeded != null ? fmt(monthlyNeeded) : "—"}
                  />
                  <div className="bg-zinc-800 rounded-lg px-3 py-2 flex flex-col justify-center">
                    <p className="text-xs text-zinc-500 mb-1">Status</p>
                    {onTrack ? (
                      <span className="inline-block bg-green-500/15 text-green-400 text-xs font-semibold px-2 py-0.5 rounded">
                        On Track
                      </span>
                    ) : (
                      <span className="inline-block bg-red-500/15 text-red-400 text-xs font-semibold px-2 py-0.5 rounded">
                        At Risk
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {debt.notes && (
                <p className="text-xs text-zinc-400 border-t border-zinc-800 pt-3">
                  <span className="text-zinc-600 font-medium uppercase tracking-wide mr-1">Notes:</span>
                  {debt.notes}
                </p>
              )}

              {/* Payoff Timeline + Extra Payment Simulator */}
              <PayoffChart debt={debt} />
            </div>
          </div>
        );
      })}

      {/* Avalanche vs Snowball Strategy Panel */}
      {!loading && debts.length >= 2 && <StrategyPanel debts={debts} />}

      {/* Add / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4 text-zinc-100">
              {editId ? "Edit Debt" : "Add Debt"}
            </h2>

            {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TD Line of Credit"
                    className={`w-full ${inputCls}`}
                    {...field("name")}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Type</label>
                  <select className={`w-full ${inputCls}`} {...field("debt_type")}>
                    <option value="loan">Loan</option>
                    <option value="loc">Line of Credit</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Creditor</label>
                  <input
                    type="text"
                    placeholder="e.g. TD Bank"
                    className={`w-full ${inputCls}`}
                    {...field("creditor")}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Interest Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 6.45"
                    className={`w-full ${inputCls}`}
                    {...field("interest_rate")}
                  />
                </div>
              </div>

              {form.debt_type === "loc" && (
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Credit Limit ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 10000"
                    className={`w-full ${inputCls}`}
                    {...field("credit_limit")}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {form.debt_type !== "loc" && (
                  <div>
                    <label className="text-xs text-zinc-500 block mb-0.5">Initial Balance ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      className={`w-full ${inputCls}`}
                      {...field("initial_balance")}
                    />
                  </div>
                )}
                <div className={form.debt_type === "loc" ? "col-span-2" : ""}>
                  <label className="text-xs text-zinc-500 block mb-0.5">
                    {form.debt_type === "loc" ? "Outstanding Balance ($)" : "Current Balance ($)"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className={`w-full ${inputCls}`}
                    {...field("current_balance")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Monthly Payment ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className={`w-full ${inputCls}`}
                    {...field("monthly_payment")}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Monthly Extra ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className={`w-full ${inputCls}`}
                    {...field("monthly_extra")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Savings Set Aside ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className={`w-full ${inputCls}`}
                    {...field("savings")}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-0.5">Due Date</label>
                  <input
                    type="text"
                    placeholder="Feb 2027"
                    className={`w-full ${inputCls}`}
                    {...field("due_date")}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-500 block mb-0.5">Notes (optional)</label>
                <input
                  type="text"
                  placeholder="Any notes..."
                  className={`w-full ${inputCls}`}
                  {...field("notes")}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-yellow-400 text-black py-2 rounded-lg text-sm font-medium hover:bg-yellow-300 disabled:opacity-40"
                >
                  {saving ? "Saving..." : editId ? "Save Changes" : "Add Debt"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditId(null); setFormError(""); }}
                  className="flex-1 border border-zinc-700 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

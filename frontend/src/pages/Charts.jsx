import { useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { getMonthlySummary, getCategorySummary, getCategoryTrend, getCategories, getYears } from "../api";
import { MONTH_LABELS, currentYear, fmt } from "../utils";

const COLORS = [
  "#fbbf24", "#ef4444", "#22c55e", "#a78bfa", "#06b6d4",
  "#ec4899", "#10b981", "#f97316", "#6366f1", "#84cc16",
  "#14b8a6", "#f59e0b",
];

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 shadow-lg rounded-lg p-3 text-xs">
      <p className="font-medium text-zinc-300 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

const axisProps = { tick: { fontSize: 11, fill: "#71717a" }, axisLine: false, tickLine: false };
const gridProps = { strokeDasharray: "3 3", vertical: false, stroke: "#27272a" };

export default function Charts() {
  const [year, setYear] = useState(currentYear);
  const [years, setYears] = useState([currentYear]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [monthly, setMonthly] = useState([]);
  const [catSummary, setCatSummary] = useState([]);
  const [catTrend, setCatTrend] = useState([]);

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? [...y].sort((a, b) => b - a) : [currentYear]));
    getCategories().then((cats) => {
      setCategories(cats);
      if (cats.length) setSelectedCategory(cats[0]);
    });
  }, []);

  useEffect(() => {
    getMonthlySummary(year).then(setMonthly);
    getCategorySummary(year).then(setCatSummary);
  }, [year]);

  useEffect(() => {
    if (selectedCategory) getCategoryTrend(selectedCategory).then(setCatTrend);
  }, [selectedCategory]);

  const incomeExpenseData = monthly.map((m) => ({
    name: MONTH_LABELS[m.month],
    Income: m.income,
    Expenses: m.expenses,
    Balance: m.balance,
  }));

  const totalCatSpending = catSummary.reduce((s, c) => s + c.total, 0);
  const pieData = catSummary.slice(0, 12).map((c) => ({ name: c.category, value: c.total }));

  const trendData = catTrend.map((r) => ({
    name: `${MONTH_LABELS[r.month]} ${r.year}`,
    Amount: r.total,
  }));

  const priorYear = year - 1;
  const [priorMonthly, setPriorMonthly] = useState([]);
  useEffect(() => {
    if (years.includes(priorYear)) getMonthlySummary(priorYear).then(setPriorMonthly);
    else setPriorMonthly([]);
  }, [year, years]);

  const yoyData = MONTH_LABELS.slice(1).map((label, i) => {
    const m = i + 1;
    const curr = monthly.find((r) => r.month === m);
    const prior = priorMonthly.find((r) => r.month === m);
    return {
      name: label,
      [String(year)]: curr?.expenses ?? 0,
      [String(priorYear)]: prior?.expenses ?? 0,
    };
  });

  // Income projection for current year
  const isCurrentYear = year === currentYear;
  const monthsWithIncome = monthly.filter((m) => m.income > 0);
  const actualIncome = monthly.reduce((s, m) => s + m.income, 0);
  const lastRecordedMonth = monthsWithIncome.length > 0 ? Math.max(...monthsWithIncome.map((m) => m.month)) : 0;
  const avgMonthlyIncome = monthsWithIncome.length > 0 ? actualIncome / monthsWithIncome.length : 0;
  const remainingMonths = lastRecordedMonth > 0 ? 12 - lastRecordedMonth : 0;
  const projectedAdditional = avgMonthlyIncome * remainingMonths;
  const projectedTotal = actualIncome + projectedAdditional;

  const cardCls = "bg-zinc-900 border border-zinc-700 rounded-xl p-5";
  const selectCls = "bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Charts</h1>
        <select className={selectCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Row 1: Income vs Expenses + Balance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardCls}>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">{year} Income vs Expenses</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={incomeExpenseData}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
              <Bar dataKey="Income" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={cardCls}>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">{year} Monthly Balance</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={incomeExpenseData}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="Balance" radius={[3, 3, 0, 0]}>
                {incomeExpenseData.map((entry, index) => (
                  <Cell key={index} fill={entry.Balance >= 0 ? "#22c55e" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Income projection (current year only) */}
      {isCurrentYear && lastRecordedMonth > 0 && remainingMonths > 0 && (
        <div className={cardCls}>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">{year} Income Projection</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Income to Date</p>
              <p className="text-lg font-bold text-zinc-100">{fmt(Math.round(actualIncome))}</p>
              <p className="text-xs text-zinc-600">through {MONTH_LABELS[lastRecordedMonth]}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Avg / Month</p>
              <p className="text-lg font-bold text-zinc-100">{fmt(Math.round(avgMonthlyIncome))}</p>
              <p className="text-xs text-zinc-600">over {monthsWithIncome.length} months</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Est. Remaining</p>
              <p className="text-lg font-bold text-yellow-400">{fmt(Math.round(projectedAdditional))}</p>
              <p className="text-xs text-zinc-600">{remainingMonths} months × avg</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Projected Full Year</p>
              <p className="text-lg font-bold text-green-400">{fmt(Math.round(projectedTotal))}</p>
              <p className="text-xs text-zinc-600">based on current pace</p>
            </div>
          </div>
        </div>
      )}

      {/* Row 2: Pie + Category trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardCls}>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">{year} Spending by Category</h2>
          {pieData.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-12">No data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, value }) =>
                      totalCatSpending > 0 ? `${name} ${((value / totalCatSpending) * 100).toFixed(0)}%` : name
                    }
                    labelLine={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => fmt(v)}
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: 12 }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#e4e4e7" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Full breakdown table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                      <th className="text-left pb-2 pr-4 font-semibold">Category</th>
                      <th className="text-right pb-2 pr-4 font-semibold">Amount</th>
                      <th className="text-right pb-2 font-semibold">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catSummary.map((c, i) => (
                      <tr key={c.category} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/30">
                        <td className="py-1.5 pr-4 flex items-center gap-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: i < COLORS.length ? COLORS[i] : "#52525b" }}
                          />
                          <span className="text-zinc-300">{c.category}</span>
                        </td>
                        <td className="py-1.5 pr-4 text-right text-zinc-100">{fmt(c.total)}</td>
                        <td className="py-1.5 text-right text-zinc-400">
                          {totalCatSpending > 0 ? `${((c.total / totalCatSpending) * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                    {catSummary.length > 0 && (
                      <tr className="border-t border-zinc-700 font-semibold">
                        <td className="pt-2 pr-4 text-zinc-400 text-xs uppercase tracking-wide">Total</td>
                        <td className="pt-2 pr-4 text-right text-zinc-100">{fmt(totalCatSpending)}</td>
                        <td className="pt-2 text-right text-zinc-400">100%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className={cardCls}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Category Trend</h2>
            <select className={selectCls} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {trendData.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-12">No data for this category</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} angle={-30} textAnchor="end" height={50} />
                <YAxis {...axisProps} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                <Tooltip content={<DarkTooltip />} />
                <Line type="monotone" dataKey="Amount" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3, fill: "#fbbf24" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 3: Year-over-year */}
      {years.includes(priorYear) && (
        <div className={cardCls}>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">Year-over-Year Expenses: {priorYear} vs {year}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={yoyData}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
              <Bar dataKey={String(priorYear)} fill="#52525b" radius={[3, 3, 0, 0]} />
              <Bar dataKey={String(year)} fill="#fbbf24" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

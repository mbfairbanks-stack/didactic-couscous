import { useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { getMonthlySummary, getCategorySummary, getCategoryTrend, getCategories, getYears } from "../api";

const MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const currentYear = new Date().getFullYear();

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#ec4899", "#10b981", "#f97316", "#6366f1",
  "#84cc16", "#14b8a6",
];

const fmt = (n) => "$" + Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border shadow-lg rounded-lg p-3 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

export default function Charts() {
  const [year, setYear] = useState(currentYear);
  const [years, setYears] = useState([currentYear]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [monthly, setMonthly] = useState([]);
  const [catSummary, setCatSummary] = useState([]);
  const [catTrend, setCatTrend] = useState([]);

  useEffect(() => {
    getYears().then((y) => setYears(y.length ? y : [currentYear]));
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

  const pieData = catSummary.slice(0, 12).map((c) => ({ name: c.category, value: c.total }));

  // Build trend data: group by month label across all years
  const trendData = catTrend.map((r) => ({
    name: `${MONTH_LABELS[r.month]} ${r.year}`,
    Amount: r.total,
  }));

  // Year-over-year comparison: monthly expenses for selected year vs prior
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Charts</h1>
        <select className="border rounded px-3 py-1.5 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Row 1: Income vs Expenses bar + Balance line */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">{year} Income vs Expenses</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={incomeExpenseData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="Income" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">{year} Monthly Balance</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={incomeExpenseData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Balance" fill="#3b82f6" radius={[3, 3, 0, 0]}
                label={false}
              >
                {incomeExpenseData.map((entry, index) => (
                  <Cell key={index} fill={entry.Balance >= 0 ? "#22c55e" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Pie + Category trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">{year} Spending by Category</h2>
          {pieData.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-12">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Category Trend</h2>
            <select
              className="border rounded px-3 py-1 text-sm"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {trendData.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-12">No data for this category</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="Amount" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 3: Year-over-year */}
      {years.includes(priorYear) && (
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">Year-over-Year Expenses: {priorYear} vs {year}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={yoyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey={String(priorYear)} fill="#94a3b8" radius={[3, 3, 0, 0]} />
              <Bar dataKey={String(year)} fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

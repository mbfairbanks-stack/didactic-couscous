const BASE = "/api";
const TOKEN_KEY = "budget_token";

const getToken = () => localStorage.getItem(TOKEN_KEY) || "";

async function req(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.replace("/");
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    const msg = Array.isArray(detail)
      ? detail.map((e) => {
          const loc = Array.isArray(e.loc) ? e.loc.join(".") : "";
          return loc ? `[${loc}] ${e.msg}` : (e.msg || JSON.stringify(e));
        }).join("; ")
      : detail || "Request failed";
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Auth
export const loginApi = (password) =>
  fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  }).then(async (r) => {
    if (!r.ok) throw new Error("Incorrect password");
    return r.json();
  });

export const checkAuth = () =>
  fetch(`${BASE}/auth/check`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  }).then(async (r) => {
    if (!r.ok) return { ok: false, demo: false };
    return r.json();
  });

// Transactions
export const getTransactions = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
  return req(`/transactions${qs ? "?" + qs : ""}`);
};
export const createTransaction = (body) =>
  req("/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const updateTransaction = (id, body) =>
  req(`/transactions/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const deleteTransaction = (id) =>
  req(`/transactions/${id}`, { method: "DELETE" });

// Income
export const getIncome = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
  return req(`/income${qs ? "?" + qs : ""}`);
};
export const createIncome = (body) =>
  req("/income", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const updateIncome = (id, body) =>
  req(`/income/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const deleteIncome = (id) =>
  req(`/income/${id}`, { method: "DELETE" });

// Budget targets
export const getBudgetTargets = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
  return req(`/budget-targets${qs ? "?" + qs : ""}`);
};
export const createBudgetTarget = (body) =>
  req("/budget-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const updateBudgetTarget = (id, body) =>
  req(`/budget-targets/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const deleteBudgetTarget = (id) =>
  req(`/budget-targets/${id}`, { method: "DELETE" });
export const autoPopulateBudget = (body) =>
  req("/budget-targets/auto-populate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const copyBudgetFromMonth = (body) =>
  req("/budget-targets/copy-from-month", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Analytics
export const getMonthlySummary = (year) => req(`/summary/monthly?year=${year}`);
export const getCategorySummary = (year, month) => {
  const qs = month ? `?year=${year}&month=${month}` : `?year=${year}`;
  return req(`/summary/categories${qs}`);
};
export const getTotals = (year, month, throughMonth) => {
  const params = new URLSearchParams({ year });
  if (month) params.set("month", month);
  if (throughMonth) params.set("through_month", throughMonth);
  return req(`/summary/totals?${params}`);
};
export const getCategoryTrend = (category) =>
  req(`/summary/category-trend?category=${encodeURIComponent(category)}`);
export const getProjections = (year, month) =>
  req(`/summary/projections?year=${year}&month=${month}`);

// Settings
export const getSettings = () => req("/settings");
export const updateSettings = (body) =>
  req("/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Onboarding
export const getOnboardingStatus = () => req("/onboarding-status");

// Category definitions
export const getCategoryDefinitions = () => req("/category-definitions");
export const createCategoryDefinition = (body) =>
  req("/category-definitions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const updateCategoryDefinition = (id, body) =>
  req(`/category-definitions/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const deleteCategoryDefinition = (id) =>
  req(`/category-definitions/${id}`, { method: "DELETE" });

// Meta
export const getCategories = () => req("/categories");
export const getYears = () => req("/years");

// Debts
export const getDebts = () => req("/debts");
export const createDebt = (body) =>
  req("/debts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const updateDebt = (id, body) =>
  req(`/debts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const deleteDebt = (id) =>
  req(`/debts/${id}`, { method: "DELETE" });

// Merchant categories (audit)
export const getMerchantCategories = () => req("/merchant-categories");
export const bulkUpdateCategory = (body) =>
  req("/transactions/bulk-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const setMerchantCategory = (body) =>
  req("/transactions/set-merchant-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Import
export const importFile = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return req("/import", { method: "POST", body: fd });
};
export const parseCsv = ({ csv_text, format, source }) =>
  req("/parse-csv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: csv_text, format, source }) });
export const importCsvRows = ({ rows }) =>
  req("/import-csv-rows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows) });

// Deduplicate
export const deduplicate = () => req("/deduplicate", { method: "POST" });
export const cleanupSummary = () => req("/cleanup-summary", { method: "POST" });

// Category migration
export const getSuggestedRenames = () => req("/categories/suggested-renames");
export const migrateCategories = () => req("/categories/migrate", { method: "POST" });

// Export CSV (transactions)
export const exportTransactionsCsv = (params) => {
  const token = getToken();
  return fetch(BASE + "/transactions/export?" + new URLSearchParams(params), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transactions.csv";
      a.click();
    });
};

// Export
export const exportUrl = (year, month) => {
  const qs = month ? `?year=${year}&month=${month}` : `?year=${year}`;
  return `${BASE}/export${qs}`;
};

// AI Insights (streaming SSE)
export const streamInsights = async (year, month, onChunk, onDone, onError) => {
  const token = getToken();
  const res = await fetch(`${BASE}/insights?year=${year}&month=${month}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    onError(err.detail || "Request failed");
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") { onDone(); return; }
      try {
        const parsed = JSON.parse(payload);
        if (parsed.error) { onError(parsed.error); return; }
        if (parsed.text) onChunk(parsed.text);
      } catch {}
    }
  }
  onDone();
};


export const saveInsightsLog = (year, month, content) =>
  req("/insights/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year, month, content }) });

export const getInsightsLog = () => req("/insights/log");

export const deleteInsightsLog = (id) => req(`/insights/log/${id}`, { method: "DELETE" });

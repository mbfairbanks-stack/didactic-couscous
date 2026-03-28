const BASE = "/api";

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

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

// Meta
export const getCategories = () => req("/categories");
export const getYears = () => req("/years");

// Import
export const importFile = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return req("/import", { method: "POST", body: fd });
};

// Deduplicate
export const deduplicate = () => req("/deduplicate", { method: "POST" });
export const cleanupSummary = () => req("/cleanup-summary", { method: "POST" });

// Export
export const exportUrl = (year, month) => {
  const qs = month ? `?year=${year}&month=${month}` : `?year=${year}`;
  return `${BASE}/export${qs}`;
};

// AI Insights (streaming SSE)
export const streamInsights = async (year, month, onChunk, onDone, onError) => {
  const res = await fetch(`${BASE}/insights?year=${year}&month=${month}`);
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

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

const json = (body) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Recipes
export const getRecipes = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
  return req(`/recipes${qs ? "?" + qs : ""}`);
};
export const getRecipe = (id) => req(`/recipes/${id}`);
export const createRecipe = (body) => req("/recipes", { method: "POST", ...json(body) });
export const updateRecipe = (id, body) => req(`/recipes/${id}`, { method: "PUT", ...json(body) });
export const deleteRecipe = (id) => req(`/recipes/${id}`, { method: "DELETE" });

// Pantry
export const getPantry = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
  return req(`/pantry${qs ? "?" + qs : ""}`);
};
export const createPantryItem = (body) => req("/pantry", { method: "POST", ...json(body) });
export const bulkCreatePantryItems = (items) => req("/pantry/bulk", { method: "POST", ...json(items) });
export const updatePantryItem = (id, body) => req(`/pantry/${id}`, { method: "PUT", ...json(body) });
export const deletePantryItem = (id) => req(`/pantry/${id}`, { method: "DELETE" });

// Meal Plan
export const getMealPlan = (weekStart) => req(`/meal-plan?week_start=${weekStart}`);
export const setMealPlanEntry = (body) => req("/meal-plan", { method: "POST", ...json(body) });
export const deleteMealPlanEntry = (id) => req(`/meal-plan/${id}`, { method: "DELETE" });

// Prep Tasks
export const getPrepTasks = (weekStart) => req(`/prep-tasks?week_start=${weekStart}`);
export const createPrepTask = (body) => req("/prep-tasks", { method: "POST", ...json(body) });
export const updatePrepTask = (id, body) => req(`/prep-tasks/${id}`, { method: "PUT", ...json(body) });
export const deletePrepTask = (id) => req(`/prep-tasks/${id}`, { method: "DELETE" });

// Shopping List
export const getShoppingList = (weekStart) => req(`/shopping-list?week_start=${weekStart}`);

// Preferences
export const getPreferences = () => req("/preferences");
export const updatePreferences = (body) => req("/preferences", { method: "PUT", ...json(body) });

// AI streaming helpers
async function streamSSE(url, body, onChunk, onDone, onError) {
  let res;
  try {
    res = await fetch(`${BASE}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    onError(e.message);
    return;
  }
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
}

export const streamGenerateRecipe = (body, onChunk, onDone, onError) =>
  streamSSE("/ai/generate-recipe", body, onChunk, onDone, onError);

export const streamGenerateMealPlan = (body, onChunk, onDone, onError) =>
  streamSSE("/ai/generate-meal-plan", body, onChunk, onDone, onError);

export const streamRefreshMealSlot = (body, onChunk, onDone, onError) =>
  streamSSE("/ai/refresh-meal-slot", body, onChunk, onDone, onError);

export const streamGeneratePrepList = (body, onChunk, onDone, onError) =>
  streamSSE("/ai/generate-prep-list", body, onChunk, onDone, onError);

export const streamImportRecipeURL = (url, onChunk, onDone, onError) =>
  streamSSE("/ai/import-recipe/url", { url }, onChunk, onDone, onError);

export async function streamImportRecipePDF(file, onChunk, onDone, onError) {
  const fd = new FormData();
  fd.append("file", file);
  let res;
  try {
    res = await fetch(`${BASE}/ai/import-recipe/pdf`, { method: "POST", body: fd });
  } catch (e) {
    onError(e.message);
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    onError(err.detail || "Upload failed");
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
}

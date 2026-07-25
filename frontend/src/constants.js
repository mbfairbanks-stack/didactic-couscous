/**
 * Single source of truth for category groupings.
 * Keep in sync with backend/categories.py whenever categories change.
 */

export const NEEDS = new Set([
  // Non-discretionary
  "Mortgage", "Natural Gas", "Gas (Utility)", "Hydro", "Groceries",
  "Pets", "Pet Food & Toys", "Day Care", "Vet", "Pet Insurance",  // Day Care → Pets
  "Transportation", "Internet", "Security", "Mobile",
  "Insurance", "Car Insurance", "Home Insurance",
  "Municipal Taxes", "Debt Payment", "Medical",
]);

export const WANTS = new Set([
  // Discretionary
  "Entertainment", "Dining", "Take Out",
  "Clothes", "Gifts", "Charity", "Travel", "Hotels", "Flights", "Coffee",
  "Home", "Misc",
  // Transportation legacy (migrate → Transportation)
  "Fuel", "Gas", "Car Maintenance", "Car", "Car Payment", "Uber", "Parking",
  // Misc legacy
  "CC Fees", "CC Fee",
  "Alcohol", "Cannabis", "Fitness", "Newspaper", "Health & Beauty",
  "Subscriptions", "Entertainment Subscriptions",
  // Subscription legacy (migrate → Entertainment Subscriptions)
  "Apple Sub", "Spotify", "Prime Video", "Netflix", "YouTube",
  "Disney+", "Disney Plus Sub", "Paramount",
  "Newspaper", "Newspapers",
  "Canva Sub", "Ipsy Sub",
]);

let _committed = new Set();
let _needs = NEEDS;
let _wants = WANTS;

/** Called by SettingsContext once category definitions load from the API. */
export const updateCategoryGroups = (categories) => {
  _committed = new Set(categories.filter((c) => c.group === "Committed").map((c) => c.name));
  _needs = new Set(categories.filter((c) => c.group === "Needs").map((c) => c.name));
  _wants = new Set(categories.filter((c) => c.group === "Wants").map((c) => c.name));
};

export const getCategoryGroup = (category) => {
  if (_committed.has(category)) return "Committed";
  if (_needs.has(category)) return "Needs";
  if (_wants.has(category)) return "Wants";
  // Fallback to hardcoded sets in case DB groupings are missing/incomplete
  if (NEEDS.has(category)) return "Needs";
  if (WANTS.has(category)) return "Wants";
  return "Other";
};

// ── Stable chart colors ──────────────────────────────────────────────────────
// Semantic colors (green = income/good, red = expense/bad, yellow = accent)
// are reserved; series palette avoids them so meaning stays unambiguous.
export const SERIES_PALETTE = [
  "#a78bfa", "#06b6d4", "#ec4899", "#f97316", "#6366f1",
  "#84cc16", "#14b8a6", "#f59e0b", "#8b5cf6", "#0ea5e9",
  "#d946ef", "#a3e635",
];

/** Deterministic color per category name — same color on every chart. */
export const categoryColor = (name) => {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SERIES_PALETTE[h % SERIES_PALETTE.length];
};

// Canonical list for dropdowns (preferred names only, no legacy aliases)
export const ALL_CATEGORIES = [
  // Needs
  "Mortgage", "Natural Gas", "Hydro", "Groceries", "Pets",
  "Transportation", "Internet", "Security", "Mobile",
  "Insurance", "Municipal Taxes", "Debt Payment", "Medical",
  // Wants
  "Entertainment", "Dining", "Coffee", "Alcohol", "Cannabis",
  "Clothes", "Gifts", "Charity", "Travel", "Fitness",
  "Home", "Entertainment Subscriptions", "Subscriptions",
  "Health & Beauty", "Canva Sub", "Ipsy Sub", "Misc",
];

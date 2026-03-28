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

let _needs = NEEDS;
let _wants = WANTS;

/** Called by SettingsContext once category definitions load from the API. */
export const updateCategoryGroups = (categories) => {
  _needs = new Set(categories.filter((c) => c.group === "Needs").map((c) => c.name));
  _wants = new Set(categories.filter((c) => c.group === "Wants").map((c) => c.name));
};

export const getCategoryGroup = (category) => {
  if (_needs.has(category)) return "Needs";
  if (_wants.has(category)) return "Wants";
  return "Other";
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

/**
 * Single source of truth for category groupings.
 * Keep in sync with backend/categories.py whenever categories change.
 */

export const NEEDS = new Set([
  // Non-discretionary
  "Mortgage", "Natural Gas", "Gas (Utility)", "Hydro", "Groceries",
  "Pets", "Pet Food & Toys", "Day Care", "Vet", "Pet Insurance",
  "Transportation", "Internet", "Security", "Mobile",
  "Insurance", "Car Insurance", "Home Insurance",
  "Municipal Taxes", "Debt Payment", "Medical",
]);

export const WANTS = new Set([
  // Discretionary
  "Entertainment", "Dining", "Take Out",
  "Clothes", "Gifts", "Charity", "Travel", "Coffee",
  "Home", "Misc",
  // Transportation legacy (migrate → Transportation)
  "Fuel", "Gas", "Car Maintenance", "Car", "Car Payment", "Uber", "Parking",
  "Alcohol", "Cannabis", "Fitness", "Newspaper", "Health & Beauty",
  "Subscriptions", "Entertainment Subscriptions",
  // Subscription legacy (migrate → Entertainment Subscriptions)
  "Apple Sub", "Spotify", "Prime Video", "Netflix", "YouTube",
  "Disney+", "Disney Plus Sub", "Paramount",
  "Canva Sub", "Ipsy Sub",
]);

export const getCategoryGroup = (category) => {
  if (NEEDS.has(category)) return "Needs";
  if (WANTS.has(category)) return "Wants";
  return "Other";
};

// Canonical list for dropdowns (preferred names only, no legacy aliases)
export const ALL_CATEGORIES = [
  // Needs
  "Mortgage", "Natural Gas", "Hydro", "Groceries", "Pets",
  "Day Care", "Transportation", "Internet", "Security", "Mobile",
  "Insurance", "Municipal Taxes", "Debt Payment", "Medical",
  // Wants
  "Entertainment", "Dining", "Coffee", "Alcohol", "Cannabis",
  "Clothes", "Gifts", "Charity", "Travel", "Fitness",
  "Home", "Entertainment Subscriptions", "Subscriptions",
  "Health & Beauty", "Canva Sub", "Ipsy Sub",
  "Newspaper", "Misc",
];

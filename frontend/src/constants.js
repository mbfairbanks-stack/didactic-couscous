/**
 * Single source of truth for category groupings.
 * Keep in sync with backend/categories.py whenever categories change.
 */

export const NEEDS = new Set([
  // Non-discretionary
  "Mortgage", "Gas (Utility)", "Hydro", "Groceries",
  "Pets", "Pet Food & Toys", "Day Care", "Vet", "Pet Insurance",
  "Transportation", "Internet", "Security", "Mobile",
  "Insurance", "Car Insurance", "Home Insurance",
  "Municipal Taxes", "Debt Payment", "Reliance",
]);

export const WANTS = new Set([
  // Discretionary
  "Entertainment", "Dining", "Take Out",
  "Clothes", "Gifts", "Charity", "Travel", "Coffee",
  "Home", "Misc", "Gas", "Car", "Car Payment", "Uber",
  "Alcohol", "Cannabis", "Newspaper", "Health & Beauty",
  "Apple Sub", "Spotify", "Prime Video", "Netflix",
  "YouTube", "Canva Sub", "Ipsy Sub",
]);

export const getCategoryGroup = (category) => {
  if (NEEDS.has(category)) return "Needs";
  if (WANTS.has(category)) return "Wants";
  return "Other";
};

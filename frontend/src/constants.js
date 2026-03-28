export const NEEDS = new Set([
  "Mortgage", "Gas (Utility)", "Hydro", "Groceries",
  "Pets", "Pet Food & Toys", "Day Care", "Vet", "Pet Insurance",
  "Transportation", "Internet", "Security", "Mobile",
  "Insurance", "Car Insurance", "Home Insurance",
  "Municipal Taxes", "Debt Payment", "Reliance",
]);

export const WANTS = new Set([
  "Entertainment", "Dining", "Take Out", "Subscriptions",
  "Clothes", "Gifts", "Charity", "Travel", "Coffee",
  "Home", "Misc", "Gas", "Car", "Uber",
  "Alcohol", "Cannabis", "Newspaper", "Health & Beauty",
  "Apple Sub", "Spotify", "Prime Video", "Netflix",
  "YouTube", "Canva Sub", "Ipsy Sub",
]);

export const getCategoryGroup = (category) => {
  if (NEEDS.has(category)) return "Needs";
  if (WANTS.has(category)) return "Wants";
  return "Other";
};

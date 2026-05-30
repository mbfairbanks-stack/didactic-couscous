export const MONTH_LABELS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const currentYear = new Date().getFullYear();
export const currentMonth = new Date().getMonth() + 1;

/**
 * Format a number as a Canadian dollar amount.
 * @param {number|null} n
 * @param {number} decimals - decimal places (default 0)
 */
export const fmt = (n, decimals = 0) => {
  if (n == null) return "—";
  const fixed = Number(n).toFixed(decimals);
  const [int, dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return "$" + (dec !== undefined ? `${grouped}.${dec}` : grouped);
};

/** Format with 2 decimal places (for transaction amounts). */
export const fmtCents = (n) => fmt(n, 2);

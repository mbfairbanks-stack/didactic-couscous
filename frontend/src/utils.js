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
export const fmt = (n, decimals = 0) =>
  n == null
    ? "—"
    : "$" + Number(n).toLocaleString("en-CA", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

/** Format with 2 decimal places (for transaction amounts). */
export const fmtCents = (n) => fmt(n, 2);

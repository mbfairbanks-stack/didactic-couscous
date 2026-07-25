import { useState, useCallback } from "react";
import { currentYear, currentMonth } from "../utils";

function readInt(key, fallback) {
  const v = Number(localStorage.getItem(key));
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/**
 * Shared year/month period, persisted in localStorage so the selected
 * period survives navigation between pages (and reloads).
 */
export function usePeriod() {
  const [year, _setYear] = useState(() => readInt("period_year", currentYear));
  const [month, _setMonth] = useState(() => readInt("period_month", currentMonth));

  const setYear = useCallback((y) => {
    _setYear((prev) => {
      const next = typeof y === "function" ? y(prev) : y;
      localStorage.setItem("period_year", String(next));
      return next;
    });
  }, []);

  const setMonth = useCallback((m) => {
    _setMonth((prev) => {
      const next = typeof m === "function" ? m(prev) : m;
      localStorage.setItem("period_month", String(next));
      return next;
    });
  }, []);

  return { year, setYear, month, setMonth };
}

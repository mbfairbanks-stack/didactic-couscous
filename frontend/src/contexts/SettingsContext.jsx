import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getSettings, getCategoryDefinitions, getYears, getCategories } from "../api";
import { updateCategoryGroups } from "../constants";

/**
 * App-level constants, fetched once and shared.
 *
 * Settings, the category list and the year list change rarely but were being
 * refetched by every page on every navigation. They live here so a page render
 * costs only the queries specific to that page.
 */
const DEFAULT_SETTINGS = {
  household_name: "BudgetBot",
  person_1: "Person 1",
  person_2: "Person 2",
};

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  loading: true,
  years: [],
  categories: [],
  categoryDefs: [],
  refresh: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryDefs, setCategoryDefs] = useState([]);

  const refresh = useCallback(() => {
    const s = getSettings().then(setSettings).catch(() => {});
    const c = getCategoryDefinitions()
      .then((defs) => { setCategoryDefs(defs); updateCategoryGroups(defs); })
      .catch(() => {});
    const n = getCategories().then(setCategories).catch(() => {});
    const y = getYears().then(setYears).catch(() => {});
    return Promise.all([s, c, n, y]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <SettingsContext.Provider
      value={{ settings, loading, years, categories, categoryDefs, refresh }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);

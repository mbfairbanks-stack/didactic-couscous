import { createContext, useContext, useState, useEffect } from "react";
import { getSettings, getCategoryDefinitions, getYears } from "../api";
import { updateCategoryGroups } from "../constants";

const SettingsContext = createContext({
  settings: { household_name: "BudgetBot", person_1: "Person 1", person_2: "Person 2" },
  loading: true,
  years: [],
  refresh: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    household_name: "BudgetBot",
    person_1: "Person 1",
    person_2: "Person 2",
  });
  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState([]);

  const refresh = () => {
    const s = getSettings().then(setSettings).catch(() => {});
    const c = getCategoryDefinitions().then(updateCategoryGroups).catch(() => {});
    const y = getYears().then(setYears).catch(() => {});
    return Promise.all([s, c, y]).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, years, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);

import { createContext, useContext, useState, useEffect } from "react";
import { getSettings, getCategoryDefinitions } from "../api";
import { updateCategoryGroups } from "../constants";

const SettingsContext = createContext({
  settings: { household_name: "BudgetBot", person_1: "Person 1", person_2: "Person 2" },
  loading: true,
  refresh: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    household_name: "BudgetBot",
    person_1: "Person 1",
    person_2: "Person 2",
  });
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    return Promise.all([getSettings(), getCategoryDefinitions()])
      .then(([s, cats]) => {
        setSettings(s);
        updateCategoryGroups(cats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);

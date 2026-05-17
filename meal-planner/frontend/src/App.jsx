import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Nav from "./components/Nav";
import Onboarding from "./components/Onboarding";
import MealPlan from "./pages/MealPlan";
import Pantry from "./pages/Pantry";
import Recipes from "./pages/Recipes";
import PrepList from "./pages/PrepList";
import ShoppingList from "./pages/ShoppingList";
import Preferences from "./pages/Preferences";
import { getPreferences } from "./api";

export default function App() {
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        setNeedsOnboarding(!prefs?.onboarding_done);
      })
      .catch(() => {})
      .finally(() => setCheckedOnboarding(true));
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-stone-50">
        <Nav />
        <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full pb-24 sm:pb-6">
          <Routes>
            <Route path="/" element={<Navigate to="/meal-plan" replace />} />
            <Route path="/meal-plan" element={<MealPlan />} />
            <Route path="/pantry" element={<Pantry />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/prep-list" element={<PrepList />} />
            <Route path="/shopping-list" element={<ShoppingList />} />
            <Route path="/preferences" element={<Preferences />} />
          </Routes>
        </main>
        {checkedOnboarding && needsOnboarding && (
          <Onboarding onDone={() => setNeedsOnboarding(false)} />
        )}
      </div>
    </BrowserRouter>
  );
}

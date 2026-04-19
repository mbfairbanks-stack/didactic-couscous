import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Nav from "./components/Nav";
import MealPlan from "./pages/MealPlan";
import Pantry from "./pages/Pantry";
import Recipes from "./pages/Recipes";
import PrepList from "./pages/PrepList";
import ShoppingList from "./pages/ShoppingList";
import Preferences from "./pages/Preferences";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
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
      </div>
    </BrowserRouter>
  );
}

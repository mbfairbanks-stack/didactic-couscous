import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { ThemeProvider } from "./ThemeContext";
import Nav from "./components/Nav";
import Onboarding from "./components/Onboarding";
import Login from "./pages/Login";
import MealPlan from "./pages/MealPlan";
import Pantry from "./pages/Pantry";
import Recipes from "./pages/Recipes";
import PrepList from "./pages/PrepList";
import ShoppingList from "./pages/ShoppingList";
import Preferences from "./pages/Preferences";

function AppInner() {
  const { user, loading, markOnboardingDone } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 dark:bg-stone-950">
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
          <Route path="*" element={<Navigate to="/meal-plan" replace />} />
        </Routes>
      </main>
      {!user.onboarding_done && (
        <Onboarding onDone={markOnboardingDone} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

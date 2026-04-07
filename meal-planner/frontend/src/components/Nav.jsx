import { NavLink } from "react-router-dom";

const links = [
  { to: "/meal-plan", label: "Meal Plan" },
  { to: "/recipes", label: "Recipes" },
  { to: "/pantry", label: "Pantry" },
  { to: "/prep-list", label: "Prep List" },
  { to: "/shopping-list", label: "Shopping List" },
];

export default function Nav() {
  return (
    <header className="bg-green-700 text-white shadow">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-8 h-14">
        <span className="font-bold text-lg tracking-tight">Wetbanks Sous Chef</span>
        <nav className="flex gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `px-3 py-1 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white text-green-700"
                    : "hover:bg-green-600 text-green-100"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

import { NavLink } from "react-router-dom";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/budget", label: "Budget Planner" },
  { to: "/charts", label: "Charts" },
  { to: "/income", label: "Log Income" },
  { to: "/insights", label: "AI Insights" },
  { to: "/import", label: "Import / Export" },
];

export default function Nav() {
  return (
    <header className="bg-zinc-950 border-b border-zinc-800 shadow">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-8 h-14">
        <span className="font-bold text-lg tracking-tight text-yellow-400">
          $ wetbanks_budget
        </span>
        <nav className="flex gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `px-3 py-1 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-yellow-400 text-black"
                    : "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
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

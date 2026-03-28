import { NavLink } from "react-router-dom";
import { useSettings } from "../contexts/SettingsContext";
import { useAuth } from "../contexts/AuthContext";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/budget", label: "Budget" },
  { to: "/debts", label: "Debts" },
  { to: "/charts", label: "Charts" },
  { to: "/income", label: "Income" },
  { to: "/insights", label: "AI Insights" },
  { to: "/import", label: "Import" },
  { to: "/category-audit", label: "Audit" },
  { to: "/net-worth", label: "Net Worth" },
  { to: "/settings", label: "Settings" },
];

export default function Nav() {
  const { settings } = useSettings();
  const { logout, demo } = useAuth();
  const householdName = settings.household_name || "My Budget";

  return (
    <header className="bg-zinc-950 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-5 h-14">
        <NavLink to="/dashboard" className="shrink-0 flex items-center gap-2">
          <span className="text-yellow-400 font-bold text-base tracking-tight">{householdName}</span>
          <span className="text-zinc-600 text-sm font-medium">Budget</span>
          {demo && (
            <span className="text-xs font-semibold bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded px-1.5 py-0.5">
              Demo
            </span>
          )}
        </NavLink>

        <div className="w-px h-5 bg-zinc-800 shrink-0" />

        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0 flex-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-yellow-400 text-black"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={logout}
          className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-2"
          title="Sign out"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

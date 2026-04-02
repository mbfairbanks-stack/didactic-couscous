import { NavLink } from "react-router-dom";
import { useState } from "react";
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
  const householdName = settings.household_name || "BudgetBot";
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-zinc-950 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-3 h-14">
        <NavLink to="/dashboard" className="shrink-0 flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="text-yellow-400 font-bold text-base tracking-tight">{householdName}</span>
          <span className="text-zinc-600 text-sm font-medium hidden sm:inline">Budget</span>
          {demo && (
            <span className="text-xs font-semibold bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded px-1.5 py-0.5">
              Demo
            </span>
          )}
        </NavLink>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0 flex-1 mx-2">
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
        </div>

        <div className="flex-1 md:hidden" />

        <button
          onClick={logout}
          className="hidden md:block shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Sign out"
        >
          Sign out
        </button>

        {/* Hamburger */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="md:hidden shrink-0 flex flex-col justify-center items-center w-10 h-10 gap-1.5"
          aria-label="Toggle menu"
        >
          <span className={`block w-6 h-0.5 bg-zinc-400 transition-transform ${open ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`block w-6 h-0.5 bg-zinc-400 transition-opacity ${open ? "opacity-0" : ""}`} />
          <span className={`block w-6 h-0.5 bg-zinc-400 transition-transform ${open ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-3 grid grid-cols-2 gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-yellow-400 text-black"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="px-3 py-2.5 rounded-md text-sm font-medium text-zinc-500 hover:text-zinc-300 text-left"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}

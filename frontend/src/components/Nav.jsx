import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { useAuth } from "../contexts/AuthContext";

const mainLinks = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/budget", label: "Budget" },
  { to: "/debts", label: "Debts" },
  { to: "/charts", label: "Charts" },
  { to: "/income", label: "Income" },
  { to: "/insights", label: "AI Insights" },
  { to: "/net-worth", label: "Net Worth" },
  { to: "/settings", label: "Settings" },
];

const toolLinks = [
  { to: "/import", label: "Import Data" },
  { to: "/category-audit", label: "Category Audit" },
];

const linkCls = ({ isActive }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
    isActive ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
  }`;

export default function Nav() {
  const { settings } = useSettings();
  const { logout, demo } = useAuth();
  const location = useLocation();
  const householdName = settings.household_name || "BudgetBot";
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);

  // Close tools dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (toolsRef.current && !toolsRef.current.contains(e.target)) setToolsOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isToolActive = toolLinks.some((l) => location.pathname === l.to);

  return (
    <header className="bg-zinc-950 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-3 h-14">
        <NavLink to="/dashboard" className="shrink-0 flex items-center gap-2" onClick={() => setMenuOpen(false)}>
          <span className="text-yellow-400 font-bold text-base tracking-tight">{householdName}</span>
          <span className="text-zinc-600 text-sm font-medium hidden sm:inline">Budget</span>
          {demo && (
            <span className="text-xs font-semibold bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded px-1.5 py-0.5">Demo</span>
          )}
        </NavLink>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0 flex-1 mx-2">
          {mainLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkCls}>{l.label}</NavLink>
          ))}

          {/* Tools dropdown */}
          <div className="relative" ref={toolsRef}>
            <button
              onClick={() => setToolsOpen((o) => !o)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                isToolActive ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              }`}
            >
              Tools <span className="text-[10px]">▾</span>
            </button>
            {toolsOpen && (
              <div className="absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[140px]">
                {toolLinks.map((l) => (
                  <NavLink key={l.to} to={l.to} onClick={() => setToolsOpen(false)}
                    className={({ isActive }) => `block px-4 py-2 text-sm transition-colors ${isActive ? "text-yellow-400" : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"}`}>
                    {l.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="flex-1 md:hidden" />

        <button onClick={logout} className="hidden md:block shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors" title="Sign out">
          Sign out
        </button>

        {/* Hamburger */}
        <button onClick={() => setMenuOpen((o) => !o)} className="md:hidden shrink-0 flex flex-col justify-center items-center w-10 h-10 gap-1.5" aria-label="Toggle menu">
          <span className={`block w-6 h-0.5 bg-zinc-400 transition-transform ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`block w-6 h-0.5 bg-zinc-400 transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
          <span className={`block w-6 h-0.5 bg-zinc-400 transition-transform ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-3 grid grid-cols-2 gap-1">
          {[...mainLinks, ...toolLinks].map((l) => (
            <NavLink key={l.to} to={l.to} onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"}`
              }>
              {l.label}
            </NavLink>
          ))}
          <button onClick={() => { setMenuOpen(false); logout(); }} className="px-3 py-2.5 rounded-md text-sm font-medium text-zinc-500 hover:text-zinc-300 text-left">
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}

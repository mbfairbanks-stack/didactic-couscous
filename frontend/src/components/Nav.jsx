import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { useAuth } from "../contexts/AuthContext";

// Grouped navigation: 5 top-level entries instead of 13 flat links.
const NAV = [
  { label: "Dashboard", to: "/dashboard" },
  {
    label: "Spending",
    children: [
      { to: "/transactions", label: "Transactions" },
      { to: "/budget", label: "Budget" },
      { to: "/charts", label: "Charts" },
      { to: "/category-audit", label: "Category Audit" },
    ],
  },
  {
    label: "Wealth",
    children: [
      { to: "/net-worth", label: "Net Worth" },
      { to: "/debts", label: "Debts" },
      { to: "/retirement", label: "Retirement" },
    ],
  },
  { label: "Income", to: "/income" },
  {
    label: "Tools",
    children: [
      { to: "/import", label: "Import" },
      { to: "/insights", label: "AI Insights" },
      { to: "/settings", label: "Settings" },
    ],
  },
];

const linkCls = (active) =>
  `px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
    active
      ? "bg-yellow-400/15 text-yellow-400 ring-1 ring-yellow-400/30"
      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
  }`;

function GroupMenu({ group, pathname, openGroup, setOpenGroup }) {
  const isActive = group.children.some((c) => pathname.startsWith(c.to));
  const open = openGroup === group.label;
  return (
    <div className="relative">
      <button
        onClick={() => setOpenGroup(open ? null : group.label)}
        className={`${linkCls(isActive)} flex items-center gap-1`}
      >
        {group.label}
        <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[11rem] bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-50">
          {group.children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              onClick={() => setOpenGroup(null)}
              className={({ isActive }) =>
                `block px-3 py-2 text-sm transition-colors ${
                  isActive ? "text-yellow-400 bg-yellow-400/10" : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"
                }`
              }
            >
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Nav() {
  const { settings } = useSettings();
  const { logout, demo } = useAuth();
  const householdName = settings.household_name || "BudgetBot";
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const { pathname } = useLocation();
  const navRef = useRef(null);

  // Close dropdowns on navigation and on outside click
  useEffect(() => { setOpenGroup(null); setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    function onClick(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenGroup(null);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="bg-zinc-950/95 backdrop-blur border-b border-zinc-800/80 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-3 h-14" ref={navRef}>
        <NavLink to="/dashboard" className="shrink-0 flex items-center gap-2" onClick={() => setMenuOpen(false)}>
          <span className="text-yellow-400 font-bold text-base tracking-tight">{householdName}</span>
          <span className="text-zinc-600 text-sm font-medium hidden sm:inline">Budget</span>
          {demo && (
            <span className="text-xs font-semibold bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded px-1.5 py-0.5">Demo</span>
          )}
        </NavLink>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5 min-w-0 flex-1 mx-2">
          {NAV.map((item) =>
            item.children ? (
              <GroupMenu key={item.label} group={item} pathname={pathname} openGroup={openGroup} setOpenGroup={setOpenGroup} />
            ) : (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => linkCls(isActive)}>
                {item.label}
              </NavLink>
            )
          )}
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

      {/* Mobile drawer — grouped sections */}
      {menuOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-3 space-y-3">
          {NAV.map((item) =>
            item.children ? (
              <div key={item.label}>
                <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest px-1 mb-1">{item.label}</p>
                <div className="grid grid-cols-2 gap-1">
                  {item.children.map((c) => (
                    <NavLink key={c.to} to={c.to} onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `px-3 py-2.5 rounded-md text-sm font-medium transition-colors truncate ${isActive ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"}`
                      }>
                      {c.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-yellow-400 text-black" : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"}`
                }>
                {item.label}
              </NavLink>
            )
          )}
          <button onClick={() => { setMenuOpen(false); logout(); }} className="px-3 py-2.5 rounded-md text-sm font-medium text-zinc-500 hover:text-zinc-300 text-left w-full">
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}

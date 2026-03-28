import { NavLink, useLocation } from "react-router-dom";
import { useState, useRef, useEffect } from "react";

const primary = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/budget", label: "Budget" },
  { to: "/debts", label: "Debts" },
  { to: "/charts", label: "Charts" },
  { to: "/insights", label: "AI Insights" },
];

const secondary = [
  { to: "/income", label: "Log Income" },
  { to: "/import", label: "Import / Export" },
  { to: "/category-audit", label: "Category Audit" },
];

const linkCls = ({ isActive }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
    isActive
      ? "bg-yellow-400 text-black"
      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
  }`;

export default function Nav() {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const location = useLocation();
  const moreActive = secondary.some((l) => location.pathname.startsWith(l.to));

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="bg-zinc-950 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-6 h-14">

        {/* Brand */}
        <NavLink to="/dashboard" className="flex items-center gap-2 shrink-0">
          <span className="text-yellow-400 font-bold text-lg tracking-tight">Wetbanks</span>
          <span className="text-zinc-600 text-sm font-medium hidden sm:inline">Budget</span>
        </NavLink>

        <div className="w-px h-5 bg-zinc-800 shrink-0" />

        {/* Primary nav */}
        <nav className="flex items-center gap-0.5 overflow-x-auto">
          {primary.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkCls}>{l.label}</NavLink>
          ))}

          {/* More dropdown */}
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((o) => !o)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                moreActive
                  ? "bg-yellow-400 text-black"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              }`}
            >
              More
              <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {open && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
                {secondary.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `block px-4 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "text-yellow-400 bg-yellow-400/10"
                          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                      }`
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

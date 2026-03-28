import { NavLink } from "react-router-dom";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/budget", label: "Budget" },
  { to: "/debts", label: "Debts" },
  { to: "/charts", label: "Charts" },
  { to: "/insights", label: "AI Insights" },
  { to: "/import", label: "Import" },
  { to: "/category-audit", label: "Audit" },
];

export default function Nav() {
  return (
    <header className="bg-zinc-950 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-5 h-14">
        <NavLink to="/dashboard" className="shrink-0 flex items-center gap-2">
          <span className="text-yellow-400 font-bold text-base tracking-tight">Wetbanks</span>
          <span className="text-zinc-600 text-sm font-medium">Budget</span>
        </NavLink>

        <div className="w-px h-5 bg-zinc-800 shrink-0" />

        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0">
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
      </div>
    </header>
  );
}

import { NavLink } from "react-router-dom";
import { useAuth } from "../AuthContext";

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const BookIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);
const BoxIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const ClipboardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);
const CartIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
const CogIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const links = [
  { to: "/meal-plan",     label: "Plan",    fullLabel: "Meal Plan",     icon: <CalendarIcon /> },
  { to: "/recipes",       label: "Recipes", fullLabel: "Recipes",       icon: <BookIcon /> },
  { to: "/pantry",        label: "Pantry",  fullLabel: "Pantry",        icon: <BoxIcon /> },
  { to: "/prep-list",     label: "Prep",    fullLabel: "Prep List",     icon: <ClipboardIcon /> },
  { to: "/shopping-list", label: "Shop",    fullLabel: "Shopping List", icon: <CartIcon /> },
  { to: "/preferences",   label: "More",    fullLabel: "Preferences",   icon: <CogIcon /> },
];

export default function Nav() {
  const { user, logout } = useAuth();

  return (
    <>
      {/* Top header */}
      <header className="bg-stone-900 text-white shadow-md sticky top-0 z-30 safe-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-14">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-green-400 text-xl">🍴</span>
            <span className="font-semibold text-base sm:text-lg tracking-tight text-white">
              Wetbanks <span className="text-green-400">Sous Chef</span>
            </span>
          </div>
          {/* Desktop nav links */}
          <nav className="hidden sm:flex gap-1 ml-2 flex-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-green-500/20 text-green-400"
                      : "text-stone-400 hover:text-white hover:bg-white/10"
                  }`
                }
              >
                {l.fullLabel}
              </NavLink>
            ))}
          </nav>
          {/* User + logout */}
          <div className="hidden sm:flex items-center gap-3 ml-auto shrink-0">
            <span className="text-xs text-stone-400">
              👤 <span className="text-stone-300 font-medium">{user?.username}</span>
            </span>
            <button
              onClick={logout}
              className="text-xs text-stone-500 hover:text-stone-300 transition-colors px-2 py-1 rounded hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-stone-200 safe-bottom">
        <div className="flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 pt-2 pb-1 gap-0.5 transition-colors ${
                  isActive ? "text-green-600" : "text-stone-400"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`transition-transform ${isActive ? "scale-110" : ""}`}>
                    {l.icon}
                  </span>
                  <span className="text-[10px] font-medium">{l.label}</span>
                  <span className={`h-0.5 w-4 rounded-full transition-all ${isActive ? "bg-green-500" : "bg-transparent"}`} />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}

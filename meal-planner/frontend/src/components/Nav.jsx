import { NavLink } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useTheme } from "../ThemeContext";

// ── Logo SVG ─────────────────────────────────────────────────────────────────
function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Plate */}
      <circle cx="20" cy="22" r="14" fill="#16a34a" opacity="0.15" />
      <circle cx="20" cy="22" r="14" stroke="#16a34a" strokeWidth="1.5" fill="none" />
      {/* Chef hat */}
      <path d="M14 17 Q14 11 20 11 Q26 11 26 17" stroke="#16a34a" strokeWidth="1.8" fill="#16a34a" fillOpacity="0.2" strokeLinejoin="round" />
      <rect x="13" y="16" width="14" height="3" rx="1" fill="#16a34a" />
      {/* Fork */}
      <line x1="17" y1="20" x2="17" y2="29" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15.5" y1="20" x2="15.5" y2="24" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="18.5" y1="20" x2="18.5" y2="24" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round" />
      {/* Knife */}
      <line x1="23" y1="20" x2="23" y2="29" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M23 20 L25 22 L23 24" stroke="#16a34a" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

// ── Nav icons ────────────────────────────────────────────────────────────────
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

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="5" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

export default function Nav() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();

  return (
    <>
      {/* Top header */}
      <header className="bg-stone-900 dark:bg-black text-white shadow-md sticky top-0 z-30 safe-top border-b border-stone-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-4">

          {/* Logo + wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Logo size={30} />
            <div className="leading-none">
              <span className="font-bold text-base text-white tracking-tight">Sous Chef</span>
              <span className="block text-[10px] text-stone-500 font-medium tracking-wide uppercase leading-none mt-0.5">Meal Planner</span>
            </div>
          </div>

          {/* Desktop nav links */}
          <nav className="hidden sm:flex gap-0.5 ml-4 flex-1">
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

          {/* Right side: theme toggle + user */}
          <div className="hidden sm:flex items-center gap-2 ml-auto shrink-0">
            <button
              onClick={toggle}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
            {user && (
              <>
                <span className="text-xs text-stone-500 px-1">
                  <span className="text-stone-300 font-medium">{user.username}</span>
                </span>
                <button
                  onClick={logout}
                  className="text-xs text-stone-500 hover:text-stone-300 transition-colors px-2 py-1 rounded hover:bg-white/10"
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur border-t border-stone-200 dark:border-stone-800 safe-bottom">
        <div className="flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 pt-2 pb-1 gap-0.5 transition-colors ${
                  isActive ? "text-green-600 dark:text-green-400" : "text-stone-400 dark:text-stone-500"
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
          {/* Theme toggle in mobile tab bar */}
          <button
            onClick={toggle}
            className="flex flex-col items-center justify-center flex-1 pt-2 pb-1 gap-0.5 text-stone-400 dark:text-stone-500"
          >
            {dark ? <SunIcon /> : <MoonIcon />}
            <span className="text-[10px] font-medium">{dark ? "Light" : "Dark"}</span>
            <span className="h-0.5 w-4 rounded-full bg-transparent" />
          </button>
        </div>
      </nav>
    </>
  );
}

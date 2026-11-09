import { useState, useEffect, useRef, ReactNode, FormEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import AccountMenu from "./AccountMenu";

export const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Sidebar resize: drag the right edge between these widths.
// Below the threshold it collapses to icon-only; at or above it, icon + label (Kahoot-style).
const MIN_WIDTH = 90;
const MAX_WIDTH = 180;
const COLLAPSE_THRESHOLD = 120;
const DEFAULT_WIDTH = 180;

// Add future features here — one entry each.
export const navItems: { to: string; label: string; icon: ReactNode }[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg {...iconProps}>
        <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    to: "/sessions",
    label: "Quiz Session",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8l6 4-6 4z" />
      </svg>
    ),
  },
  {
    to: "/qod",
    label: "QOD",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7" />
        <path d="M12 17h.01" />
      </svg>
    ),
  },
  {
    to: "/feedback",
    label: "Feedback",
    icon: (
      <svg {...iconProps}>
        <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    to: "/reports",
    label: "Reports",
    icon: (
      <svg {...iconProps}>
        <path d="M5 21V10M12 21V4M19 21v-8" />
      </svg>
    ),
  },
];

// Sits at the bottom of the menu (where Log Out used to be).
export const trashItem = {
  to: "/trash",
  label: "Trash",
  icon: (
    <svg {...iconProps}>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  ),
};

function NavItem({
  to,
  label,
  icon,
  onClick,
  collapsed,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={`group flex rounded-lg transition ${
        collapsed
          ? "flex-col items-center gap-1 py-2" // Stacked vertically when collapsed (label under icon)
          : "flex-row items-center gap-3 px-3 py-2.5 md:hover:bg-brand-text/10" // Side-by-side when expanded; whole row hovers grey, desktop only
      }`}
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex items-center justify-center shrink-0 w-9 h-9 rounded-full transition ${
              isActive
                ? "bg-brand-accent text-black"
                : collapsed
                ? "text-brand-text/80 group-hover:bg-brand-text/10" // icon-only hover, collapsed mode
                : "text-brand-text/80" // expanded mode: the row itself hovers instead (above)
            }`}
          >
            {icon}
          </span>
          <span
            className={`text-base tracking-tight font-medium truncate ${
              collapsed ? "text-center leading-tight" : ""
            } ${isActive ? "text-brand-accent" : "text-brand-text/70"}`}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

// function AccountMenu({
//   name,
//   onSettings,
//   onLogout,
//   theme,
//   onToggleTheme,
// }: {
//   name: string;
//   onSettings: () => void;
//   onLogout: () => void;
//   theme: "dark" | "light";
//   onToggleTheme: () => void;
// }) {
//   const [open, setOpen] = useState(false);
//   const ref = useRef<HTMLDivElement>(null);

//   useEffect(() => {
//     if (!open) return;

//     const handleClickOutside = (e: MouseEvent) => {
//       if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
//     };
//     const handleEscape = (e: KeyboardEvent) => {
//       if (e.key === "Escape") setOpen(false);
//     };

//     document.addEventListener("mousedown", handleClickOutside);
//     document.addEventListener("keydown", handleEscape);
//     return () => {
//       document.removeEventListener("mousedown", handleClickOutside);
//       document.removeEventListener("keydown", handleEscape);
//     };
//   }, [open]);

//   return (
//     <div ref={ref} className="relative">
//       <button
//         onClick={() => setOpen((o) => !o)}
//         className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-brand-text/10 transition"
//       >
//         <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
//           <svg {...iconProps} width={20} height={20}>
//             <circle cx="12" cy="8" r="4" />
//             <path d="M4 21a8 8 0 0 1 16 0" />
//           </svg>
//         </span>
//         <span className="hidden sm:inline font-medium max-w-[10rem] truncate">{name}</span>
//       </button>

//       {open && (
//         <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-brand-text/10 rounded-xl shadow-2xl shadow-black/50 py-1 z-50">
//           <button
//             onClick={() => {
//               setOpen(false);
//               onSettings();
//             }}
//             className="w-full flex items-center gap-3 px-4 py-2 text-sm text-brand-text hover:bg-brand-text/10"
//           >
//             <svg {...iconProps} width={18} height={18}>
//               <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
//             </svg>
//             Settings
//           </button>
//           <button
//             onClick={() => {
//               setOpen(false);
//               onToggleTheme();
//             }}
//             className="w-full flex items-center gap-3 px-4 py-2 text-sm text-brand-text hover:bg-brand-text/10"
//           >
//             {theme === "dark" ? (
//               <svg {...iconProps} width={18} height={18}>
//                 <circle cx="12" cy="12" r="4" />
//                 <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
//               </svg>
//             ) : (
//               <svg {...iconProps} width={18} height={18}>
//                 <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
//               </svg>
//             )}
//             {theme === "dark" ? "Light Mode" : "Dark Mode"}
//           </button>
//           <button
//             onClick={() => {
//               setOpen(false);
//               onLogout();
//             }}
//             className="w-full flex items-center gap-3 px-4 py-2 text-sm text-brand-text hover:bg-brand-text/10"
//           >
//             {/* arrow-right-from-bracket */}
//             <svg {...iconProps} width={18} height={18}>
//               <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
//             </svg>
//             Log Out
//           </button>
//         </div>
//       )}
//     </div>
//   );
// }

function AppLayoutInner() {
  const { host, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Hamburger: fully visible vs completely hidden. Independent of the resize width below.
  const [navOpen, setNavOpen] = useState(() => window.innerWidth >= 768);
  const [headerSearch, setHeaderSearch] = useState("");

  // Theme now lives in ThemeContext (below) so portaled dropdown/calendar panels —
  // which render outside this component's DOM subtree via createPortal — can still
  // read the current theme through React context (context follows the component
  // tree, not the DOM tree) and apply data-theme to their own portal root.
  const { theme, toggleTheme } = useTheme();

  // Resizable edge: drag width. Below COLLAPSE_THRESHOLD = icon-only, at/above = icon + label.
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const collapsed = sidebarWidth < COLLAPSE_THRESHOLD;

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const asideLeft = asideRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - asideLeft;
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };
    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    // Nice-to-have while dragging: proper cursor everywhere, no accidental text selection.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const closeOnPhone = () => {
    if (window.innerWidth < 768) setNavOpen(false);
  };

  // Dashboard search: jumps to Quiz Session with your words already in its search box.
  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = headerSearch.trim();
    navigate(q ? `/sessions?q=${encodeURIComponent(q)}` : "/sessions");
    setHeaderSearch("");
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-brand-bg text-brand-text flex flex-col">
      {/* Header: ☰ + Senpaii on the left, account on the right */}
      {/* <header className="shrink-0 z-40 h-16 flex items-center gap-3 px-4 md:px-6 border-b border-white/10 bg-brand-bg"> */}
      <header className="fixed top-0 inset-x-0 z-40 h-16 flex items-center gap-3 px-4 md:px-6 border-b border-brand-text/10 bg-brand-bg">
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setNavOpen((o) => !o)}
            aria-label={navOpen ? "Close menu" : "Open menu"}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-brand-text hover:bg-brand-text/10 transition"
          >
            <svg {...iconProps} width={24} height={24}>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-2xl font-extrabold text-brand-accent">Senpaii</span>
        </div>

        {/* Centre: the search bar (Dashboard only) */}
        <div className="flex-1 flex justify-center min-w-0">
          {pathname === "/dashboard" && (
            <form onSubmit={handleSearch} className="relative w-full max-w-xl">
              <svg
                {...iconProps}
                width={18}
                height={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text/50 pointer-events-none"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Search quizzes..."
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                className="w-full bg-slate-800 rounded-full pl-11 pr-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
              />
            </form>
          )}
        </div>

        <div className="shrink-0">
          <AccountMenu
            name={host?.name || "Account"}
            onSettings={() => navigate("/settings")}
            onLogout={logout}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        </div>
      </header>

      <div className="flex flex-1 min-h-0 mt-16">
        {/* Dark backdrop behind the menu on phones */}
        {navOpen && (
          <div
            className="fixed inset-x-0 top-16 bottom-0 bg-black/60 z-20 md:hidden"
            onClick={() => setNavOpen(false)}
          />
        )}

        {/* Resizable left menu */}
        <aside
          ref={asideRef}
          style={{ width: navOpen ? sidebarWidth : 0 }}
          className={`${
            navOpen ? "flex" : "hidden"
                    } flex-col fixed md:static top-16 left-0 z-30 h-[calc(100dvh-4rem)] md:h-full shrink-0 bg-brand-bg border-r border-brand-text/10 py-3 px-2 overflow-x-hidden overflow-y-auto ${
            isResizing ? "" : "transition-[width] duration-150"
          }`}
        >
          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} onClick={closeOnPhone} />
            ))}
          </nav>

          <div className="border-t border-brand-text/10 pt-2">
            <NavItem {...trashItem} collapsed={collapsed} onClick={closeOnPhone} />
          </div>

          {/* Drag handle: the right edge of the sidebar */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
            title="Drag to resize"
            className="hidden md:block absolute top-0 right-0 h-full w-0.5 cursor-col-resize active:bg-brand-accent/60 "
          />
        </aside>

        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto px-6 md:px-10 pb-6 md:pb-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function AppLayout() {
  return <AppLayoutInner />;
}
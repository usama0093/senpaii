// import { useState, useRef, useEffect } from "react";
// import { NavLink, useNavigate } from "react-router-dom";
// import { useAuth } from "../context/AuthContext";
// import { useTheme } from "../context/ThemeContext";
// import AccountMenu from "./AccountMenu";
// import { navItems, trashItem, iconProps } from "./AppLayout";

// // QuizEditor/QodQuizEditor render full-screen with no sidebar at all, so their
// // hamburger can't open a sidebar the way AppLayout's does — it opens this flyout
// // of the same nav links instead (option B from MASTER CONTEXT: a real list of
// // pages to jump to, not just a single link back to Dashboard).
// function NavFlyout() {
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
//         aria-label={open ? "Close menu" : "Open menu"}
//         className="w-10 h-10 flex items-center justify-center rounded-lg text-brand-text hover:bg-brand-text/10 transition"
//       >
//         <svg {...iconProps} width={24} height={24}>
//           <path d="M4 6h16M4 12h16M4 18h16" />
//         </svg>
//       </button>

//       {open && (
//         <div className="absolute left-0 mt-2 w-56 bg-slate-800 border border-brand-text/10 rounded-xl shadow-2xl shadow-black/50 py-1 z-50">
//           {[...navItems, trashItem].map((item) => (
//             <NavLink
//               key={item.to}
//               to={item.to}
//               onClick={() => setOpen(false)}
//               className="flex items-center gap-3 px-4 py-2 text-sm text-brand-text hover:bg-brand-text/10"
//             >
//               <span className="w-5 h-5 shrink-0 flex items-center justify-center">{item.icon}</span>
//               {item.label}
//             </NavLink>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

// export default function EditorHeader() {
//   const { host, logout } = useAuth();
//   const navigate = useNavigate();
//   const { theme, toggleTheme } = useTheme();

//   return (
//     <header className="fixed top-0 inset-x-0 z-40 h-16 flex items-center gap-3 px-4 md:px-6 border-b border-brand-text/10 bg-brand-bg">
//       <div className="flex items-center gap-3 shrink-0">
//         <NavFlyout />
//         <span className="text-2xl font-extrabold text-brand-accent">Senpaii</span>
//       </div>

//       <div className="flex-1" />

//       <div className="shrink-0">
//         <AccountMenu
//           name={host?.name || "Account"}
//           onSettings={() => navigate("/settings")}
//           onLogout={logout}
//           theme={theme}
//           onToggleTheme={toggleTheme}
//         />
//       </div>
//     </header>
//   );
// }


import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import AccountMenu from "./AccountMenu";
import { navItems, trashItem, iconProps } from "./AppLayout";

// QuizEditor/QodQuizEditor render full-screen with no reserved sidebar space, so
// this never pushes content the way AppLayout's sidebar does at desktop widths —
// it's always an overlay (fixed + backdrop), the same way AppLayout's own sidebar
// behaves on mobile. No layout change to the page underneath, at any width.
function NavOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-56 bg-brand-bg border-r border-brand-text/10 py-3 px-2 overflow-y-auto transition-transform duration-200 flex flex-col ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-2xl font-extrabold text-brand-accent">Senpaii</span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-brand-text hover:bg-brand-text/10 transition"
          >
            <svg {...iconProps} width={20} height={20}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="space-y-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-brand-text/80 hover:bg-brand-text/10"
            >
              <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full">{item.icon}</span>
              <span className="text-base font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-brand-text/10 mt-2 pt-2">
          <NavLink
            to={trashItem.to}
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-brand-text/80 hover:bg-brand-text/10"
          >
            <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full">{trashItem.icon}</span>
            <span className="text-base font-medium">{trashItem.label}</span>
          </NavLink>
        </div>
      </aside>
    </>
  );
}

export default function EditorHeader() {
  const { host, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 h-16 flex items-center gap-3 px-4 md:px-6 border-b border-brand-text/10 bg-brand-bg">
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-brand-text hover:bg-brand-text/10 transition"
          >
            <svg {...iconProps} width={24} height={24}>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-2xl font-extrabold text-brand-accent">Senpaii</span>
        </div>

        <div className="flex-1" />

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

      <NavOverlay open={navOpen} onClose={() => setNavOpen(false)} />
    </>
  );
}
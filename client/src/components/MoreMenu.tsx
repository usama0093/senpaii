// import { useState, useEffect, useRef } from "react";

// interface MenuItem {
//   label: string;
//   onClick: () => void;
//   danger?: boolean;
// }

// export default function MoreMenu({ items }: { items: MenuItem[] }) {
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
//     <div ref={ref} className="relative shrink-0">
//       <button
//         onClick={() => setOpen((o) => !o)}
//         aria-label="More options"
//         className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
//       >
//         <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
//           <circle cx="12" cy="5" r="2" />
//           <circle cx="12" cy="12" r="2" />
//           <circle cx="12" cy="19" r="2" />
//         </svg>
//       </button>

//       {open && (
//         <div className="absolute right-0 mt-1 w-40 bg-slate-800 border border-white/10 rounded-xl shadow-2xl shadow-black/50 py-1 z-20">
//           {items.map((item) => (
//             <button
//               key={item.label}
//               onClick={() => {
//                 setOpen(false);
//                 item.onClick();
//               }}
//               className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 ${
//                 item.danger ? "text-red-400" : "text-white"
//               }`}
//             >
//               {item.label}
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

const MENU_WIDTH = 160; // 10rem
const ITEM_HEIGHT = 36; // one menu row
const GAP = 4;

export default function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Open below the button, or above it if there is no room underneath.
    const menuHeight = items.length * ITEM_HEIGHT + 10;
    const fitsBelow = rect.bottom + GAP + menuHeight <= window.innerHeight;
    const top = fitsBelow ? rect.bottom + GAP : Math.max(8, rect.top - GAP - menuHeight);
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));

    setPos({ top, left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    // The menu is positioned on the screen, so close it if the page moves.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div className="shrink-0">
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-label="More options"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-brand-text/70 hover:bg-brand-text/10 hover:text-brand-text"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {/* Drawn on top of the whole page, so no card can cover it */}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            data-theme={theme}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="bg-slate-800 border border-brand-text/10 rounded-xl shadow-2xl shadow-black/50 py-1 z-50"
          >
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-text/10 ${
                  item.danger ? "text-red-400" : "text-brand-text"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
import { useState, useRef, useEffect } from "react";

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Extracted from AppLayout.tsx so full-screen pages with no sidebar (QuizEditor,
// QodQuizEditor) can mount the same account/theme/log-out menu via EditorHeader,
// instead of each page building its own.
export default function AccountMenu({
  name,
  onSettings,
  onLogout,
  theme,
  onToggleTheme,
}: {
  name: string;
  onSettings: () => void;
  onLogout: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-brand-text/10 transition"
      >
        <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
          <svg {...iconProps} width={20} height={20}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        </span>
        <span className="hidden sm:inline font-medium max-w-[10rem] truncate">{name}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-brand-text/10 rounded-xl shadow-2xl shadow-black/50 py-1 z-50">
          <button
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-brand-text hover:bg-brand-text/10"
          >
            <svg {...iconProps} width={18} height={18}>
              <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
            </svg>
            Settings
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onToggleTheme();
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-brand-text hover:bg-brand-text/10"
          >
            {theme === "dark" ? (
              <svg {...iconProps} width={18} height={18}>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg {...iconProps} width={18} height={18}>
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-brand-text hover:bg-brand-text/10"
          >
            <svg {...iconProps} width={18} height={18}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
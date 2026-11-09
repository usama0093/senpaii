import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

export interface SettingsToggle {
  key: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

interface Props {
  toggles?: SettingsToggle[];
  disabled?: boolean; // icon shown but not clickable (e.g. Feedback, no settings yet)
  emptyMessage?: string; // shown when toggles is empty/undefined (not disabled)
  fixed?: boolean; // true = fixed top-right corner (Game PIN); false = inline (QOD/Feedback)
}

const MENU_WIDTH = 280;
const GAP = 6;

export default function SettingsMenu({
  toggles,
  disabled = false,
  emptyMessage = "No settings yet",
  fixed = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  // Appended to every caller's own toggles, so Light/Dark Mode is reachable from
  // the Settings icon on any host screen that renders this component, without
  // each page having to wire it up itself (see MASTER CONTEXT item 3).
  const allToggles: SettingsToggle[] = [
    ...(toggles ?? []),
    { key: "theme", label: "Light Mode", checked: theme === "light", onChange: () => toggleTheme() },
  ];

  const toggle = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rows = allToggles.length;
    const menuHeight = rows * 56 + 40;
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
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const buttonClasses = fixed
    ? "chrome-panel fixed top-6 right-6 z-20 w-11 h-11 flex items-center justify-center rounded-full border border-brand-text/10 text-brand-text/80 hover:text-brand-text transition disabled:opacity-40 disabled:cursor-not-allowed"
    : "chrome-panel w-9 h-9 flex items-center justify-center rounded-lg border border-brand-text/10 text-brand-text/80 hover:text-brand-text transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0";

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        disabled={disabled}
        aria-label="Settings"
        title={disabled ? "Settings — coming soon" : "Settings"}
        className={buttonClasses}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open &&
        !disabled &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="bg-slate-800 border border-brand-text/10 rounded-xl shadow-2xl shadow-black/50 p-3 z-50"
          >
            <p className="text-brand-text/50 text-xs font-bold uppercase tracking-wide px-1 mb-2">Settings</p>
            <div className="space-y-1">
              {allToggles.map((t) => (
                <label
                  key={t.key}
                  className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-brand-text/5 cursor-pointer"
                >
                  <span className="text-sm text-brand-text">{t.label}</span>
                  <input
                    type="checkbox"
                    checked={t.checked}
                    onChange={(e) => t.onChange(e.target.checked)}
                    className="w-4 h-4 accent-brand-accent shrink-0"
                  />
                </label>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

export type SortOption = "newest" | "oldest" | "az" | "za";

export const DEFAULT_SORT: SortOption = "newest";

// Type-guard for parsing `?sort=` back out of the URL safely.
export const isSortOption = (v: string | null): v is SortOption =>
  v === "newest" || v === "oldest" || v === "az" || v === "za";

const OPTIONS: { key: SortOption; label: string }[] = [
  { key: "newest", label: "Newest First" },
  { key: "oldest", label: "Oldest First" },
  { key: "az", label: "A–Z" },
  { key: "za", label: "Z–A" },
];

// Generic comparator. Defaults assume an item with `title` and `createdAt` fields;
// pass getDate/getTitle accessors for shapes that use different field names (e.g. Reports' `when`).
export function sortItems<T>(
  items: T[],
  sort: SortOption,
  getDate: (item: T) => string = (item) => (item as any).createdAt,
  getTitle: (item: T) => string = (item) => (item as any).title
): T[] {
  const copy = [...items];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime());
    case "oldest":
      return copy.sort((a, b) => new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime());
    case "az":
      return copy.sort((a, b) => getTitle(a).localeCompare(getTitle(b)));
    case "za":
      return copy.sort((a, b) => getTitle(b).localeCompare(getTitle(a)));
  }
}

const PANEL_WIDTH = 176; // w-44
const ESTIMATED_HEIGHT = 180; // 4 rows, roughly
const GAP = 4;

interface PanelPos {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export default function SortDropdown({
  value,
  onChange,
}: {
  value: SortOption;
  onChange: (sort: SortOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos>({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  const close = () => setOpen(false);

  // Opens on whichever side/direction actually has room, measured from the button's
  // real position on screen — same approach as DateRangeFilter.
  const openPanel = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom - GAP - 8;
    const spaceAbove = rect.top - GAP - 8;
    const openBelow = spaceBelow >= ESTIMATED_HEIGHT || spaceBelow >= spaceAbove;

    const spaceRight = window.innerWidth - rect.left - 8;
    const spaceLeft = rect.right - 8;
    const openRight = spaceRight >= PANEL_WIDTH || spaceRight >= spaceLeft;

    setPos({
      left: openRight ? Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8) : undefined,
      right: openRight ? undefined : Math.max(8, window.innerWidth - rect.right),
      top: openBelow ? rect.bottom + GAP : undefined,
      bottom: openBelow ? undefined : window.innerHeight - rect.top + GAP,
    });
    setOpen(true);
  };

  const toggle = () => (open ? close() : openPanel());

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const handleScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", close);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const currentLabel = OPTIONS.find((o) => o.key === value)?.label ?? "Sort";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent text-brand-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 7h10M7 12h7M7 17h4" />
        </svg>
        {currentLabel}
      </button>

      {/* Drawn on top of the whole page, so no card or section can cover or clip it */}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            data-theme={theme}
            style={{
              position: "fixed",
              left: pos.left,
              right: pos.right,
              top: pos.top,
              bottom: pos.bottom,
              width: PANEL_WIDTH,
            }}
            className="bg-slate-800 border border-brand-text/10 rounded-xl shadow-2xl shadow-black/50 py-1 z-50"
          >
            {OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  onChange(opt.key);
                  close();
                }}
                className={`w-full text-left px-4 py-2 text-sm transition ${
                  opt.key === value ? "text-brand-accent bg-brand-text/5" : "text-brand-text hover:bg-brand-text/10"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
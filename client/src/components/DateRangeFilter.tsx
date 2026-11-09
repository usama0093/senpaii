import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

export interface DateRange {
  from: string | null; // "YYYY-MM-DD" (your local date)
  to: string | null;
}

export const EMPTY_RANGE: DateRange = { from: null, to: null };

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const display = (key: string) => {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`; // always DD/MM/YYYY
};

// Does this date fall inside the chosen range? (No range chosen = everything.)
export function isInRange(date: string | Date, range: DateRange): boolean {
  if (!range.from || !range.to) return true;
  const key = toKey(new Date(date));
  return key >= range.from && key <= range.to;
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toKey(d);
};

const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: "Today", range: () => ({ from: daysAgo(0), to: daysAgo(0) }) },
  { label: "Yesterday", range: () => ({ from: daysAgo(1), to: daysAgo(1) }) },
  { label: "Last 7 days", range: () => ({ from: daysAgo(6), to: daysAgo(0) }) },
  { label: "Last 30 days", range: () => ({ from: daysAgo(29), to: daysAgo(0) }) },
  {
    label: "This month",
    range: () => {
      const now = new Date();
      return { from: toKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: daysAgo(0) };
    },
  },
];

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// Panel sizing used to decide which side/direction it opens in.
const PANEL_WIDTH = 288; // w-72
const ESTIMATED_HEIGHT = 420; // presets + month nav + calendar grid + footer, roughly
const MIN_HEIGHT = 240;
const GAP = 4;

interface PanelPos {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export default function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null); // first date picked, waiting for the second
  const start = value.from ? new Date(value.from + "T00:00:00") : new Date();
  const [view, setView] = useState({ year: start.getFullYear(), month: start.getMonth() });
  const [pos, setPos] = useState<PanelPos>({ left: 0, top: 0, maxHeight: ESTIMATED_HEIGHT });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  const close = () => setOpen(false);

  // Opens on whichever side (left/right) and direction (above/below) actually has room,
  // measured from the button's real position on screen — never a fixed corner.
  const openPanel = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom - GAP - 8;
    const spaceAbove = rect.top - GAP - 8;
    const openBelow = spaceBelow >= ESTIMATED_HEIGHT || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(MIN_HEIGHT, Math.min(ESTIMATED_HEIGHT, openBelow ? spaceBelow : spaceAbove));

    const spaceRight = window.innerWidth - rect.left - 8;
    const spaceLeft = rect.right - 8;
    const openRight = spaceRight >= PANEL_WIDTH || spaceRight >= spaceLeft;

    setPos({
      left: openRight ? Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8) : undefined,
      right: openRight ? undefined : Math.max(8, window.innerWidth - rect.right),
      top: openBelow ? rect.bottom + GAP : undefined,
      bottom: openBelow ? undefined : window.innerHeight - rect.top + GAP,
      maxHeight,
    });
    setOpen(true);
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setAnchor(null);
    openPanel();
  };

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
    // The panel is positioned on the screen, so close it if the page behind it moves.
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

  const todayKey = toKey(new Date());
  const active = !!value.from && !!value.to;
  const label = active
    ? value.from === value.to
      ? display(value.from as string)
      : `${display(value.from as string)} – ${display(value.to as string)}`
    : "All dates";

  const clear = () => {
    setAnchor(null);
    onChange(EMPTY_RANGE);
  };

  // First click picks a date; a second click makes it a range.
  const pickDay = (key: string) => {
    if (!anchor) {
      setAnchor(key);
      onChange({ from: key, to: key });
    } else {
      setAnchor(null);
      onChange({ from: key < anchor ? key : anchor, to: key < anchor ? anchor : key });
    }
  };

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const firstWeekday = (new Date(view.year, view.month, 1).getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthTitle = new Date(view.year, view.month, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <button
          ref={buttonRef}
          type="button"
          onClick={toggle}
          className={`flex items-center gap-2 bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent ${
            active ? "text-brand-accent" : "text-brand-text"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {label}
        </button>
        {active && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear date filter"
            title="Clear date filter"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-brand-text/60 hover:bg-brand-text/10 hover:text-brand-text"
          >
            ✕
          </button>
        )}
      </div>

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
              maxHeight: pos.maxHeight,
              width: PANEL_WIDTH,
            }}
            className="overflow-y-auto bg-slate-800 border border-brand-text/10 rounded-xl shadow-2xl shadow-black/50 p-3 z-50"
          >
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    const range = p.range();
                    setAnchor(null);
                    onChange(range);
                    const d = new Date((range.from as string) + "T00:00:00");
                    setView({ year: d.getFullYear(), month: d.getMonth() });
                    close();
                  }}
                  className="text-xs px-3 py-1 rounded-full bg-brand-text/10 hover:bg-brand-text/20 text-brand-text"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="w-8 h-8 rounded-lg hover:bg-brand-text/10 text-brand-text flex items-center justify-center"
              >
                ‹
              </button>
              <span className="font-semibold text-brand-text">{monthTitle}</span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="w-8 h-8 rounded-lg hover:bg-brand-text/10 text-brand-text flex items-center justify-center"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-1">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day === null) return <span key={`blank-${i}`} />;
                const key = `${view.year}-${pad(view.month + 1)}-${pad(day)}`;
                const isEdge = key === value.from || key === value.to;
                const inside = active && key > (value.from as string) && key < (value.to as string);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pickDay(key)}
                    className={`h-8 rounded-lg text-sm transition ${
                      isEdge
                        ? "bg-brand-accent text-black font-bold"
                        : inside
                        ? "bg-brand-text/15 text-brand-text"
                        : key === todayKey
                        ? "ring-1 ring-brand-text/40 text-brand-text hover:bg-brand-text/10"
                        : "text-brand-text/80 hover:bg-brand-text/10"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-slate-400">{anchor ? "Now pick the end date" : "Pick a date, then another for a range"}</span>
              {active && (
                <button type="button" onClick={clear} className="text-brand-accent hover:underline">
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
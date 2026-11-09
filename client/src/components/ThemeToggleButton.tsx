import { useTheme } from "../context/ThemeContext";

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type Position = "bottom-left" | "top-right";

const positionClass: Record<Position, string> = {
  "bottom-left": "fixed bottom-4 left-4 md:bottom-6 md:left-6",
  "top-right": "fixed top-4 right-4 md:top-6 md:right-6",
};

// A floating theme toggle for pages with no AccountMenu (public pages, gameplay
// screens). Reads/writes the same shared ThemeContext as AccountMenu's dropdown
// item — this is just a second view onto one per-browser preference. Never synced
// to other users: a student's choice here has no relation to the host's or anyone
// else's, by design (see MASTER CONTEXT: theme is local-only, not Socket.IO state).
export default function ThemeToggleButton({
  position = "bottom-left",
  className = "",
}: {
  position?: Position;
  className?: string;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      title={theme === "dark" ? "Light Mode" : "Dark Mode"}
      className={`${positionClass[position]} ${className} z-40 w-11 h-11 flex items-center justify-center rounded-full border border-brand-text/15 bg-brand-bg/80 backdrop-blur text-brand-text/80 hover:text-brand-text hover:bg-brand-text/10 shadow-lg shadow-black/30 transition`}
    >
      {theme === "dark" ? (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg {...iconProps}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
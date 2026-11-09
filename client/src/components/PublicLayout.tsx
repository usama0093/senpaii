import { Link, Outlet, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
const ThemeToggleButton = lazy(() => import("./ThemeToggleButton"));

const buttonClass =
  "border border-brand-text/30 text-brand-text text-sm md:text-base font-bold px-2.5 py-1.5 md:px-4 md:py-2 whitespace-nowrap transition hover:bg-brand-text hover:text-brand-bg";

// The current page's own button: yellow border, black background, white text, default cursor.
const activeButtonClass =
  "border border-brand-accent text-brand-text text-sm md:text-base font-medium px-2.5 py-1.5 md:px-4 md:py-2 whitespace-nowrap cursor-default";

function isCurrentPage(to: string, pathname: string) {
  if (to === "/join") return pathname === "/" || pathname === "/join";
  return to === pathname;
}

// The top bar for the public pages: Senpaii on the left, fixed-position buttons on the right.
// QOD PIN, Feedback and Game PIN always stay in the same order and position.
// Only the last slot swaps between "Login" and "Register".
//
// On mobile (below md), this stacks instead: Senpaii centered on its own row, then all
// four buttons centered in a single row below it, with smaller padding/text so they fit.
// At md and above, it's exactly the original side-by-side layout.
export default function PublicLayout() {
  const { pathname } = useLocation();

  const lastButton = pathname === "/login" ? { to: "/register", label: "Register" } : { to: "/login", label: "Login" };

  const buttons: { to: string; label: string }[] = [
    { to: "/join-qod", label: "QOD PIN" },
    { to: "/live-feedback", label: "Feedback" },
    { to: "/join", label: "Game PIN" },
    lastButton,
  ];

  return (
    <div className="relative">
      <header className="absolute top-0 left-0 right-0 z-10 flex flex-col md:flex-row items-center md:justify-between gap-3 md:gap-0 px-3 md:px-8 pt-4 pb-3 md:py-5">
        <Link to="/" className="text-2xl md:text-4xl font-extrabold text-brand-accent">
          Senpaii
        </Link>

        <nav className="flex flex-wrap md:flex-nowrap items-center justify-center md:justify-end gap-1.5 md:gap-3 w-full md:w-auto">
          {buttons.map((b) =>
            isCurrentPage(b.to, pathname) ? (
              <span key={b.to} className={activeButtonClass} aria-disabled="true">
                {b.label}
              </span>
            ) : (
              <Link key={b.to} to={b.to} className={buttonClass}>
                {b.label}
              </Link>
            )
          )}
        </nav>
      </header>

      <Outlet />

      <Suspense fallback={null}>
        <ThemeToggleButton position="bottom-left" />
      </Suspense>
    </div>
  );
}
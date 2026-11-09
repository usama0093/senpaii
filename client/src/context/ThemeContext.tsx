import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("senpaii-theme") === "light" ? "light" : "dark"));

  useEffect(() => {
    localStorage.setItem("senpaii-theme", theme);
    document.body.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

// Falls back to "dark" rather than throwing, in case any future component that
// isn't a descendant of AppLayout (e.g. a full-screen editor) ever reuses a
// filter component — safer than crashing the page.
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  return ctx ?? { theme: "dark", toggleTheme: () => {} };
}
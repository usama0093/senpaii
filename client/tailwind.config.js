import colors from "tailwindcss/colors";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral greys instead of Tailwind's blue-tinted "slate".
        // Every bg-slate-*, text-slate-* and hover:bg-slate-* in the app follows this.
       
        // slate: {
        //   ...colors.neutral,
        //   800: "#212121", // inputs and hover
        //   900: "#0d0d0d", // solid panels (looks the same as a glass card on black)
        // },
        // brand: {
        //   bg: "#000000",
        //   accent: "#facc15",
        //   "accent-hover": "#fde047",
        //   error: "#f97316",
        // },

        slate: {
          ...colors.neutral,
          400: "rgb(var(--color-muted) / <alpha-value>)", // secondary/muted text — theme-aware
          500: "rgb(var(--color-muted-2) / <alpha-value>)", // tertiary/dimmer text — theme-aware
          700: "rgb(var(--color-slate-hover) / <alpha-value>)", // secondary hover state — theme-aware
          800: "rgb(var(--color-panel) / <alpha-value>)", // inputs and hover — theme-aware
          900: "rgb(var(--color-panel-solid) / <alpha-value>)", // solid panels — theme-aware
        },
        brand: {
          bg: "rgb(var(--color-bg) / <alpha-value>)",
          text: "rgb(var(--color-text) / <alpha-value>)", // default text + every former white/X border, fill, hover tint
          accent: "rgb(var(--color-accent) / <alpha-value>)",
          "accent-hover": "rgb(var(--color-accent-hover) / <alpha-value>)",
          error: "#f97316",
          correct: "rgb(var(--color-correct) / <alpha-value>)",
          wrong: "rgb(var(--color-wrong) / <alpha-value>)",
        },

      },
    },
  },
  plugins: [],
};
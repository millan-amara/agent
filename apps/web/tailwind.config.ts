import type { Config } from "tailwindcss";

// Design tokens — "calm business cockpit".
// Teal stays the brand (deliberately shifted off WhatsApp's green). Amber means
// ONLY "needs action now". Everything informational stays neutral gray.
// Backward-compatible aliases (primary-dark/-soft, attention, etc.) are kept so
// existing classes keep working while we move onto the fuller scales.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand teal — full tonal ramp. `dark`/`soft` kept as aliases.
        primary: {
          50: "#ECF6F4",
          100: "#D6EBE7",
          200: "#AED7CF",
          300: "#7DBDB2",
          400: "#459C8D",
          500: "#0E7569",
          600: "#0C6359",
          700: "#0A574E",
          800: "#084A43",
          900: "#063A35",
          DEFAULT: "#0E7569",
          dark: "#0A574E",
          soft: "#E5F2F0",
        },
        // Amber — urgent HUMAN action only ("Needs you", escalations). `warning`
        // is the semantic alias used by banners/billing.
        attention: "#D97706",
        attentionSoft: "#FEF3E2",
        // Orange — warm COMMERCE/urgency accent (overdue, trial/payment nudges,
        // brand warmth). Distinct from `attention` so the two never blur.
        accent: {
          DEFAULT: "#F97316",
          deep: "#EA7A1A",
          soft: "#FFF3E8",
        },
        warning: {
          DEFAULT: "#B45309",
          soft: "#FEF3E2",
          fill: "#D97706",
        },
        success: {
          DEFAULT: "#22A06B",
          soft: "#E7F6EF",
        },
        danger: {
          DEFAULT: "#DC2626",
          soft: "#FEECEC",
        },
        // Neutrals
        canvas: "#F7F9F8",
        surface: "#FFFFFF",
        ink: "#17201C",
        muted: "#66736D",
        line: "#E3E9E6",
        "line-strong": "#CBD5D0",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        // One panel radius for the whole app. Tailwind's lg(8)/xl(12)/2xl(16)
        // keep their defaults — reserved for chat bubbles & control pills, never
        // panels, so surfaces stay tight and consistent.
        card: "10px",
      },
      boxShadow: {
        // Quiet depth — only on surfaces that should lift off the canvas.
        card: "0 1px 2px 0 rgb(16 32 28 / 0.04), 0 1px 3px 0 rgb(16 32 28 / 0.05)",
        panel: "0 4px 16px -4px rgb(16 32 28 / 0.10)",
        pop: "0 10px 30px -8px rgb(16 32 28 / 0.18)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};

export default config;

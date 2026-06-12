import type { Config } from "tailwindcss";

// Design tokens from PLAN.md §5 — teal shifted off WhatsApp's hue, amber
// strictly for "needs attention now", thin borders, calm surfaces.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0E7569",
          dark: "#0A574E",
          soft: "#E5F2F0",
        },
        attention: "#D97706",
        attentionSoft: "#FEF3E2",
        success: "#22A06B",
        danger: "#DC2626",
        canvas: "#F7F9F8",
        ink: "#17201C",
        muted: "#66736D",
        line: "#DDE5E1",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "8px",
      },
    },
  },
  plugins: [],
};

export default config;

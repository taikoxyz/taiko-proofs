import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      colors: {
        ink: "#0b0f12",
        slate: "#131a1f",
        card: "#151c21",
        accent: "#f2b84b",
        accentSoft: "#f6d28b",
        mint: "#57d1c9",
        line: "#263038"
      },
      boxShadow: {
        glow: "0 0 50px rgba(242, 184, 75, 0.15)",
        subtle: "0 10px 30px rgba(0,0,0,0.35)"
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui"],
        body: ["var(--font-body)", "system-ui"]
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" }
        }
      },
      animation: {
        "fade-up": "fade-up 600ms ease forwards",
        "pulse-soft": "pulse-soft 6s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;

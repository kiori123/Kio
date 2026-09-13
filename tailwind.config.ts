import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f14",
        panel: "#131a23",
        edge: "#1f2a36",
        muted: "#7d8b9c",
        accent: "#4f8cff",
        good: "#22c55e",
        warn: "#f59e0b",
        gap: "#ef4444",
      },
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        cyan: {
          400: "#22d3ee",
          500: "#06b6d4",
          950: "#082f49",
        },
        brand: {
          dark: "#08090c",
          surface: "#101216",
          border: "#1e222a",
          accent: "#00f0ff",
          green: "#10b981",
          amber: "#f59e0b",
          red: "#ef4444",
          violet: "#8b5cf6"
        }
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "monospace"],
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"]
      }
    },
  },
  plugins: [],
};
export default config;

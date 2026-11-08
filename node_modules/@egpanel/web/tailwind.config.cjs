/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0A0A0B",
        surface: "#111113",
        raised: "#17171A",
        hairline: "#232327",
        foreground: "#EDEDEF",
        muted: "#8B8B94",
        accent: "#3B82F6",
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        console: "#0D0D0F"
      },
      borderRadius: {
        none: "0",
        panel: "8px",
        control: "6px"
      },
      fontFamily: {
        sans: ["Inter", "Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      spacing: {
        sidebar: "220px"
      }
    }
  },
  plugins: []
};

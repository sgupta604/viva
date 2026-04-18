import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        kind: {
          xml: "#4f8edc",
          yaml: "#d17c3f",
          json: "#3fa564",
          ini: "#a86ad1",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

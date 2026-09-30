import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0b0c0e",
          raised: "#131519",
          overlay: "#1a1d23",
        },
        line: "#26292f",
        accent: {
          DEFAULT: "#c9f24d",
          dim: "#a8ce36",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        stage: "0 0 0 1px rgba(255,255,255,0.04), 0 24px 60px -24px rgba(0,0,0,0.8)",
      },
    },
  },
  plugins: [],
};
export default config;

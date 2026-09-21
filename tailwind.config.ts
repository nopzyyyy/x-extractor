import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        x: {
          blue: "#1D9BF0",
          blueHover: "#1A8CD8",
          dark: "#0F1419",
          gray: "#536471",
          lightGray: "#F7F9F9",
          border: "#EFF3F4",
          borderDark: "#2F3336",
          hairline: "#F3F4F6",
          hairlineDark: "#1F2937",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        none: "none",
      },
    },
  },
  plugins: [],
};
export default config;

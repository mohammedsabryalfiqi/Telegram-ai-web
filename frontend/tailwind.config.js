/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f7ff",
          100: "#e0efff",
          200: "#bae0ff",
          300: "#7cc8ff",
          400: "#36a9ff",
          500: "#0c8df0",
          600: "#006fce",
          700: "#0058a6",
          800: "#054b89",
          900: "#0a3f71",
        },
        ink: "#0f172a",
      },
      fontFamily: {
        sans: ["Cairo", "Inter", "Segoe UI", "Tahoma", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12)",
        float: "0 18px 45px -18px rgba(15,23,42,0.25)",
      },
      borderRadius: {
        "2xl": "1.15rem",
        "3xl": "1.6rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: 0, transform: "translateY(6px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%,100%": { opacity: 1 },
          "50%": { opacity: 0.45 },
        },
      },
      animation: {
        "fade-up": "fade-up .28s ease-out both",
        "pulse-soft": "pulseSoft 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

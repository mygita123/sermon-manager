/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Alegreya'", "serif"],
        body: ["'Source Sans 3'", "sans-serif"]
      },
      colors: {
        parchment: {
          50: "#fbf7f0",
          100: "#f5ecdb",
          200: "#edd8b7",
          300: "#e2bf8b",
          400: "#d7a868",
          500: "#c78f4b",
          600: "#a86c39",
          700: "#82502f",
          800: "#5c3823",
          900: "#3a2317"
        },
        ink: {
          500: "#1f2937",
          700: "#111827",
          900: "#0b0f1a"
        }
      },
      boxShadow: {
        lift: "0 20px 50px -25px rgba(15, 23, 42, 0.55)"
      }
    }
  },
  plugins: [require("@tailwindcss/typography")]
};

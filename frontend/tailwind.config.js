/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#fdfcf9',
          100: '#faf8f5',
          200: '#f5f0e8',
          300: '#ede5d8',
          400: '#e2dacd',
        },
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sago-dark': '#1E2225',
        'sago-red': '#8B141A',
        'sago-accent': '#E21C24',
        'sago-bg': '#F8F9FA',
        'sago-gray': '#5D6367'
      }
    },
  },
  plugins: [],
}
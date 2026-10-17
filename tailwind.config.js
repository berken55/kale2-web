/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Lacivert zemin tonları (tanıtım sayfasıyla aynı aile)
        ink: { 950: '#060a15', 900: '#0a1020', 850: '#0e1629', 800: '#131d35', 700: '#1c2a4a', 600: '#2a3b6199' },
        // Ana vurgu rengi: mavi
        brand: { 200: '#bfdcff', 300: '#8cc2ff', 400: '#5aa5ff', 500: '#3d8bff', 600: '#2468d8', 700: '#1a4fa8' },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        sans: ['"Barlow"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

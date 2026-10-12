/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b0d12', 900: '#11141b', 850: '#161a23', 800: '#1c212c', 700: '#272e3d', 600: '#36405399' },
        gold: { 300: '#f3d58a', 400: '#e8bf5a', 500: '#d4a53a', 600: '#a87f22' },
      },
      fontFamily: {
        display: ['"Cinzel"', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
